#!/bin/sh
# Entrypoint for pool/solo subcontainers.
# Starts asicseer in background, then runs a stats-writer loop that queries
# the local stratifier socket and dumps JSON to the shared volume so the
# UI container can read it (Unix sockets don't cross container boundaries).

MODE="${1:-pool}"                     # "pool" or "solo"
CONF="${2}"                           # e.g. /data/pool/asicseer.conf
LOGDIR="${3}"                         # e.g. /data/pool/log
RUNDIR="/data/${MODE}/run"
STATS_FILE="/data/${MODE}/stats.json"
USERS_FILE="/data/${MODE}/users.json"
WORKERS_FILE="/data/${MODE}/workers.json"
SOCKET="${RUNDIR}/stratifier"

# ── Start the pool daemon ──────────────────────────────────────────
asicseer -c "$CONF" -B -k "$LOGDIR" &
POOL_PID=$!

# ── Stats writer loop ─────────────────────────────────────────────
(
  # Wait for the socket to appear
  while [ ! -S "$SOCKET" ]; do
    sleep 2
  done

  while true; do
    S=$(ckpmsg -s "$SOCKET" stats 2>/dev/null) || S='{}'
    U=$(ckpmsg -s "$SOCKET" users 2>/dev/null) || U='{}'
    W=$(ckpmsg -s "$SOCKET" workers 2>/dev/null) || W='{}'

    printf '%s' "$S" > "${STATS_FILE}.tmp" && mv "${STATS_FILE}.tmp" "$STATS_FILE"
    printf '%s' "$U" > "${USERS_FILE}.tmp" && mv "${USERS_FILE}.tmp" "$USERS_FILE"
    printf '%s' "$W" > "${WORKERS_FILE}.tmp" && mv "${WORKERS_FILE}.tmp" "$WORKERS_FILE"
    sleep 5
  done
) &

# ── Wait for asicseer to exit (keeps container alive) ──────────────
wait $POOL_PID
