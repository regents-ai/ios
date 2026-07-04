#!/bin/sh
set -eu

# Drop root before starting the server — the Node process itself never
# runs as root. All server state lives in Redis; no local volume is used.
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
