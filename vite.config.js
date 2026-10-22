import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { mediaApi } from './server/mediaApi.js'
import { reportsApi } from './server/reportsApi.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), mediaApi(env), reportsApi(env)],
  }
})
