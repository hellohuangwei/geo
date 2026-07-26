import { create } from 'zustand'
import type { ChatMessage } from '@/types/douyinChat'
import { chatStream } from '@/services/gatewayService'
import type { Tool, ToolCall } from '@/services/gatewayService'

const BRIDGE_WS = 'ws://localhost:9603'

const COLLECT_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'collect_douyin_comments',
    description: 'Collect Douyin comments. Call this when user asks to collect/scrape/search Douyin comments by keyword.',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword' },
        count: { type: 'integer', description: 'Target count, default 100', default: 100 },
        timeRange: { type: 'string', description: 'Optional time range' },
      },
      required: ['keyword', 'count'],
    },
  },
}

const SYSTEM_PROMPT = `You are a Douyin data collection assistant. Understand user intent and call collect_douyin_comments tool.

Rules:
- Extract the core search keyword from user message
- Extract count from user message, default 100
- Do NOT make up keywords
- If user is just chatting, reply normally without calling the tool`

export interface ProgressEntry {
  id: string
  text: string
  level: 'info' | 'success' | 'warn' | 'error'
  ts: number
}

function mid(): string { return crypto.randomUUID() }
function makeMsg(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: mid(), role, content, timestamp: Date.now() }
}

function buildHistory(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'agent') && m.content.trim())
    .map((m) => ({
      role: m.role === 'agent' ? 'assistant' : 'user',
      content: m.content,
    }))
}

export interface DouyinChatState {
  messages: ChatMessage[]
  isSending: boolean
  streamingContent: string
  clientId: string
  cdpReady: boolean
  bridgeConnected: boolean
  douyinLoggedIn: boolean
  relayConnected: boolean
  progressMessages: ProgressEntry[]

  sendMessage: (text: string) => Promise<void>
  clearChat: () => void
  connectBridge: () => () => void
}

