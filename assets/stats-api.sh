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
  # Count solved blocks from block files written by ckpool/asicseer-pool
  BLOCKS_DIR="/data/${1}/log/pool/blocks"
  SOLVED=0
  if [ -d "$BLOCKS_DIR" ]; then
    SOLVED=$(ls "$BLOCKS_DIR" 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ -s "$STATUS" ]; then
    jq -s "$JQ_DEFS"'add | {
      hashrate5m:  ((.hashrate5m  // .Hashrate5m  // "0") | hr2n),
      hashrate1m:  ((.hashrate1m  // .Hashrate1m  // "0") | hr2n),
      hashrate1hr: ((.hashrate1hr // .Hashrate1hr // "0") | hr2n),
      hashrate1d:  ((.hashrate1d  // .Hashrate1d  // "0") | hr2n),
      hashrate7d:  ((.hashrate7d  // .Hashrate7d  // "0") | hr2n),
      workers:     (.Workers // .workers // 0),
      users:       (.Users // .users // 0),
      accepted:    (.accepted // 0),
      rejected:    (.rejected // 0),
      bestshare:   (.bestshare // 0),
      runtime:     (.runtime // 0),
      diff:        ((.diff // "0") | if type == "string" then (tonumber // 0) else (. // 0) end),
      SolvedBlocks: '"$SOLVED"',
      status:      "ok",
      status_message: "Pool stats active"
    }' "$STATUS" 2>/dev/null || echo '{}'
  else
    if [ -d "/data/${1}/log/pool" ]; then
      echo '{"hashrate5m":0,"hashrate1m":0,"hashrate1hr":0,"hashrate1d":0,"hashrate7d":0,"workers":0,"users":0,"accepted":0,"rejected":0,"bestshare":0,"runtime":0,"diff":0,"SolvedBlocks":0,"status":"waiting_for_miners","status_message":"Waiting for first miner stats"}'
    else
      echo '{"hashrate5m":0,"hashrate1m":0,"hashrate1hr":0,"hashrate1d":0,"hashrate7d":0,"workers":0,"users":0,"accepted":0,"rejected":0,"bestshare":0,"runtime":0,"diff":0,"SolvedBlocks":0,"status":"initializing","status_message":"Pool status file not created yet"}'
    fi
  fi
}

# ── Read connected-client count from pool.status ──
read_users_data() {
  STATUS="/data/${1}/log/pool/pool.status"
  if [ -s "$STATUS" ]; then
    POOL_WORKERS=$(jq -sr 'add | (.Workers // .workers // 0)' "$STATUS" 2>/dev/null || echo 0)
    printf '%s' "{\"connectedclients\":${POOL_WORKERS}}"
  else
    echo '{"connectedclients":0}'
  fi
}

# ── Read workers from per-user log files ──
# Each user file has a "worker" array with per-worker stats.
# WebUI expects: {workers: [{worker, dsps5, dsps60, bestdiff, lastshare, idle}]}
#
# We also merge in per-worker current vardiff (client->diff) from
# /data/{mode}/log/clients.json (written by pool-entrypoint.sh via ckpmsg).
# That lets us derive a real integer accepted-share count from the
# diff-weighted `shares` sum that ckpool stores on disk:
#     accepted_count = round(shares / current_diff)
# which is the number an ASIC's own cgminer API reports as `Accepted`.
read_workers_data() {
  UDIR="/data/${1}/log/users"
  CLIENTS="/data/${1}/log/clients.json"
  NOW=$(date +%s)

  # Build a jq map { "<workername>": avg_diff } from clients.json if present.
  DIFF_MAP='{}'
  if [ -s "$CLIENTS" ]; then
    DIFF_MAP=$(jq -c '
      ((.clients // [])
       | map(select(.workername != null and .workername != "" and (.diff // 0) > 0))
       | group_by(.workername)
       | map({key: .[0].workername,
              value: ((map(.diff) | add) / length)})
       | from_entries) // {}
    ' "$CLIENTS" 2>/dev/null) || DIFF_MAP='{}'
    [ -z "$DIFF_MAP" ] && DIFF_MAP='{}'
  fi

  # Build a jq map { "<workername>": reject_count } from the pool's sharelog.
  # ckpool writes every share submission (accepted OR rejected) as one JSON
  # line to /data/{mode}/log/{blockheight}/{idstring}.sharelog including
  # "workername" and "result": true/false. That is the authoritative source
  # for per-worker reject counts (the pool's in-memory structs don't carry
  # them). We aggregate across all sharelog files in the logdir tree.
  REJECT_MAP='{}'
  ACCEPT_MAP='{}'
  # Limit to the 500 most-recently modified sharelogs to bound cost on
  # long-running pools. Files are per block (~10 min worth of shares each).
  SLFILES=$(find "/data/${1}/log" -maxdepth 4 -name '*.sharelog' -type f 2>/dev/null \
              | head -n 500)
  if [ -n "$SLFILES" ]; then
    # shellcheck disable=SC2086
    SHAREMAPS=$(cat $SLFILES 2>/dev/null \
      | jq -cs '
          (map(select((.workername // "") != ""))
           | group_by(.workername)
           | map({
               wn: .[0].workername,
               acc: (map(select(.result == true)) | length),
               rej: (map(select(.result == false)) | length)
             })) as $g
          | {
              acc: ($g | map({key: .wn, value: .acc}) | from_entries),
              rej: ($g | map({key: .wn, value: .rej}) | from_entries)
            }
        ' 2>/dev/null)
    if [ -n "$SHAREMAPS" ]; then
      ACCEPT_MAP=$(printf '%s' "$SHAREMAPS" | jq -c '.acc // {}' 2>/dev/null) || ACCEPT_MAP='{}'
      REJECT_MAP=$(printf '%s' "$SHAREMAPS" | jq -c '.rej // {}' 2>/dev/null) || REJECT_MAP='{}'
    fi
    [ -z "$ACCEPT_MAP" ] && ACCEPT_MAP='{}'
    [ -z "$REJECT_MAP" ] && REJECT_MAP='{}'

    # Diagnostic dump so we can see the sharelog state from the browser.
    SAMPLE=$(echo "$SLFILES" | head -n 1 | xargs -r head -n 1 2>/dev/null)
    NFILES=$(printf '%s\n' "$SLFILES" | sed '/^$/d' | wc -l | tr -d ' ')
    printf '%s' "{\"mode\":\"$1\",\"sharelog_files\":${NFILES},\"accept_map\":${ACCEPT_MAP},\"reject_map\":${REJECT_MAP},\"sample_line\":$(printf '%s' "$SAMPLE" | jq -Rs .)}" \
      > "${API_DIR}/sharelog-debug-${1}.json.tmp" 2>/dev/null \
      && mv "${API_DIR}/sharelog-debug-${1}.json.tmp" "${API_DIR}/sharelog-debug-${1}.json" 2>/dev/null
  fi

  if [ -d "$UDIR" ] && ls "$UDIR"/* >/dev/null 2>&1; then
    WORKERS='[]'
    for FILE in "$UDIR"/*; do
      [ -f "$FILE" ] || continue

      PARSED=$(jq -c --argjson now "$NOW" --argjson diffmap "$DIFF_MAP" --argjson accmap "$ACCEPT_MAP" --argjson rejmap "$REJECT_MAP" "$JQ_DEFS"'
        [((.worker // .workers // []))[] |
          ((.lastshare // 0) as $ls |
          (.workername // "") as $wn |
          (($diffmap[$wn]) // 0) as $cdiff |
          (($accmap[$wn]) // 0) as $acount |
          (($rejmap[$wn]) // 0) as $rej |
          ((.shares // .accepted // 0) | tonumber? // 0) as $sacc |
          (if ($ls <= 0 or ($now - $ls) > 3600) then "dead"
           elif ($now - $ls) > 300 then "idle"
           else "alive" end) as $status |
          {
            worker:         $wn,
            dsps5:          (((.hashrate5m  // "0") | hr2n) / 4294967296),
            dsps60:         (((.hashrate1hr // "0") | hr2n) / 4294967296),
            accepted:       $sacc,
            accepted_count: $acount,
            rejected:       $rej,
            current_diff:   $cdiff,
            bestdiff:       (.bestshare // 0),
            lastshare:      $ls,
            idle:           ($status != "alive"),
            status:         $status
          })]
      ' "$FILE" 2>/dev/null) || continue

      WORKERS=$(printf '%s\n%s\n' "$WORKERS" "$PARSED" | jq -cs 'add' 2>/dev/null || echo "$WORKERS")
    done

    printf '%s' "{\"workers\":${WORKERS}}"
  else
    echo '{"workers":[]}'
  fi
}

# ── Read RPC credentials from ckpool config ────────────────────────
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
  RPC_STATUS="ok"

  [ -z "$CHAIN_INFO" ] && CHAIN_INFO='{}'
  [ -z "$MINING_INFO" ] && MINING_INFO='{}'
  [ -z "$NET_INFO" ] && NET_INFO='{}'
  [ -z "$MEMPOOL_INFO" ] && MEMPOOL_INFO='{}'
  [ "$CHAIN_INFO" = '{}' ] && RPC_STATUS='unavailable'

  # ── Write JSON files atomically ──────────────────────────────────
  printf '%s' "{\"stats\":${POOL_STATS},\"users\":${POOL_USERS},\"workers\":${POOL_WORKERS}}" \
    > "${API_DIR}/pool-stats.json.tmp" && mv "${API_DIR}/pool-stats.json.tmp" "${API_DIR}/pool-stats.json"

  printf '%s' "{\"stats\":${SOLO_STATS},\"users\":${SOLO_USERS},\"workers\":${SOLO_WORKERS}}" \
    > "${API_DIR}/solo-stats.json.tmp" && mv "${API_DIR}/solo-stats.json.tmp" "${API_DIR}/solo-stats.json"

  printf '%s' "{\"blockchain\":${CHAIN_INFO},\"mining\":${MINING_INFO},\"network\":${NET_INFO},\"mempool\":${MEMPOOL_INFO}}" \
    > "${API_DIR}/node-stats.json.tmp" && mv "${API_DIR}/node-stats.json.tmp" "${API_DIR}/node-stats.json"

  printf '%s' "{\"pool\":${POOL_STATS},\"solo\":${SOLO_STATS},\"node_rpc\":\"${RPC_STATUS}\"}" \
    > "${API_DIR}/service-status.json.tmp" && mv "${API_DIR}/service-status.json.tmp" "${API_DIR}/service-status.json"

  sleep 5
done
