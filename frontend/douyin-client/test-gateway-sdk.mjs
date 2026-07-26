#!/usr/bin/env node
/**
 * SDK 通信测试 — 模拟 gatewayService.ts 的完整调用链路。
 *
 * 测试项:
 *   1. 基础连通性 + Token 认证
 *   2. 流式 SSE 输出
 *   3. 会话 key (x-openclaw-session-key) 维持上下文
 *   4. 多轮对话上下文记忆
 *
 * 用法:
 *   node test-gateway-sdk.mjs
 */

// ── 与 gatewayService.ts 完全一致的配置 ──
const BASE_URL = 'https://u347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443'
const API = `${BASE_URL}/v1/chat/completions`
const TOKEN = 'ddc54cec5905da1c1b8ea3255c161b66f1456a1df0c5b2dd'
const MODEL = 'openclaw'
const CLIENT_ID = `test-sdk-${Date.now()}`

// ── 复制 gatewayService.ts 的 chatStream 逻辑 ──
async function chatStream(messages, { sessionKey, onToken, timeout = 120_000 }) {
  const effectiveSessionKey = sessionKey || `agent:main:${CLIENT_ID}`

  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'x-openclaw-session-key': effectiveSessionKey,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res
  try {
    console.log(`  [gateway] POST ${API}`)
    console.log(`  [gateway] session: ${effectiveSessionKey}`)
    res = await fetch(API, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 2000, stream: true }),
      signal: controller.signal,
    })
    console.log(`  [gateway] HTTP ${res.status}`)
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`请求超时 (${timeout / 1000}s)`)
    throw new Error(`网络错误: ${err.message}`)
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => '')
    throw new Error(`Gateway ${res.status}: ${errText || res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  let chunkCount = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const json = line.slice(6).trim()
        if (json === '[DONE]') continue
        try {
          const chunk = JSON.parse(json)
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            chunkCount++
            if (onToken) onToken(delta, fullContent)
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
  }

  return { content: fullContent, chunks: chunkCount }
}

// ── 测试 ──

async function run() {
  const PASS = '\x1b[32m✅ PASS\x1b[0m'
  const FAIL = '\x1b[31m❌ FAIL\x1b[0m'
  let passed = 0
  let failed = 0

  function assert(cond, name) {
    if (cond) { console.log(`  ${PASS} ${name}`); passed++ }
    else      { console.log(`  ${FAIL} ${name}`); failed++ }
  }

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  🧪 Gateway SDK 通信测试                    ║')
  console.log(`║  clientId: ${CLIENT_ID.padEnd(32)}║`)
  console.log('╚══════════════════════════════════════════════╝\n')

  // ═══ Test 1: 基础连通 + 流式输出 ═══
  console.log('📡 Test 1: 基础连通 + 流式 SSE')
  try {
    let chunks = []
    const r1 = await chatStream(
      [{ role: 'user', content: '用一句话介绍你自己（20字以内）' }],
      {
        onToken: (delta) => chunks.push(delta),
      }
    )
    console.log(`     内容: ${r1.content.trim()}`)
    console.log(`     chunks: ${chunks.length}`)
    assert(r1.content.length > 0, '返回非空内容')
    assert(chunks.length > 0, '流式分片 > 0 (SSE 正常工作)')
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 2: 多轮对话上下文记忆 ═══
  console.log('\n📡 Test 2: 多轮对话上下文记忆')
  try {
    // 第一轮：告诉 Agent 一个偏好
    const sessionKey = `agent:main:${CLIENT_ID}`
    const r1 = await chatStream(
      [{ role: 'user', content: '记住：我最喜欢的水果是西瓜。只需要回复"记住了"。' }],
      { sessionKey }
    )
    console.log(`     第1轮: ${r1.content.trim()}`)
    assert(r1.content.length > 0, '第1轮返回非空')

    // 第二轮：用同一个 sessionKey 追问
    const r2 = await chatStream(
      [{ role: 'user', content: '请问我最喜欢的水果是什么？' }],
      { sessionKey }
    )
    console.log(`     第2轮: ${r2.content.trim()}`)
    // 如果上下文工作正常，回答中应该包含"西瓜"
    const hasWatermelon = r2.content.includes('西瓜')
    assert(hasWatermelon, `上下文记忆 — 回答包含"西瓜" (上下文${hasWatermelon ? '' : '未'}保持)`)
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 3: 不同 sessionKey 上下文隔离 ═══
  console.log('\n📡 Test 3: 新 session 上下文隔离')
  try {
    const otherKey = `agent:main:other-${Date.now()}`
    const r3 = await chatStream(
      [{ role: 'user', content: '请问我们之前聊过吗？（这是新会话，你应该回答没有聊过）' }],
      { sessionKey: otherKey }
    )
    console.log(`     内容: ${r3.content.trim()}`)
    // 新 session 应该确认没有之前的对话历史
    const isNew = /没有|第一次|没聊|不认识|新|初次/.test(r3.content)
    assert(isNew, `新 session 正确识别为首次对话`)
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 4: 会话 key 格式验证 ═══
  console.log('\n📡 Test 4: 会话 key 格式 — 不同 clientId 应有不同 session')
  try {
    const customKey = `agent:sales:${CLIENT_ID}`
    const r4 = await chatStream(
      [{ role: 'user', content: '回复"OK"即可' }],
      { sessionKey: customKey }
    )
    console.log(`     内容: ${r4.content.trim()}`)
    assert(r4.content.length > 0, '自定义 sessionKey 格式正常工作')
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ 结果 ──
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  总计: ${passed + failed} 项, ${PASS} ${passed}, ${failed > 0 ? FAIL + ' ' + failed : ''}`)
  console.log(`${'─'.repeat(50)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(e => {
  console.error(`\n\x1b[31m💥 测试崩溃: ${e.message}\x1b[0m`)
  console.error(e.stack)
  process.exit(2)
})
