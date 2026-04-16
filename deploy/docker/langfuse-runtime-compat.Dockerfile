FROM postgres:17

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0

# Server 10 cannot reliably pull node:*-bookworm-slim, but it already keeps a
# local Debian-based postgres image. Install the distro node runtime there so
# native DuckDB bindings run against a real glibc userspace.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates nodejs \
  && rm -rf /var/lib/apt/lists/*
