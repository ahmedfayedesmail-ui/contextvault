#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
echo "== ContextVault Linux installer =="

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer is for Linux only."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required. Install curl and retry."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  echo "Installing Node.js 22 using APT..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  echo "Installing Node.js 22 using DNF..."
  sudo dnf install -y ca-certificates curl
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs
else
  echo "This installer supports APT and DNF based distributions."
  exit 1
fi

NODE_VERSION="$(node --version)"
NODE_MINOR="$(node -p 'Number(process.versions.node.split(".")[1])')"
if [[ ! "$NODE_VERSION" =~ ^v22\. ]] || (( NODE_MINOR < 13 )); then
  echo "Node.js 22.13 or newer is required; found $NODE_VERSION."
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama with the official Linux installer..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable --now ollama >/dev/null 2>&1 || true
fi
if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  mkdir -p "$HOME/.ollama"
  nohup ollama serve >"$HOME/.ollama/contextvault-ollama.log" 2>&1 </dev/null &
fi

OLLAMA_READY=0
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_READY=1
    break
  fi
  sleep 1
done
if [[ "$OLLAMA_READY" != "1" ]]; then
  echo "Ollama did not become ready on localhost:11434."
  exit 1
fi

echo "Downloading nomic-embed-text..."
ollama pull nomic-embed-text

echo "Installing ContextVault dependencies..."
(cd "$PROJECT_ROOT" && npm install)

APP_DIR="$HOME/.local/share/applications"
mkdir -p "$APP_DIR"
DESKTOP_FILE="$APP_DIR/contextvault.desktop"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=ContextVault
Comment=Local-first developer context and memory
Exec="$PROJECT_ROOT/start-contextvault.sh"
Terminal=false
Categories=Development;Utility;
EOF
chmod +x "$DESKTOP_FILE"

if [[ -d "$HOME/Desktop" ]]; then
  cp "$DESKTOP_FILE" "$HOME/Desktop/ContextVault.desktop"
  chmod +x "$HOME/Desktop/ContextVault.desktop"
fi

echo "Installation completed. ContextVault is available in your Applications menu."
"$PROJECT_ROOT/start-contextvault.sh"
