import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [DECISÃO — Pre-Beta Hardening, Prioridade 12] `output: "standalone"` faz
  // o `next build` copiar para `.next/standalone` só o que é preciso para
  // correr em produção (server.js + node_modules mínimos), sem precisar de
  // `npm install` dentro da imagem final. É o que o Dockerfile usa para
  // produzir uma imagem pequena e reprodutível. Ver docs/architecture/DEPLOYMENT.md.
  output: "standalone",
};

export default nextConfig;
