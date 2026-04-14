#!/bin/sh
# Start the stats API updater in the background, then run nginx in foreground
stats-api.sh &
exec nginx -g 'daemon off;'
