#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts ckpool which automatically writes stats to:
#   /data/{mode}/log/pool/pool.status  (pool-wide stats, multi-line JSON)
#   /data/{mode}/log/users/{address}   (per-user/worker stats)
# The UI container reads these files directly from the shared /data volume.
# No ckpmsg stats-writer loop needed — the daemon handles everything.

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/ckpool.conf

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

RPC_TARGET=$(jq -r '.btcd[0].url // empty' "$CONF" 2>/dev/null)
RPC_USER=$(jq -r '.btcd[0].auth // empty' "$CONF" 2>/dev/null)
RPC_PASS=$(jq -r '.btcd[0].pass // empty' "$CONF" 2>/dev/null)

# Clean stale socket directory from previous runs
rm -rf "/tmp/${MODE}" 2>/dev/null

# -n sets the process name (controls socket directory under /tmp/{name}/)
# -B enables solo mode (only for solo daemon)
if [ "$MODE" = "solo" ]; then
  CMD="asicseer -c $CONF -n $MODE -B"
else
  CMD="asicseer -c $CONF -n $MODE"
fi

log "starting asicseer mode=${MODE} conf=${CONF} rpc_target=${RPC_TARGET:-unknown} rpc_user=${RPC_USER:-unknown}"

# ckpool only creates the sharelog directory /data/{mode}/log/{blockheight:08x}/
# when it detects a NEW block. Between restarts (or before the next block is
# found on mainnet, ~10 min interval) there is no directory, so fopen() fails
# and every share submitted in that window is silently dropped from the
# sharelog — which is the ONLY place per-worker accepted/rejected counts are
# persisted. Fix it by pre-creating the directory for the current tip (and the
# next few heights) on a background loop, using the same RPC credentials the
# pool uses.
(
  LOGROOT="/data/${MODE}/log"
  while : ; do
    if [ -n "$RPC_TARGET" ] && [ -n "$RPC_USER" ] && [ -n "$RPC_PASS" ]; then
      BC=$(curl -s --max-time 5 --user "${RPC_USER}:${RPC_PASS}" \
             --data-binary '{"jsonrpc":"1.0","id":"sl","method":"getblockcount","params":[]}' \
             -H 'content-type: text/plain;' "http://${RPC_TARGET}/" 2>/dev/null \
           | jq -r '.result // empty' 2>/dev/null)
      if [ -n "$BC" ] && [ "$BC" -gt 0 ] 2>/dev/null; then
        # Pre-create current and next 2 heights — covers the race where the
        # pool learns the new-block notification slightly before or after us.
        for d in 0 1 2; do
          H=$((BC + d))
          HEX=$(printf '%08x' "$H")
          mkdir -p "${LOGROOT}/${HEX}" 2>/dev/null
          chmod 0755 "${LOGROOT}/${HEX}" 2>/dev/null
        done
      fi
    fi
    sleep 30
  done
) &

# Background loop: every 10s, query ckpool's live client table via ckpmsg
# and write it to the shared /data volume so the UI subcontainer can derive
# a real per-worker submission count (accepted_count = shares / current_diff).
# ckpool stores only a diff-weighted sum per-worker on disk; the per-client
# current vardiff (`client->diff`) is only reachable over ckpool's Unix
# socket, so we stage it here.
(
  while : ; do
    sleep 10
    [ -S "/tmp/${MODE}/listener" ] || continue
    OUT=$(printf 'clients\n' | ckpmsg -s /tmp -n "${MODE}" 2>/dev/null \
            | sed -n 's/.*Received response: //p' | head -1)
    if [ -n "$OUT" ]; then
      mkdir -p "/data/${MODE}/log" 2>/dev/null
      printf '%s' "$OUT" > "/data/${MODE}/log/.clients.tmp" \
        && mv "/data/${MODE}/log/.clients.tmp" "/data/${MODE}/log/clients.json"
    fi
  done
) &

# Restart loop — if ckpool crashes (e.g. RPC not ready), retry after delay
MAX_RETRIES=10
RETRY=0
while true; do
  log "launch attempt $((RETRY + 1))/${MAX_RETRIES} mode=${MODE}"
  $CMD &
  PID=$!

  # Forward SIGTERM/SIGINT to the daemon for clean shutdown
  trap 'kill "$PID" 2>/dev/null; exit 0' TERM INT
  wait "$PID"
  EXIT_CODE=$?

  # Exit 0 means clean shutdown (SIGTERM) — don't restart
  [ "$EXIT_CODE" -eq 0 ] && exit 0

  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "asicseer ($MODE) failed $MAX_RETRIES times, giving up"
    exit 1
  fi

  log "asicseer (${MODE}) exited with code ${EXIT_CODE}, restarting in 5s (attempt ${RETRY}/${MAX_RETRIES})"
  # Clean stale sockets before retry
  rm -rf "/tmp/${MODE}" 2>/dev/null
  log "cleaned stale socket dir /tmp/${MODE}"
  sleep 5
done
