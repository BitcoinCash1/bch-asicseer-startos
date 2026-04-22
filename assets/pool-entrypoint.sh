#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts asicseer-pool which automatically writes stats to:
#   /data/{mode}/log/pool/pool.status  (pool-wide stats, multi-line JSON)
#   /data/{mode}/log/users/{address}   (per-user/worker stats)
# The UI container reads these files directly from the shared /data volume.
# No ckpmsg stats-writer loop needed — the daemon handles everything.

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/asicseer.conf

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

RPC_TARGET=$(jq -r '.btcd[0].url // empty' "$CONF" 2>/dev/null)
RPC_USER=$(jq -r '.btcd[0].auth // empty' "$CONF" 2>/dev/null)

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

# Background loop: every 10s, query asicseer-pool's live client table via
# ckpmsg and write it to the shared /data volume so the UI subcontainer can
# derive a real per-worker submission count
# (accepted_count = shares / current_diff). asicseer-pool stores only a
# diff-weighted sum per-worker on disk; the per-client current vardiff
# (`client->diff`) is only reachable over the Unix socket, so we stage it.
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

# Restart loop — if asicseer crashes (e.g. RPC not ready), retry after delay
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
