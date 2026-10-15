import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * O Vite serve só a interface. Tudo que começa com /api e /webhook é
 * repassado para o servidor Node (porta 8787), que fala com o WhatsApp e
 * com a API do Claude. Assim, em desenvolvimento, a tela recarrega sozinha
 * sem derrubar o atendimento.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // eventos em tempo real (SSE) não podem ser bufferizados
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform'
            }
          })
        },
      },
      '/webhook': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
