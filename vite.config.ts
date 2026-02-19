import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/oc-api": {
        target: "http://127.0.0.1:18789",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oc-api/, ""),
      },
      "/tg-api": {
        target: "https://api.telegram.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tg-api/, ""),
      },
    },
  },
  clearScreen: false,
});
