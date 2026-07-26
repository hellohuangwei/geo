import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { exec } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function openEdgeDevTools() {
  return {
    name: 'open-edge-devtools',
    configureServer(server: ViteDevServer) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer!.address() as { port: number }
        const port = addr.port
        exec(`start msedge --remote-debugging-port=9222 --auto-open-devtools-for-tabs http://localhost:${port}`)
      })
    },
  }
}

// ── Bridge 配置 ──

const BRIDGE_SERVER = 'ws://localhost:6008/ws'
const BRIDGE_TOKEN  = 'openclaw-browser-bridge'
const BRIDGE_LOCAL_PORT = 9603

/** 直接在 Vite 进程内运行 BridgeSDK，不 spawn 子进程 */
function browserBridgePlugin() {
  let bridge: any = null

  return {
    name: 'browser-bridge',
    apply: 'serve' as const,

    async configureServer(server: ViteDevServer) {
      server.httpServer?.once('listening', async () => {
        try {
          // 动态导入 bridge 模块（和 Vite 在同一个 Node 进程）
          const bridgePath = path.resolve(__dirname, 'douyin-client', 'bridge.mjs')
          const mod = await import(pathToFileURL(bridgePath).href)
          const { BridgeSDK } = mod

          console.log(`\n[browser-bridge] 启动 BridgeSDK (内联模式)`)
          console.log(`[browser-bridge] relay: ${BRIDGE_SERVER}`)
          console.log(`[browser-bridge] local: ws://127.0.0.1:${BRIDGE_LOCAL_PORT}\n`)

          bridge = new BridgeSDK({
            server: BRIDGE_SERVER,
            token: BRIDGE_TOKEN,
            localPort: BRIDGE_LOCAL_PORT,
            verbose: true,
            onReady: (data: any) => {
              console.log(`[browser-bridge] ✅ 就绪 (login=${data.loginOk})`)
            },
            onLoginRequired: () => {
              console.log(`[browser-bridge] ⚠️ 抖音未登录`)
            },
          })

          await bridge.start()
        } catch (err: any) {
          console.error(`[browser-bridge] ❌ 启动失败: ${err.message}`)
          console.error(err.stack)
        }
      })

      server.httpServer?.once('close', async () => {
        if (bridge) {
          console.log(`[browser-bridge] 停止 Bridge...`)
          await bridge.stop()
          bridge = null
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), openEdgeDevTools(), browserBridgePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://127.0.0.1:6006',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../src/main/resources/static',
    emptyOutDir: true,
  },
})
