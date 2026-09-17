import { defineConfig } from 'vite';
export default defineConfig({
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: { lottie: ['lottie-web/build/player/lottie_light'], canvas: ['konva', 'react-konva'], react: ['react', 'react-dom'] } } } },
});
