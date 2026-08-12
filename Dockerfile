# ── Build asicseer-pool ─────────────────────────────────────────────
FROM ubuntu:22.04 AS build

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential cmake libzmq3-dev ca-certificates git python3 && \
    rm -rf /var/lib/apt/lists/*

ARG ASICSEER_REF=v1.5.4
RUN git clone --depth 1 --branch ${ASICSEER_REF} \
    https://github.com/cculianu/asicseer-pool.git /build/asicseer

COPY patches/ /build/patches/
WORKDIR /build/asicseer

# Every patch below either fails the build or is asserted afterwards: a `sed`
# whose pattern stops matching a future upstream is otherwise silent, and the
# resulting binary breaks only against one of the three nodes.
RUN python3 /build/patches/apply.py

RUN mkdir out && cd out && cmake -DCMAKE_BUILD_TYPE=Release .. && make -j"$(nproc)"

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nginx libssl3 libjansson4 libzmq5 curl jq && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /build/asicseer/out/src/asicseer-pool /usr/local/bin/asicseer
COPY --from=build /build/asicseer/out/src/asicseer-pmsg /usr/local/bin/ckpmsg
COPY --from=build /build/asicseer/out/src/notifier /usr/local/bin/notifier
COPY --from=build /build/asicseer/out/src/summariser /usr/local/bin/summariser

# WebUI static files
COPY webui/ /var/www/html/

# nginx config
COPY assets/nginx.conf /etc/nginx/sites-available/default

# Stats API helper
COPY assets/stats-api.sh /usr/local/bin/stats-api.sh
RUN chmod +x /usr/local/bin/stats-api.sh

# Delete-worker API handler
COPY assets/delete-worker.js /usr/local/bin/delete-worker.js

# Mining daemon entrypoint
COPY assets/pool-entrypoint.sh /usr/local/bin/pool-entrypoint.sh
RUN chmod +x /usr/local/bin/pool-entrypoint.sh

# Entrypoint for the UI daemon (stats updater + nginx)
COPY assets/ui-entrypoint.sh /usr/local/bin/ui-entrypoint.sh
RUN chmod +x /usr/local/bin/ui-entrypoint.sh

RUN mkdir -p /data/pool /var/www/html/api

EXPOSE 81 3334