export const useDouyinChatStore = create<DouyinChatState>((set, get) => ({
  messages: [],
  isSending: false,
  streamingContent: '',
  clientId: `web-${crypto.randomUUID().slice(0, 8)}`,
  cdpReady: false,
  bridgeConnected: false,
  douyinLoggedIn: false,
  relayConnected: false,
  progressMessages: [],

  sendMessage: async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || get().isSending) return

    const userMsg = makeMsg('user', trimmed)
    const statusMsg = makeMsg('system', 'Analyzing request...')

    set({
      messages: [...get().messages, userMsg, statusMsg],
      isSending: true,
      streamingContent: '',
      progressMessages: get().progressMessages.filter(
        (p) => p.text.includes('CDP') || p.text.includes('Bridge') || p.text.includes('Login')
      ),
    })

    const cdpOk = get().cdpReady
    const bridgeOk = get().bridgeConnected
    const loginOk = get().douyinLoggedIn
    const addP = (text: string, level: ProgressEntry['level'] = 'info') => {
      set((s) => ({
        progressMessages: [
          ...s.progressMessages,
          { id: crypto.randomUUID(), text, level, ts: Date.now() },
        ].slice(-200),
      }))
    }

    if (!cdpOk) addP('CDP not connected, collection unavailable', 'warn')
    if (!bridgeOk) addP('Bridge not connected, check browser', 'warn')
    if (!loginOk && cdpOk) addP('Douyin not logged in', 'warn')

    addP('Sending to agent...', 'info')

    const history = buildHistory(get().messages)
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
    ]

    let collectionTriggered = false

    try {
      set((s) => ({
        messages: s.messages.filter((m) => m.content !== 'Analyzing request...'),
      }))

      // ── 本地意图解析：不走 Gateway，直接触发 Bridge 采集 ──
      const countMatch = trimmed.match(/(\d+)\s*(?:条|个|篇|则)/)
      const hasIntent = /collect|find|search|get|comment|采集|找|搜|收集|评论|帮我/.test(trimmed)

      if (countMatch || hasIntent) {
        const count = countMatch ? parseInt(countMatch[1]) : 100
        const keyword = trimmed
          .replace(/collect|find|search|get|help|me|comments|for|采集|找|搜|收集|帮我|条|的|评论|相关|一些|一下|多少|\d+/g, '')
          .trim().slice(0, 15) || trimmed.slice(0, 10)
        addP(`Starting collection: ${count} x "${keyword}"`, 'info')
        collectionTriggered = true

        const collectWs = new WebSocket(BRIDGE_WS)
        collectWs.onopen = () => {
          collectWs.send(JSON.stringify({ type: 'startTask', keyword, targetCount: count }))
          addP(`Sent to Bridge: ${keyword} x ${count}`, 'info')
        }
        collectWs.onmessage = (e) => {
          console.log('[DEBUG sendMessage] collectWs received:', e.data.slice(0, 300));
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'taskCompleted' && msg.status === 'done' && msg.comments?.length) {
              console.log('[DEBUG sendMessage] taskCompleted matched, comments:', msg.comments.length);
              const comments = msg.comments
              const keyword = msg.keyword || ''
              const rows = comments.slice(0, 20).map((c: Record<string, unknown>) => {
                const vUrl = String(c.videoUrl || '')
                const uId = String(c.douyinId || '')
                const uUrl = uId ? `https://www.douyin.com/user/${uId}` : ''
                const time = String(c.publishedAt || '').slice(0, 10)
                const userName = uUrl ? `[${c.nickname || '-'}](${uUrl})` : (c.nickname || '-')
                const content = String(c.content || '').slice(0, 80)
                const videoLink = vUrl ? `[📹](${vUrl})` : '-'
                return `| ${userName} | ${content} | ${time} | ${videoLink} | 👍${c.likes || 0} |`
              }).join('\n')
              const table = `### ${keyword} (${comments.length} comments)\n\n| User | Content | Time | Video | Likes |\n|------|---------|------|-------|-------|\n${rows}`
              console.log('[DEBUG sendMessage] before set, current messages count:', get().messages.length);
              set((s) => ({ messages: [...s.messages, makeMsg('system', table)] }))
              console.log('[DEBUG sendMessage] after set, new messages count:', get().messages.length);
              addP(`Collected ${comments.length} comments for "${keyword}"`, 'success')
              collectWs.close()
            }
          } catch {}
        }
        setTimeout(() => { if (collectWs.readyState === 1) collectWs.close() }, 180000)
      } else {
        // 非采集请求，尝试走 Gateway
        try {
          addP('Connected to agent, waiting...', 'info')
          const history = buildHistory(get().messages)
          await chatStream(
            [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
            {
              clientId: get().clientId,
              tools: [COLLECT_TOOL],
              onToken: (_delta: string, fullText: string) => {
                set({ streamingContent: fullText })
              },
              onToolCall: (toolCall: ToolCall) => {
                if (toolCall.function.name === 'collect_douyin_comments') {
                  let params: { keyword?: string; count?: number } = {}
                  try { params = JSON.parse(toolCall.function.arguments) } catch {}
                  const kw = params.keyword || trimmed.slice(0, 15)
                  const cnt = params.count || 100
                  addP(`Agent triggered: ${cnt} x "${kw}"`, 'info')
                  collectionTriggered = true
                  try {
                    const bws = new WebSocket(BRIDGE_WS)
                    bws.onopen = () => { bws.send(JSON.stringify({ type: 'startTask', keyword: kw, targetCount: cnt })); bws.close() }
                    setTimeout(() => { if (bws.readyState === WebSocket.CONNECTING) bws.close() }, 3000)
                  } catch {}
                }
              },
            }
          )
        } catch {
          addP('Agent unavailable, using local mode', 'warn')
        }
      }

      const finalText = get().streamingContent

      // Rule fallback when LLM didn't trigger tool call
      if (!collectionTriggered) {
        const countMatch = trimmed.match(/(\d+)\s*(?:条|个|篇|则)/)
        const hasIntent = /collect|find|search|get|comment|采集|找|搜|收集|评论/.test(trimmed)
        if (countMatch || hasIntent) {
          const count = countMatch ? parseInt(countMatch[1]) : 100
          const keyword = trimmed.replace(/collect|find|search|get|help|me|comments|for|采集|找|搜|收集|帮我|条|的|评论|相关/g, '').trim().slice(0, 15)
          addP(`Rule fallback: ${count} x "${keyword}"`, 'warn')
          collectionTriggered = true
          try {
            const bridgeWs = new WebSocket(BRIDGE_WS)
            bridgeWs.onopen = () => {
              bridgeWs.send(JSON.stringify({ type: 'startTask', keyword, targetCount: count }))
              bridgeWs.close()
            }
            setTimeout(() => { if (bridgeWs.readyState === WebSocket.CONNECTING) bridgeWs.close() }, 3000)
          } catch {}
        }
      }

      if (collectionTriggered) {
        addP('Task started, waiting for results...', 'info')
        if (finalText.trim()) {
          set({ messages: [...get().messages, makeMsg('agent', finalText)] })
        }
        set({ streamingContent: '', isSending: false })
      } else if (finalText.trim()) {
        addP('Agent response complete', 'success')
        set({
          messages: [...get().messages, makeMsg('agent', finalText)],
          streamingContent: '',
          isSending: false,
        })
      } else {
        addP('Agent returned empty content', 'error')
        set({
          messages: [...get().messages, makeMsg('error', 'Agent returned empty content. Check gateway service.')],
          streamingContent: '',
          isSending: false,
        })
      }
    } catch (err) {
      console.error('[chat] sendMessage failed:', err)
      const errMsg = err instanceof Error ? err.message : 'Request failed'
      addP(`Request failed: ${errMsg}`, 'error')
      set({
        messages: [...get().messages, makeMsg('error', errMsg)],
        streamingContent: '',
        isSending: false,
      })
    }
  },

  clearChat: () => set({ messages: [], progressMessages: [], streamingContent: '', isSending: false }),

  connectBridge: () => {
    if (get().bridgeConnected) {
      return () => {}
    }

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    function addProgress(text: string, level: ProgressEntry['level'] = 'info') {
      set((s) => ({
        progressMessages: [
          ...s.progressMessages,
          { id: crypto.randomUUID(), text, level, ts: Date.now() },
        ].slice(-200),
      }))
    }

    addProgress('Connecting to Bridge...', 'info')
    connectWs()
    function connectWs() {
      if (stopped) return
      try {
        ws = new WebSocket(BRIDGE_WS)
        ws.onopen = () => {
          set({ bridgeConnected: true })
          addProgress('Bridge connected', 'success')
          ws!.send(JSON.stringify({ type: 'getStatus' }))
        }
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'taskCompleted' || msg.type === 'taskProgress') {
              console.log('[DEBUG connectBridge] received:', msg.type, msg.status, msg.comments?.length);
            }
            switch (msg.type) {
              case 'bridge_status':
                set({
                  bridgeConnected: true,
                  relayConnected: msg.relayConnected || false,
                  douyinLoggedIn: msg.douyinLoggedIn || false,
                  cdpReady: msg.browserConnected || get().cdpReady,
                })
                if (msg.relayConnected && !get().relayConnected) {
                  addProgress('Relay connected', 'success')
                }
                break

              case 'loginRequired':
                set({ douyinLoggedIn: false })
                addProgress('Douyin not logged in, please login at douyin.com', 'warn')
                break

              case 'loginDone':
                set({ douyinLoggedIn: true })
                addProgress('Douyin logged in', 'success')
                break

              case 'taskProgress': {
                const { keyword, phase, message, collected } = msg
                const info = [`[${keyword || 'task'}] ${phase || ''}`, message || ''].filter(Boolean).join(': ')
                const suffix = collected !== undefined ? ` (${collected})` : ''
                addProgress(`${info}${suffix}`, 'info')
                break
              }

              case 'taskCompleted': {
                const { keyword, total, status, summary } = msg
                if (status === 'done') {
                  const parts = [`${keyword}: done`, `${total || '?'} comments`]
                  if (summary?.uniqueUsers) parts.push(`${summary.uniqueUsers} users`)
                  addProgress(parts.join(', '), 'success')
                } else if (status === 'error') {
                  addProgress(`${keyword}: failed`, 'error')
                } else {
                  addProgress(`${keyword}: ${status}`, 'warn')
                }
                break
              }

              case 'relayConnected':
                set({ relayConnected: true })
                addProgress('Relay connected', 'success')
                break

              case 'relayDisconnected':
                set({ relayConnected: false })
                addProgress('Relay disconnected, reconnecting...', 'warn')
                break

              case 'error':
                addProgress(`Error: ${msg.message || 'unknown'}`, 'error')
                break
            }
          } catch (err) {
            console.warn('[bridge] message parse error:', err)
          }
        }
        ws.onclose = () => {
          set({ bridgeConnected: false, relayConnected: false })
          if (!stopped) reconnectTimer = setTimeout(connectWs, 3000)
        }
        ws.onerror = () => {
          console.error('[bridge] WebSocket connection error')
        }
      } catch (e) {
        console.warn('[bridge] WebSocket connect failed:', e, 'retrying in 5s')
        if (!stopped) reconnectTimer = setTimeout(connectWs, 5000)
      }
    }

    return () => {
      stopped = true
      ws?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  },
}))
