import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const shouldMinify = process.env.MINIFY !== 'false' // Check environment variable

  return {
    plugins: [react()],
    build: {
      minify: shouldMinify,
      sourcemap: true,
      outDir: "build",
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name].js`,
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`,
        },
      },
    },
  }
});
