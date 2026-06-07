import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        base: env.VITE_BASE_PATH || '/',
        plugins: [react()],
        build: {
            chunkSizeWarningLimit: 900,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('maplibre-gl')) {
                            return 'maplibre-gl';
                        }
                        if (id.includes('recharts')) {
                            return 'recharts';
                        }
                        if (id.includes('node_modules')) {
                            return 'vendor';
                        }
                    },
                },
            },
        },
        server: {
            port: 5173,
        },
        test: {
            environment: 'jsdom',
            setupFiles: './src/tests/setup.ts',
            globals: true,
        },
    };
});
