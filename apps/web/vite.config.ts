import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ mode }) => {
  // Read the workspace .env for ports; never inject server secrets into client code.
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    worker: { format: 'es' },
    resolve: {
      alias: [
        {
          find: /^onnxruntime-web(?:\/webgpu)?$/,
          replacement: fileURLToPath(
            new URL('../../node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url),
          ),
        },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.WEB_PORT || env.WEB_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${process.env.API_PORT || env.API_PORT || process.env.PORT || env.PORT || 3001}`,
      },
    },
    build: { outDir: '../../dist', emptyOutDir: true },
  };
});
