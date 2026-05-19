#!/bin/sh
# Start the stats API updater and delete-worker handler in background, then nginx
node /usr/local/bin/delete-worker.js &
stats-api.sh &
exec nginx -g 'daemon off;'
