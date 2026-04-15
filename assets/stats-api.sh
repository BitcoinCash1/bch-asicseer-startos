#!/bin/sh
# Periodically query ASICSeer + BCHN stats and write JSON for the WebUI
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

  # ── Pool mode stats ──────────────────────────────────────────────
  if [ -S /data/pool/run/stratifier ]; then
    POOL_STATS=$(ckpmsg -s /data/pool/run/stratifier stats 2>/dev/null || echo '{}')
    POOL_USERS=$(ckpmsg -s /data/pool/run/stratifier users 2>/dev/null || echo '{}')
  else
    POOL_STATS='{}'
    POOL_USERS='{}'
  fi

  # ── Solo mode stats ──────────────────────────────────────────────
  if [ -S /data/solo/run/stratifier ]; then
    SOLO_STATS=$(ckpmsg -s /data/solo/run/stratifier stats 2>/dev/null || echo '{}')
    SOLO_USERS=$(ckpmsg -s /data/solo/run/stratifier users 2>/dev/null || echo '{}')
  else
    SOLO_STATS='{}'
    SOLO_USERS='{}'
  fi

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
  printf '%s' "{\"stats\":${POOL_STATS},\"users\":${POOL_USERS}}" > "${API_DIR}/pool-stats.json.tmp" && \
    mv "${API_DIR}/pool-stats.json.tmp" "${API_DIR}/pool-stats.json"

  printf '%s' "{\"stats\":${SOLO_STATS},\"users\":${SOLO_USERS}}" > "${API_DIR}/solo-stats.json.tmp" && \
    mv "${API_DIR}/solo-stats.json.tmp" "${API_DIR}/solo-stats.json"

  printf '%s' "{\"blockchain\":${CHAIN_INFO},\"mining\":${MINING_INFO},\"network\":${NET_INFO},\"mempool\":${MEMPOOL_INFO}}" \
    > "${API_DIR}/node-stats.json.tmp" && \
    mv "${API_DIR}/node-stats.json.tmp" "${API_DIR}/node-stats.json"

  sleep 5
done
