# ============================================================================
# KONTA — imagem de produção (Next.js standalone)
#
# [DECISÃO — Pre-Beta Hardening, Prioridade 12] Build multi-stage:
#   1. deps    — instala só as dependências (cache eficiente entre builds).
#   2. builder — corre `next build` com output "standalone" (ver next.config.ts).
#   3. runner  — imagem final mínima: copia apenas o server standalone + os
#      estáticos, corre como utilizador não-root, sem código-fonte nem
#      devDependencies. Não precisa de `npm install` na imagem final.
#
# Ver docs/architecture/DEPLOYMENT.md para o raciocínio completo (porquê
# Docker + VPS em vez de uma plataforma gerida) e para como construir/correr
# esta imagem em produção.
# ============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` respeita exatamente o package-lock.json (build reprodutível) e não
# corre nenhum script de dependências que precise de rede além do registo
# npm (confirmado: nem @prisma/client nem prisma têm postinstall — ver
# docs/architecture/DECISIONS.md, secção "Prisma neste ambiente").
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variáveis só necessárias para o build (nenhuma tem de ser um segredo real
# aqui — o build não liga à base de dados nem assina tokens).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# .next/standalone já inclui um server.js e só os node_modules realmente
# usados em runtime — não copiamos node_modules/ nem o código-fonte completo
# para a imagem final.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
