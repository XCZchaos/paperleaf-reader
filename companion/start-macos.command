#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 22 or newer from https://nodejs.org first.'
  read -r -p 'Press Enter to close.'
  exit 1
fi
if [ ! -f node_modules/@openai/codex/bin/codex.js ]; then
  npm install --omit=dev --no-audit --no-fund
fi
node server.mjs
