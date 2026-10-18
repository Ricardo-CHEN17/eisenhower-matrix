import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/",
    plugins: [react()],
    resolve: {
      alias: {
        "@eisenhower/shared": fileURLToPath(
          new URL("../../packages/shared/src/index.ts", import.meta.url)
        )
      }
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:3001"
      }
    }
  };
});
