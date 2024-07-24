"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
// https://vitejs.dev/config/
exports.default = (0, vite_1.defineConfig)(({ mode }) => {
    const shouldMinify = process.env.MINIFY !== 'false'; // Check environment variable
    return {
        plugins: [(0, plugin_react_1.default)()],
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
    };
});
//# sourceMappingURL=vite.config.js.map