import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js alone is ~500 kB minified; it is lazy-loaded only by the player route.
    chunkSizeWarningLimit: 700,
  },
});
