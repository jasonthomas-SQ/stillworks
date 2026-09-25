/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so the base path must match
// when the build runs inside GitHub Actions. Locally it stays at the root.
const repoName = 'stillworks';
const base = process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
