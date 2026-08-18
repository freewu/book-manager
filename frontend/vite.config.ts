import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['epubjs', 'pdfjs-dist'],
  },
})
