#!/usr/bin/env bash
# Serve static site from this directory (required for index2 iframes + relative assets).
# Usage: ./serve-preview.sh [PORT]
# Default port 8890; use another if you see "Address already in use".

set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8890}"
HOST="127.0.0.1"

echo "Serving http://${HOST}:${PORT}/"
echo "  index2:  http://${HOST}:${PORT}/index2.html"
echo "  home:    http://${HOST}:${PORT}/index.html"
echo "Press Ctrl+C to stop."
exec python3 -m http.server "$PORT" --bind "$HOST"
