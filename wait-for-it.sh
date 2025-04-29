#!/usr/bin/env bash
#   Use this script to test if a given TCP host/port are available

# Simpler implementation that just takes host and port as positional arguments
# followed by the command to execute

host="$1"
port="$2"
shift 2

until nc -z "$host" "$port"; do
  >&2 echo "Waiting for $host:$port..."
  sleep 1
done

>&2 echo "$host:$port is available - executing command"
exec "$@"