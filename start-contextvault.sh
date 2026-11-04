#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
LOG_DIR="$HOME/.local/state/contextvault"
mkdir -p "$LOG_DIR"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed. Run the platform installer first." >&2
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  open -ga Ollama >/dev/null 2>&1 || true
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  nohup ollama serve >"$LOG_DIR/ollama.log" 2>&1 </dev/null &
fi

OLLAMA_READY=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_READY=1
    break
  fi
  sleep 1
done
if [[ "$OLLAMA_READY" != "1" ]]; then
  echo "Ollama did not start. See $LOG_DIR/ollama.log." >&2
  exit 1
fi

if ! ollama list 2>/dev/null | grep -q 'nomic-embed-text'; then
  ollama pull nomic-embed-text
fi

if ! curl -fsS http://127.0.0.1:3737/health >/dev/null 2>&1; then
  if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
    (cd "$PROJECT_ROOT" && npm install)
  fi
  (
    cd "$PROJECT_ROOT"
    nohup npm run dev >"$LOG_DIR/server.log" 2>&1 </dev/null &
  )
fi

sleep 3
if command -v open >/dev/null 2>&1; then
  open http://localhost:3737
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3737 >/dev/null 2>&1 &
else
  echo "ContextVault is available at http://localhost:3737"
fi
