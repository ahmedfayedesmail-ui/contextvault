#!/usr/bin/env sh
set -eu

echo "[ContextVault] Starting Ollama..."
ollama serve >/tmp/contextvault-ollama.log 2>&1 &
OLLAMA_PID=$!

cleanup() {
  kill "$OLLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

OLLAMA_READY=0
for attempt in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_READY=1
    break
  fi
  sleep 1
done

if [ "$OLLAMA_READY" != "1" ]; then
  echo "[ContextVault] Ollama failed to start. See /tmp/contextvault-ollama.log." >&2
  exit 1
fi

if ! ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
  echo "[ContextVault] Pulling nomic-embed-text on first startup..."
  ollama pull nomic-embed-text
fi

echo "[ContextVault] Starting the application..."
exec node --experimental-sqlite dist/server.js
