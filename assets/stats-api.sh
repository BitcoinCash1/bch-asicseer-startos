#!/bin/sh
# Periodically read pool/solo stats (written by pool-entrypoint.sh in each
# daemon container) and query BCHN RPC, then assemble JSON for the WebUI.
#
# Pool/solo stats come from files on the shared volume because Unix domain
# sockets don't cross subcontainer boundaries in StartOS.
API_DIR="/var/www/html/api"
CONF="/data/pool/asicseer.conf"
mkdir -p "$API_DIR"

# ── Helper: JSON-RPC call to BCHN ──────────────────────────────────
rpc_call() {
  METHOD="$1"
  if [ -z "$RPC_URL" ]; then return 1; fi
  curl -sf --max-time 5 -u "${RPC_USER}:${RPC_PASS}" \
    -d "{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"${METHOD}\",\"params\":[]}" \
    -H "Content-Type: application/json" \
    "http://${RPC_URL}" 2>/dev/null | jq -c '.result // empty' 2>/dev/null
}

# ── Helper: read a JSON file or return {} ──────────────────────────
read_json() {
  if [ -f "$1" ]; then
    cat "$1" 2>/dev/null || echo '{}'
  else
    echo '{}'
  fi
}

# ── Read RPC credentials from asicseer config ──────────────────────
load_rpc_creds() {
  if [ -f "$CONF" ]; then
    RPC_URL=$(jq -r '.btcd[0].url // empty' "$CONF" 2>/dev/null)
    RPC_USER=$(jq -r '.btcd[0].auth // empty' "$CONF" 2>/dev/null)
    RPC_PASS=$(jq -r '.btcd[0].pass // empty' "$CONF" 2>/dev/null)
  fi
}

load_rpc_creds

while true; do
  # Reload creds if config changed (e.g. after reconfigure)
  load_rpc_creds

  # ── Pool mode stats (read from shared volume, written by pool daemon container)
  POOL_STATS=$(read_json /data/pool/stats.json)
  POOL_USERS=$(read_json /data/pool/users.json)
  POOL_WORKERS=$(read_json /data/pool/workers.json)

  # ── Solo mode stats (read from shared volume, written by solo daemon container)
  SOLO_STATS=$(read_json /data/solo/stats.json)
  SOLO_USERS=$(read_json /data/solo/users.json)
  SOLO_WORKERS=$(read_json /data/solo/workers.json)

  # ── Blockchain stats from BCHN RPC ──────────────────────────────
  CHAIN_INFO=$(rpc_call getblockchaininfo || echo '{}')
  MINING_INFO=$(rpc_call getmininginfo || echo '{}')
  NET_INFO=$(rpc_call getnetworkinfo || echo '{}')
  MEMPOOL_INFO=$(rpc_call getmempoolinfo || echo '{}')

  if [ -z "$CHAIN_INFO" ]; then CHAIN_INFO='{}'; fi
  if [ -z "$MINING_INFO" ]; then MINING_INFO='{}'; fi
  if [ -z "$NET_INFO" ]; then NET_INFO='{}'; fi
  if [ -z "$MEMPOOL_INFO" ]; then MEMPOOL_INFO='{}'; fi

  # ── Write JSON files atomically ──────────────────────────────────
  printf '%s' "{\"stats\":${POOL_STATS},\"users\":${POOL_USERS},\"workers\":${POOL_WORKERS}}" > "${API_DIR}/pool-stats.json.tmp" && \
    mv "${API_DIR}/pool-stats.json.tmp" "${API_DIR}/pool-stats.json"

  printf '%s' "{\"stats\":${SOLO_STATS},\"users\":${SOLO_USERS},\"workers\":${SOLO_WORKERS}}" > "${API_DIR}/solo-stats.json.tmp" && \
    mv "${API_DIR}/solo-stats.json.tmp" "${API_DIR}/solo-stats.json"

  printf '%s' "{\"blockchain\":${CHAIN_INFO},\"mining\":${MINING_INFO},\"network\":${NET_INFO},\"mempool\":${MEMPOOL_INFO}}" \
    > "${API_DIR}/node-stats.json.tmp" && \
    mv "${API_DIR}/node-stats.json.tmp" "${API_DIR}/node-stats.json"

  sleep 5
done
