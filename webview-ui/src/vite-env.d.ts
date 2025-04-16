import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 3000,
    open: true, // Automatically open the app in the browser when the server starts
  },
  build: {
    outDir: "dist", // Output directory for build files
    sourcemap: true, // Generate sourcemaps for debugging
  },
  resolve: {
    alias: {
      "@": "/src", // Shortcut alias to reference '/src' directory
      "node_modules": "/node_modules", // Alias for node_modules folder
    },
  },
});
