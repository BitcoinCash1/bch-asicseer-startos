#!/bin/sh
# Reads pool/solo stats from daemon log files and BCHN RPC,
# then assembles JSON for the WebUI.
#
# The pool/solo daemons automatically write stats to:
#   {logdir}/pool/pool.status  — multi-line JSON with pool-wide stats
#   {logdir}/users/{address}   — per-user JSON with worker arrays
# logdir = /data/pool/log (pool mode) or /data/solo/log (solo mode)
# These files live on the shared /data volume, accessible to this container.

API_DIR="/var/www/html/api"
CONF="/data/pool/asicseer.conf"
mkdir -p "$API_DIR"

# ── jq helper: parse hashrate suffix string ("1.234T") to numeric H/s ──
# Both asicseer-pool and ckpool use suffix_string() which produces
# uppercase single-char suffixes: "", "K", "M", "G", "T", "P", "E".
JQ_DEFS='def hr2n:
  if . == null or . == "" or . == "0" then 0
  elif endswith("E") then (.[:-1]|tonumber)*1e18
  elif endswith("P") then (.[:-1]|tonumber)*1e15
  elif endswith("T") then (.[:-1]|tonumber)*1e12
  elif endswith("G") then (.[:-1]|tonumber)*1e9
  elif endswith("M") then (.[:-1]|tonumber)*1e6
  elif endswith("K") then (.[:-1]|tonumber)*1e3
  else (tonumber // 0)
  end;'

# ── Helper: JSON-RPC call to BCHN ──────────────────────────────────
rpc_call() {
  METHOD="$1"
  if [ -z "$RPC_URL" ]; then return 1; fi
  curl -sf --max-time 5 -u "${RPC_USER}:${RPC_PASS}" \
    -d "{\"jsonrpc\":\"1.0\",\"id\":1,\"method\":\"${METHOD}\",\"params\":[]}" \
    -H "Content-Type: application/json" \
    "http://${RPC_URL}" 2>/dev/null | jq -c '.result // empty' 2>/dev/null
}

# ── Read pool.status and transform to WebUI-compatible stats object ──
# pool.status is multi-line JSON (3-4 lines); jq -s 'add' merges them.
# Fields: runtime, Users, Workers, Idle, Disconnected, hashrate1m-7d,
#         SPS1m-1h, diff, accepted, rejected, bestshare.
# WebUI expects: hashrate5m (numeric H/s), workers, accepted, bestshare.
read_pool_stats() {
  STATUS="/data/${1}/log/pool/pool.status"
  if [ -s "$STATUS" ]; then
    jq -s "$JQ_DEFS"'add | {
      hashrate5m:  ((.hashrate5m  // "0") | hr2n),
      hashrate1m:  ((.hashrate1m  // "0") | hr2n),
      hashrate1hr: ((.hashrate1hr // "0") | hr2n),
      hashrate1d:  ((.hashrate1d  // "0") | hr2n),
      hashrate7d:  ((.hashrate7d  // "0") | hr2n),
      workers:     (.Workers // 0),
      users:       (.Users // 0),
      accepted:    (.accepted // 0),
      rejected:    (.rejected // 0),
      bestshare:   (.bestshare // 0),
      runtime:     (.runtime // 0)
    }' "$STATUS" 2>/dev/null || echo '{}'
  else
    echo '{}'
  fi
}

# ── Read connected-client count from pool.status ──
read_users_data() {
  STATUS="/data/${1}/log/pool/pool.status"
  if [ -s "$STATUS" ]; then
    jq -s 'add | {connectedclients: (.Workers // 0)}' "$STATUS" 2>/dev/null || echo '{}'
  else
    echo '{}'
  fi
}

# ── Read workers from per-user log files ──
# Each user file has a "worker" array with per-worker stats.
# WebUI expects: {workers: [{worker, dsps5, dsps60, bestdiff, lastshare, idle}]}
read_workers_data() {
  UDIR="/data/${1}/log/users"
  NOW=$(date +%s)
  if [ -d "$UDIR" ] && ls "$UDIR"/* >/dev/null 2>&1; then
    WORKERS='[]'
    for FILE in "$UDIR"/*; do
      [ -f "$FILE" ] || continue

      PARSED=$(jq -c --argjson now "$NOW" "$JQ_DEFS"'
        [(.worker // [])[] | {
          worker:    .workername,
          dsps5:     (((.hashrate5m  // "0") | hr2n) / 4294967296),
          dsps60:    (((.hashrate1hr // "0") | hr2n) / 4294967296),
          bestdiff:  (.bestshare // 0),
          lastshare: (.lastshare // 0),
          idle:      ((.lastshare // 0) < ($now - 60))
        }]
      ' "$FILE" 2>/dev/null) || continue

      WORKERS=$(printf '%s\n%s\n' "$WORKERS" "$PARSED" | jq -cs 'add' 2>/dev/null || echo "$WORKERS")
    done

    printf '%s' "{\"workers\":${WORKERS}}"
  else
    echo '{"workers":[]}'
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
  load_rpc_creds

  # ── Pool mode stats (from /data/pool/log/)
  POOL_STATS=$(read_pool_stats pool)
  POOL_USERS=$(read_users_data pool)
  POOL_WORKERS=$(read_workers_data pool)

  # ── Solo mode stats (from /data/solo/log/)
  SOLO_STATS=$(read_pool_stats solo)
  SOLO_USERS=$(read_users_data solo)
  SOLO_WORKERS=$(read_workers_data solo)

  # ── Blockchain stats from BCHN RPC ──────────────────────────────
  CHAIN_INFO=$(rpc_call getblockchaininfo || echo '{}')
  MINING_INFO=$(rpc_call getmininginfo || echo '{}')
  NET_INFO=$(rpc_call getnetworkinfo || echo '{}')
  MEMPOOL_INFO=$(rpc_call getmempoolinfo || echo '{}')

  [ -z "$CHAIN_INFO" ] && CHAIN_INFO='{}'
  [ -z "$MINING_INFO" ] && MINING_INFO='{}'
  [ -z "$NET_INFO" ] && NET_INFO='{}'
  [ -z "$MEMPOOL_INFO" ] && MEMPOOL_INFO='{}'

  # ── Write JSON files atomically ──────────────────────────────────
  printf '%s' "{\"stats\":${POOL_STATS},\"users\":${POOL_USERS},\"workers\":${POOL_WORKERS}}" \
    > "${API_DIR}/pool-stats.json.tmp" && mv "${API_DIR}/pool-stats.json.tmp" "${API_DIR}/pool-stats.json"

  printf '%s' "{\"stats\":${SOLO_STATS},\"users\":${SOLO_USERS},\"workers\":${SOLO_WORKERS}}" \
    > "${API_DIR}/solo-stats.json.tmp" && mv "${API_DIR}/solo-stats.json.tmp" "${API_DIR}/solo-stats.json"

  printf '%s' "{\"blockchain\":${CHAIN_INFO},\"mining\":${MINING_INFO},\"network\":${NET_INFO},\"mempool\":${MEMPOOL_INFO}}" \
    > "${API_DIR}/node-stats.json.tmp" && mv "${API_DIR}/node-stats.json.tmp" "${API_DIR}/node-stats.json"

  sleep 5
done
