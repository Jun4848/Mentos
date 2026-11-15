import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        xfwd: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            // 개발 서버가 직접 확인한 접속 IP로 전달 헤더를 덮어씁니다.
            proxyReq.setHeader("X-Forwarded-For", req.socket.remoteAddress);
          });
        },
      },
    },
  },
});
