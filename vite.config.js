import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
          @import "@/styles/variables.scss";
          @import "~bootstrap/scss/bootstrap";
        `,
        sassOptions: {
          quietDeps: true,
        },
      },
      
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'pdf-lib': ['pdf-lib'],
          'bootstrap': ['bootstrap'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib', 'bootstrap']
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 4173,
  },
})