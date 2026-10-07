/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // The 3D dice libraries are only imported lazily; pre-bundle them so the dev server doesn't discover them
  // mid-session and reload every open page (which drops in-flight realtime messages).
  optimizeDeps: { include: ['three', '@dimforge/rapier3d-compat'] },
  test: {
    include: ['src/**/*.test.ts', 'tests/db/**/*.test.ts'],
  },
})
