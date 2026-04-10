FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter api build

WORKDIR /app/apps/api

EXPOSE 3100

CMD ["node", "dist/server.js"]
