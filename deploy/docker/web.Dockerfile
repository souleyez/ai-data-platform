FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter web build

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
