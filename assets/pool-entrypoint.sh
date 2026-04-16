#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts asicseer-pool which automatically writes stats to:
#   /data/{mode}/log/pool/pool.status  (pool-wide stats, multi-line JSON)
#   /data/{mode}/log/users/{address}   (per-user/worker stats)
# The UI container reads these files directly from the shared /data volume.
# No ckpmsg stats-writer loop needed — the daemon handles everything.

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/asicseer.conf

# Clean stale socket directory from previous runs
rm -rf "/tmp/${MODE}" 2>/dev/null

# -n sets the process name (controls socket directory under /tmp/{name}/)
# -B enables solo mode (only for solo daemon)
if [ "$MODE" = "solo" ]; then
  CMD="asicseer -c $CONF -n $MODE -B"
else
  CMD="asicseer -c $CONF -n $MODE"
fi

# Restart loop — if asicseer crashes (e.g. RPC not ready), retry after delay
MAX_RETRIES=10
RETRY=0
while true; do
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

  echo "asicseer ($MODE) exited with code $EXIT_CODE, restarting in 5s (attempt $RETRY/$MAX_RETRIES)"
  # Clean stale sockets before retry
  rm -rf "/tmp/${MODE}" 2>/dev/null
  sleep 5
done
