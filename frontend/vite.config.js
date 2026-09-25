import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cesium()
  ],
  server: {
    port: 5173,
    open: false,
    // Exclude runtime-generated data directories from Vite's hot-reload watcher.
    // The backend writes Zarr chunks and NetCDF files to output/ during fetches.
    // Without this, those filesystem writes trigger unnecessary frontend reloads.
    // Note: "watchfiles.main: changes detected" is a BACKEND (uvicorn/watchfiles)
    // message — it is not a Copernicus error.
    watch: {
      ignored: [
        '**/backend/output/**',
        '**/*.zarr/**',
        '**/*.nc',
        '**/*.nc.tmp',
        '**/user_uploads/**',
        '**/__pycache__/**',
        '**/*.pyc',
      ],
    },
  },
});
