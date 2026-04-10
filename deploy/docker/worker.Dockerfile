FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter worker build

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
