import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Cada archivo de integración levanta su PGlite en memoria: en serie para no agotar la RAM
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
})
