# 多阶段构建 —— 通用 SaaS 后端 (M9 部署模块)
# Base: Debian slim —— Prisma 默认 Linux 引擎开箱即用。

FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev
RUN npx prisma generate

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts

# ─── 业务示例 (business-delf) 额外资源 —— 换业务时删除以下整段 ───
# OCR 语言包 + 听力静态资源 + 录音可写目录。纯平台骨架不需要。
# COPY assets ./assets
# COPY eng.traineddata ./
# RUN mkdir -p content/recordings content/fei-samples \
#  && chown -R node:node content
# ────────────────────────────────────────────────────────────

EXPOSE 4000
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
