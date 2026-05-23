/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/vnoi-resolver/',
  build: {
    outDir: 'build'
  },
  server: {
    port: 3000,
    open: true
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
});
