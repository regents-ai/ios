#!/bin/sh
set -eu

# Fly mounts the /data volume owned by root. Hand it to the unprivileged
# node user once, then drop root before starting the server — the Node
# process itself never runs as root.
if [ "$(id -u)" = "0" ]; then
  if [ -d /data ]; then
    chown -R node:node /data
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
