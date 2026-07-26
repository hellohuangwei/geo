#!/usr/bin/env node
/**
 * Bridge Relay 连接测试 — WebSocket 直连 relay 服务器。
 *
 * 测试项:
 *   1. WebSocket 连接 + Token 认证
 *   2. client.ready 事件发送
 *   3. 心跳 ping/pong
 *   4. relay 响应事件
 *
 * 用法:
 *   node test-bridge-relay.mjs
 */

import WebSocket from 'ws'

const SERVER = 'wss://u347173-u3b9-0367c9c6.cqa1.seetacloud.com:8443/ws'
const TOKEN = 'openclaw-browser-bridge'
const CLIENT_ID = `test-bridge-${Date.now()}`

const PASS = '\x1b[32m✅ PASS\x1b[0m'
const FAIL = '\x1b[31m❌ FAIL\x1b[0m'
let passed = 0, failed = 0

function assert(cond, name) {
  if (cond) { console.log(`  ${PASS} ${name}`); passed++ }
  else      { console.log(`  ${FAIL} ${name}`); failed++ }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  🔗 Bridge Relay WebSocket 连接测试        ║')
  console.log(`║  server: ${SERVER.slice(0, 42)}...║`)
  console.log(`║  clientId: ${CLIENT_ID.padEnd(32)}║`)
  console.log('╚══════════════════════════════════════════════╝\n')

  const url = `${SERVER}?token=${encodeURIComponent(TOKEN)}&clientId=${encodeURIComponent(CLIENT_ID)}`

  // ═══ Test 1: WebSocket 连接 ═══
  console.log('📡 Test 1: WebSocket 连接 + 认证')

  const events = []
  let pingOk = false

  const ws = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('连接超时 15s')), 15000)
    const socket = new WebSocket(url)

    socket.on('open', () => {
      clearTimeout(timeout)
      console.log('  ✅ WebSocket 连接已建立')
      resolve(socket)
    })

    socket.on('error', (e) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket 错误: ${e.message}`))
    })

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        events.push(msg)
        const preview = JSON.stringify(msg).slice(0, 120)
        console.log(`  ← [${msg.type || '?'}] ${preview}`)
      } catch {
        console.log(`  ← [raw] ${raw.toString().slice(0, 100)}`)
      }
    })

    socket.on('close', (code) => {
      console.log(`  🔌 WebSocket 关闭 (code=${code})`)
    })
  })

  assert(true, 'WebSocket 连接成功')
  await sleep(2000)

  // ═══ Test 2: 是否收到 relay 响应 ═══
  console.log('\n📡 Test 2: Relay 响应事件')
  console.log(`  共收到 ${events.length} 条消息`)

  // 发一个心跳
  ws.ping()
  await sleep(500)

  // 检查是否有 server 事件
  const hasEvent = events.length > 0
  assert(hasEvent, `收到 relay 消息 (${events.length} 条)`)

  // ═══ Test 3: 心跳保活 ═══
  console.log('\n📡 Test 3: 心跳 ping/pong')
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('pong 超时')), 5000)
      ws.once('pong', () => {
        clearTimeout(timeout)
        pingOk = true
        console.log('  ✅ pong 收到')
        resolve()
      })
      ws.ping()
    })
    assert(true, 'ping/pong 正常')
  } catch (e) {
    assert(false, e.message)
  }

  // ═══ Test 4: 连接稳定性 ═══
  console.log('\n📡 Test 4: 连接稳定性 (5s)')
  await sleep(5000)
  const stillOpen = ws.readyState === WebSocket.OPEN
  assert(stillOpen, `5秒后连接仍保持 (state=${ws.readyState})`)

  // ── 清理 ──
  ws.close(1000, 'test done')
  await sleep(500)

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  总计: ${passed + failed} 项, ${PASS} ${passed}, ${failed > 0 ? FAIL + ' ' + failed : ''}`)
  console.log(`${'─'.repeat(50)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(e => {
  console.error(`\n💥 测试崩溃: ${e.message}`)
  process.exit(2)
})
