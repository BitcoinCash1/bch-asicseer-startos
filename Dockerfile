# ── Build ASICSeer from source ──────────────────────────────────────
FROM ubuntu:22.04 AS build-asicseer

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential cmake libzmq3-dev ca-certificates python3 && \
    rm -rf /var/lib/apt/lists/*

COPY asicseer-src/ /build/asicseer/
COPY patches/ /build/patches/
WORKDIR /build/asicseer
# BCHD requires an "id" field in every JSON-RPC request; upstream ckpool/asicseer omits it.
# Also remove "coinbasetxn" from the GBT capabilities: BCHD interprets it as
# "build me a ready-made coinbase" and errors unless --miningaddr is set.
# Without coinbasetxn, BCHD returns a normal template and the pool builds its own coinbase.
RUN sed -i 's/{\\\"method\\\": /{\\\"id\\\":0,\\\"method\\\": /g; s/{\\\"method\\\":\\\"/{\\\"id\\\":0,\\\"method\\\":\\\"/g; s/\\\"coinbasetxn\\\", //g' src/bitcoin.c
# Go's net/http randomises header map order, so BCHD sometimes sends Content-Type *after*
# Content-Length. The original code reads exactly one line after Content-Length expecting
# the blank line separator; it gets Content-Type (31 bytes) instead and aborts the RPC call.
# Fix: drain all remaining header lines in a loop until the blank line is found.
RUN sed -i 's/if ((ret = read_socket_line(cs, &timeout)) != 1) {/while ((ret = read_socket_line(cs, \&timeout)) > 1) {} if (ret != 1) {/' src/asicseer-pool.c
# BCHD has no built-in wallet so validateaddress omits "isscript" and "scriptPubKey".
# Patch 1: default isscript to false (P2PKH) when absent.
# Patch 2: add cashaddr_to_scriptpubkey_ helper and use it as fallback when scriptPubKey missing.
RUN sed -i 's/quit(1, "No isscript support from bitcoind -- please use a bitcoind with wallet support.");/tmp_val = json_false(); \/* BCHD: no wallet, assume P2PKH *\//' src/bitcoin.c
RUN python3 /build/patches/bchd_cashaddr.py
RUN mkdir out && cd out && cmake -DCMAKE_BUILD_TYPE=Release .. && make

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nginx libssl3 libjansson4 libzmq5 curl jq && \
    rm -rf /var/lib/apt/lists/*

# ASICSeer binaries
COPY --from=build-asicseer /build/asicseer/out/src/asicseer-pool /usr/local/bin/asicseer
COPY --from=build-asicseer /build/asicseer/out/src/asicseer-pmsg /usr/local/bin/ckpmsg
COPY --from=build-asicseer /build/asicseer/out/src/notifier /usr/local/bin/notifier
COPY --from=build-asicseer /build/asicseer/out/src/summariser /usr/local/bin/summariser

# WebUI static files
COPY webui/ /var/www/html/

# nginx config
COPY assets/nginx.conf /etc/nginx/sites-available/default

# Stats API helper
COPY assets/stats-api.sh /usr/local/bin/stats-api.sh
RUN chmod +x /usr/local/bin/stats-api.sh

# Delete-worker API handler
COPY assets/delete-worker.js /usr/local/bin/delete-worker.js

# Pool/solo daemon entrypoint (runs stats-writer alongside asicseer)
COPY assets/pool-entrypoint.sh /usr/local/bin/pool-entrypoint.sh
RUN chmod +x /usr/local/bin/pool-entrypoint.sh

# Entrypoint for UI daemon (starts stats updater + nginx)
COPY assets/ui-entrypoint.sh /usr/local/bin/ui-entrypoint.sh
RUN chmod +x /usr/local/bin/ui-entrypoint.sh

RUN mkdir -p /data/pool /data/solo /var/www/html/api

EXPOSE 81 3334 4568
