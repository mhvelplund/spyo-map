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
        manualChunks: {
          // Vendor libraries
          vendor: ['react', 'react-dom'],
          maps: ['@googlemaps/react-wrapper', '@googlemaps/markerclusterer'],
          router: ['react-router-dom'],
          database: ['sql.js']
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
    open: true
  },

  // Preview server configuration
  preview: {
    port: 4173,
    open: true
  },

  // Base path for deployment (can be overridden with --base flag)
  base: './',

  // Ensure environment variables are properly handled
  envPrefix: 'VITE_'
})
