# Multi-stage Dockerfile for clawworld.
#
# Stage 1: build the React + Vite frontend into server/static
# Stage 2: install the backend Bun runtime + source
#
# Final image is a single Bun process serving MCP + REST + static on one port.
# Works on linux/amd64 and linux/arm64 (Oracle Cloud Ampere A1). To build multi-arch:
#
#   docker buildx build --platform linux/amd64,linux/arm64 -t clawworld:latest .

# ---------------------------------------------------------------------------
# 1. Frontend build
# ---------------------------------------------------------------------------
FROM oven/bun:1.1-debian AS web-build
WORKDIR /build/web
COPY web/package.json ./
RUN bun install --no-save
COPY web/ ./
RUN bun run build
# Output goes to /build/server/static per vite.config.js (../server/static)

# ---------------------------------------------------------------------------
# 2. Backend runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1.1-debian AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        sqlite3 \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/clawworld

# Backend deps (cached layer)
COPY server/package.json ./server/
RUN cd server && bun install --frozen-lockfile || bun install

# Backend source
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Built frontend from stage 1 (vite outputs to ../server/static relative to web/)
COPY --from=web-build /build/server/static/ ./server/static/

# Non-root user + data volume
RUN useradd --system --create-home --uid 1000 claw && \
    mkdir -p /srv/clawworld/server/data && \
    chown -R claw:claw /srv/clawworld
USER claw

ENV CLAWWORLD_HOST=0.0.0.0 \
    CLAWWORLD_PORT=8080 \
    CLAWWORLD_DB=/srv/clawworld/server/data/clawworld.db \
    CLAWWORLD_SECRET=/srv/clawworld/server/data/server_secret.bin \
    CLAWWORLD_STATIC=/srv/clawworld/server/static

VOLUME ["/srv/clawworld/server/data"]
EXPOSE 8080

WORKDIR /srv/clawworld/server

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "src/index.ts"]
