import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      copyPublicDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          tienda: path.resolve(__dirname, 'tienda-v2.html'),
        },
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
          },
        },
      },
    },
    publicDir: 'public',
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
