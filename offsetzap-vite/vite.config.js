import { defineConfig } from 'vite';

export default defineConfig({
  // Base public path when served in development or production
  base: './',
  
  // Configure server options
  server: {
    // Enable HMR (Hot Module Replacement)
    hmr: true,
    // Serve the HTML file from the root
    open: '/across-retirement-vite.html'
  },
  
  // Configure build options
  build: {
    // Output directory for production build
    outDir: 'dist',
    // Generate sourcemaps for better debugging
    sourcemap: true
  },

  optimizeDeps: {
    exclude: ["@xmtp/wasm-bindings", "@xmtp/browser-sdk"],
    include: ["@xmtp/proto"],
  },
  
  // Resolve options for module imports
  resolve: {
    // Allow .ts extensions to be imported without specifying the extension
    extensions: ['.ts', '.js']
  }
});
