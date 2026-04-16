#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts asicseer-pool which automatically writes stats to:
#   /data/{mode}/log/pool/pool.status  (pool-wide stats, multi-line JSON)
#   /data/{mode}/log/users/{address}   (per-user/worker stats)
# The UI container reads these files directly from the shared /data volume.
# No ckpmsg stats-writer loop needed — the daemon handles everything.

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/asicseer.conf

# -n sets the process name (controls socket directory under /tmp/{name}/)
# -B enables solo mode (only for solo daemon)
if [ "$MODE" = "solo" ]; then
  asicseer -c "$CONF" -n "$MODE" -B &
else
  asicseer -c "$CONF" -n "$MODE" &
fi
PID=$!

# Forward SIGTERM/SIGINT to the daemon for clean shutdown
trap 'kill "$PID" 2>/dev/null' TERM INT
wait "$PID"
