import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'pdf-lib': ['pdf-lib'],
        }
      }
    },
    chunkSizeWarningLimit: 1000, // 增加塊大小警告限制
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib']
  },
  server: {
    port: 3000, // 或者您想要的任何端口
  },
  preview: {
    port: 4173, // Vite 預覽的默認端口
  },
})