import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' → relative asset URLs, so the build works under https://<user>.github.io/spaceroam/
export default defineConfig({ base: './', plugins: [react()] });
