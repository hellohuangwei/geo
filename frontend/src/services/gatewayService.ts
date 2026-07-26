/**
 * Gateway 流式聊天服务 — 浏览器端。
 *
 * 对接 Gateway Server 的 OpenAI 兼容 API (/v1/chat/completions)，
 * 通过 SSE 流式返回 AI 回复。零 Node 依赖，纯 fetch + ReadableStream。
 *
 * 用法:
 *   import { chatStream } from '@/services/gatewayService'
 *
 *   await chatStream(
 *     [{ role: 'user', content: '分析这个客户' }],
 *     {
 *       onToken: (delta, full) => setUI(full),
 *       clientId: 'pc-sales-1',
 *     }
 *   )
 */

// ── 配置（与 gateway-client.mjs 保持一致） ──

// 通过 vite proxy 转发，避免浏览器 CORS 限制
const API = '/v1/chat/completions'

// Token 从 Vite 环境变量读取，需要在 .env.local 中配置 VITE_GATEWAY_TOKEN
const TOKEN: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GATEWAY_TOKEN) ||
  ''

if (!TOKEN) {
  console.warn('[gateway] ⚠️ VITE_GATEWAY_TOKEN 未设置，Gateway API 调用将失败。请在 frontend/.env.local 中配置。')
}

const MODEL = 'openclaw'
const DEFAULT_TIMEOUT_MS = 300_000  // 5分钟，采集任务需要多轮 DeepSeek + MCP + 浏览器操作

// ── 类型 ──

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface StreamOptions {
  /** 每收到一个 token 时回调 */
  onToken: (delta: string, fullText: string) => void
  /** 工具调用完成时回调（LLM 请求调用工具） */
  onToolCall?: (toolCall: ToolCall) => void
  /** 可用工具列表（OpenAI function calling 格式） */
  tools?: Tool[]
  /** 客户端标识，用于服务端会话隔离（必须传，否则多轮对话上下文丢失） */
  clientId: string
  /** 会话 key，相同 key 的请求共享上下文。不传则自动用 clientId 生成 */
  sessionKey?: string
  /** 超时毫秒数，默认 120000 */
  timeout?: number
}

// ── 核心 ──

/**
 * 流式聊天 — 发送消息列表，逐 token 回调，返回完整文本。
 *
 * 服务端返回标准 OpenAI SSE 流:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
export async function chatStream(
  messages: { role: string; content: string }[],
  options: StreamOptions,
): Promise<string> {
  const { onToken, onToolCall, tools, clientId, sessionKey, timeout = DEFAULT_TIMEOUT_MS } = options

  // sessionKey 为空时自动用 clientId 构造，确保会话上下文不丢失
  const effectiveSessionKey = sessionKey || `agent:main:${clientId}`

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'x-openclaw-session-key': effectiveSessionKey,
  }

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: 2000,
    stream: true,
  }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res: Response
  try {
    console.log('[gateway] fetch →', API, 'session:', effectiveSessionKey, tools?.length ? `tools:${tools.length}` : '')
    res = await fetch(API, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    console.log('[gateway] 响应 HTTP', res.status)
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new Error(`请求超时 (${timeout / 1000}s)`)
    }
    throw new Error(`网络错误: ${err.message}`)
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => '')
    throw new Error(`Gateway ${res.status}: ${errText || res.statusText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timer)
    throw new Error('浏览器不支持流式读取 (ReadableStream)')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  // tool_calls 累积（按 index 分组）
  const toolCallAcc: Map<number, { id: string; type: string; name: string; args: string }> = new Map()

  try {
    console.log('[gateway] 开始读取 SSE 流...')
    let chunkCount = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[gateway] 流读取完毕, 共收到 chunk:', chunkCount, '完整长度:', fullContent.length)
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // 最后一行可能不完整

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6).trim()
        if (json === '[DONE]') continue

        try {
          const chunk = JSON.parse(json)
          const delta = chunk.choices?.[0]?.delta

          // 文本内容
          const content: string | undefined = delta?.content
          if (content) {
            fullContent += content
            chunkCount++
            onToken(content, fullContent)
          }

          // 工具调用（流式累积）
          const toolCalls: Array<{
            index?: number
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }> | undefined = delta?.tool_calls
          if (toolCalls && onToolCall) {
            for (const tc of toolCalls) {
              const idx = tc.index ?? 0
              if (!toolCallAcc.has(idx)) {
                toolCallAcc.set(idx, { id: '', type: 'function', name: '', args: '' })
              }
              const acc = toolCallAcc.get(idx)!
              if (tc.id) acc.id = tc.id
              if (tc.type) acc.type = tc.type
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) acc.args += tc.function.arguments

              // 当 args 看起来完整时（以 } 结尾且能解析为 JSON），触发回调
              const trimmed = acc.args.trim()
              if (acc.id && acc.name && trimmed.endsWith('}')) {
                try {
                  JSON.parse(trimmed) // 验证 JSON 完整性
                  onToolCall({
                    id: acc.id,
                    type: 'function',
                    function: { name: acc.name, arguments: trimmed },
                  })
                  toolCallAcc.delete(idx)
                } catch {
                  // args 还没收完，继续等
                }
              }
            }
          }
        } catch (parseErr) {
          console.warn('[gateway] SSE line parse error:', parseErr)
        }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
  }

  return fullContent
}
