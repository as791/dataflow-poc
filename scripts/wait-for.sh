#!/bin/sh
# usage: wait-for.sh host:port -- command...
hostport=$1; shift; shift
host=${hostport%:*}; port=${hostport#*:}
echo "waiting for $host:$port…"
i=0
while ! nc -z "$host" "$port" 2>/dev/null; do
  i=$((i+1)); [ $i -gt 60 ] && echo "timeout" && exit 1
  sleep 2
done
echo "$host:$port up"
exec "$@"
