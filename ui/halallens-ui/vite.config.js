import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is proxied to the FastAPI backend (uvicorn on :8010; port 8000 is left for other projects).
// Point it elsewhere with HALALLENS_API_URL, e.g. http://api:8010 inside docker compose.
// 127.0.0.1, not "localhost": Node resolves localhost to IPv6 ::1 first, which can hit a
// Docker port mapping instead of the local uvicorn.
const API_URL = process.env.HALALLENS_API_URL || "http://127.0.0.1:8010";

const proxy = {
  "/api": {
    target: API_URL,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  // 5180/4180 instead of Vite's defaults (5173/4173), which RentSafe's frontend uses.
  // strictPort: fail loudly instead of silently moving to the next free port.
  server: { port: 5180, strictPort: true, proxy },
  preview: { port: 4180, strictPort: true, proxy },
});
