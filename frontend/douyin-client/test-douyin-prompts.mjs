#!/usr/bin/env node
/**
 * 抖音业务场景测试 — 测试智能体对抖音获客场景的理解。
 *
 * 测试项:
 *   1. 采集需求理解（自然语言 → 结构化任务）
 *   2. 多轮采集对话
 *   3. 进度汇报格式
 *
 * 用法:
 *   node test-douyin-prompts.mjs
 */

const BASE_URL = 'https://u347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443'
const API = `${BASE_URL}/v1/chat/completions`
const TOKEN = 'ddc54cec5905da1c1b8ea3255c161b66f1456a1df0c5b2dd'
const MODEL = 'openclaw'
const CLIENT_ID = `test-douyin-${Date.now()}`
const SESSION = `agent:main:${CLIENT_ID}`

const PASS = '\x1b[32m✅ PASS\x1b[0m'
const FAIL = '\x1b[31m❌ FAIL\x1b[0m'
let passed = 0, failed = 0

function assert(cond, name) {
  if (cond) { console.log(`  ${PASS} ${name}`); passed++ }
  else      { console.log(`  ${FAIL} ${name}`); failed++ }
}

async function chat(messages) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': SESSION,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 2000, stream: false }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

// ── 流式版 ──
async function chatStream(messages) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'x-openclaw-session-key': SESSION,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 2000, stream: true }),
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', full = ''
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
        const d = JSON.parse(json).choices?.[0]?.delta?.content
        if (d) { full += d; process.stdout.write(d) }
      } catch {}
    }
  }
  return full
}

async function run() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  🎬 抖音获客 — 业务场景测试                ║')
  console.log(`║  session: ${SESSION.slice(0, 40)}...║`)
  console.log('╚══════════════════════════════════════════════╝\n')

  // ═══ Test 1: 采集需求理解 ═══
  console.log('📡 Test 1: 采集需求理解 (非流式)')
  try {
    const r1 = await chat([{
      role: 'user',
      content: '帮我采集100条小龙虾相关的抖音评论，需要包含用户昵称、评论内容、点赞数'
    }])
    console.log(`     回复: ${r1.trim().slice(0, 200)}`)
    assert(r1.length > 20, '返回有意义的内容')
    // 检查是否理解任务结构
    const understandsTask = /评论|采集|小龙虾|视频|搜索/.test(r1)
    assert(understandsTask, '理解抖音评论采集任务')
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 2: 流式输出 ═══
  console.log('\n📡 Test 2: 采集进度对话 (流式)')
  try {
    process.stdout.write('     流式: ')
    const r2 = await chatStream([{
      role: 'user',
      content: '如果用一句话告诉我你会怎么执行上面的采集任务，你会怎么说？'
    }])
    console.log('')
    assert(r2.length > 10, '流式返回非空')
  } catch (e) {
    console.log(`\n  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 3: 多轮上下文 ═══
  console.log('\n📡 Test 3: 上下文保持 — 追问采集细节')
  try {
    // 不重复提"小龙虾"，看 Agent 是否记得上文
    const r3 = await chat([{
      role: 'user',
      content: '对于上面那个采集任务，你预计需要多久完成？分几步？'
    }])
    console.log(`     回复: ${r3.trim().slice(0, 250)}`)
    const remembersContext = /小龙虾|100|评论|采集/.test(r3)
    assert(remembersContext, '记住上文的小龙虾采集任务')
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  // ═══ Test 4: 关键词提取 ═══
  console.log('\n📡 Test 4: 关键词/意图提取')
  try {
    const r4 = await chat([{
      role: 'user',
      content: '帮我在抖音上找50条关于重庆火锅的用户反馈'
    }])
    console.log(`     回复: ${r4.trim().slice(0, 200)}`)
    const hasKeywords = /重庆|火锅|搜索|关键词|采集/.test(r4)
    assert(hasKeywords, '识别"重庆火锅"关键词并制定采集计划')
  } catch (e) {
    console.log(`  ${FAIL} ${e.message}`)
    failed++
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  总计: ${passed + failed} 项, ${PASS} ${passed}, ${failed > 0 ? FAIL + ' ' + failed : ''}`)
  console.log(`${'─'.repeat(50)}\n`)
  if (failed > 0) process.exit(1)
}

run().catch(e => {
  console.error(`\n💥 ${e.message}`)
  process.exit(2)
})
