import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Vite runs with client/ as cwd, while the deployment .env lives at the
  // project root. Preserve client/.env.tauri and merge the root VITE_* values.
  const rootEnv = loadEnv(mode, "..", "VITE_");
  const clientEnv = loadEnv(mode, ".", "VITE_");
  const apiUrl = process.env.VITE_API_URL ?? clientEnv.VITE_API_URL ?? rootEnv.VITE_API_URL ?? "";
  const apiDebug = process.env.VITE_API_DEBUG ?? clientEnv.VITE_API_DEBUG ?? rootEnv.VITE_API_DEBUG ?? "false";

  if (mode !== "development" && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(apiUrl)) {
    throw new Error("VITE_API_URL no puede apuntar a localhost en un build de producción.");
  }

  return {
    base: mode === "tauri" ? "./" : "/",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.VITE_API_DEBUG": JSON.stringify(apiDebug)
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true
        }
      }
    }
  };
});
