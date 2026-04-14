#!/bin/sh
# Periodically query ASICSeer stats and write JSON for the WebUI
API_DIR="/var/www/html/api"
mkdir -p "$API_DIR"

while true; do
  # Pool mode stats
  if [ -S /data/pool/run/stratifier ]; then
    POOL_STATS=$(ckpmsg -s /data/pool/run/stratifier stats 2>/dev/null || echo '{}')
    POOL_USERS=$(ckpmsg -s /data/pool/run/stratifier users 2>/dev/null || echo '{}')
  else
    POOL_STATS='{}'
    POOL_USERS='{}'
  fi

  # Solo mode stats
  if [ -S /data/solo/run/stratifier ]; then
    SOLO_STATS=$(ckpmsg -s /data/solo/run/stratifier stats 2>/dev/null || echo '{}')
    SOLO_USERS=$(ckpmsg -s /data/solo/run/stratifier users 2>/dev/null || echo '{}')
  else
    SOLO_STATS='{}'
    SOLO_USERS='{}'
  fi

  # Write JSON files atomically
  printf '%s' "{\"stats\":${POOL_STATS},\"users\":${POOL_USERS}}" > "${API_DIR}/pool-stats.json.tmp" && \
    mv "${API_DIR}/pool-stats.json.tmp" "${API_DIR}/pool-stats.json"

  printf '%s' "{\"stats\":${SOLO_STATS},\"users\":${SOLO_USERS}}" > "${API_DIR}/solo-stats.json.tmp" && \
    mv "${API_DIR}/solo-stats.json.tmp" "${API_DIR}/solo-stats.json"

  sleep 5
done
