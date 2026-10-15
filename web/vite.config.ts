import { defineConfig } from 'vite';

// base relativo: o build roda de qualquer pasta (GitHub Pages, itch.io, arquivo local via preview).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  server: { port: 5173 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
