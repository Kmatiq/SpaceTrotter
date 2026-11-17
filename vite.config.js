import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' → relative asset URLs, so the build works under https://<user>.github.io/spaceroam/
export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') }, base: './', plugins: [react()] });
