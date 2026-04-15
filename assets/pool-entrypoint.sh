#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts asicseer in background, then runs a stats-writer loop that queries
# the local listener socket via ckpmsg (asicseer-pmsg) and dumps JSON to
# the shared volume so the UI container can read it (Unix sockets don't
# cross container boundaries in StartOS).

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/asicseer.conf

STATS_FILE="/data/${MODE}/stats.json"
USERS_FILE="/data/${MODE}/users.json"
WORKERS_FILE="/data/${MODE}/workers.json"

# asicseer creates sockets at /tmp/{name}/listener by default.
# Use -n to give pool/solo unique names so they don't collide.
PROC_NAME="${MODE}"
LISTENER="/tmp/${PROC_NAME}/listener"

# ── Start the pool daemon ──────────────────────────────────────────
# -n sets the process name (controls socket directory)
# -B enables solo mode (only for solo daemon)
if [ "$MODE" = "solo" ]; then
  asicseer -c "$CONF" -n "$PROC_NAME" -B &
else
  asicseer -c "$CONF" -n "$PROC_NAME" &
fi
POOL_PID=$!

# ── Stats writer loop ─────────────────────────────────────────────
(
  # Wait for the listener socket to appear
  while [ ! -S "$LISTENER" ]; do
    sleep 2
  done

  while true; do
    S=$(ckpmsg -n "$PROC_NAME" stats  2>/dev/null) || S='{}'
    U=$(ckpmsg -n "$PROC_NAME" users  2>/dev/null) || U='{}'
    W=$(ckpmsg -n "$PROC_NAME" workers 2>/dev/null) || W='{}'

    printf '%s' "$S" > "${STATS_FILE}.tmp" && mv "${STATS_FILE}.tmp" "$STATS_FILE"
    printf '%s' "$U" > "${USERS_FILE}.tmp" && mv "${USERS_FILE}.tmp" "$USERS_FILE"
    printf '%s' "$W" > "${WORKERS_FILE}.tmp" && mv "${WORKERS_FILE}.tmp" "$WORKERS_FILE"
    sleep 5
  done
) &

# ── Wait for asicseer to exit (keeps container alive) ──────────────
wait $POOL_PID
