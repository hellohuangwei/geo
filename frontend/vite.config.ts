import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { exec } from 'child_process'

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

export default defineConfig({
  plugins: [react(), tailwindcss(), openEdgeDevTools()],
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
    },
  },
  build: {
    outDir: '../src/main/resources/static',
    emptyOutDir: true,
  },
})
