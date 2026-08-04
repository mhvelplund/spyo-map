import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Production build optimizations
  build: {
    // Output directory for production build
    outDir: 'dist',

    // Generate source maps for debugging
    sourcemap: true,

    // Minify the output
    minify: 'terser',

    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom)[\\/]/.test(id)) return 'vendor'
          if (/[\\/](leaflet|react-leaflet)[\\/]/.test(id)) return 'leaflet'
          if (/[\\/]react-router[\\/]/.test(id)) return 'router'
        },

        // Asset file naming for better caching
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || [];
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || '')) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext || '')) {
            return `assets/css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },

        // JS chunk naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    },

    // Target modern browsers for better optimization
    target: 'es2020',

    // Increase chunk size warning limit for maps
    chunkSizeWarningLimit: 1000
  },

  // Development server configuration
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },

  // Preview server configuration
  preview: {
    port: 4173,
    open: true
  },

  // The Worker serves the SPA from the site root.
  base: '/',

  // Ensure environment variables are properly handled
  envPrefix: 'VITE_'
})
