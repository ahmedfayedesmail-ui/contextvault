#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
echo "== ContextVault macOS installer =="

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS only."
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

echo "Installing Node.js 22 and the official Ollama app..."
brew install node@22
brew install --cask ollama-app
NODE_BIN="$(brew --prefix node@22)/bin"
BREW_BIN="$(brew --prefix)/bin"
export PATH="$NODE_BIN:$BREW_BIN:$PATH"

NODE_VERSION="$(node --version)"
NODE_MINOR="$(node -p 'Number(process.versions.node.split(".")[1])')"
if [[ ! "$NODE_VERSION" =~ ^v22\. ]] || (( NODE_MINOR < 13 )); then
  echo "Node.js 22.13 or newer is required; found $NODE_VERSION."
  exit 1
fi

open -a Ollama
OLLAMA_READY=0
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    OLLAMA_READY=1
    break
  fi
  sleep 1
done
if [[ "$OLLAMA_READY" != "1" ]]; then
  echo "Ollama did not start. Open the Ollama app and retry."
  exit 1
fi

echo "Downloading nomic-embed-text..."
ollama pull nomic-embed-text

echo "Installing ContextVault dependencies..."
(cd "$PROJECT_ROOT" && npm install)

mkdir -p "$HOME/Desktop"
LAUNCHER="$HOME/Desktop/ContextVault.command"
cat > "$LAUNCHER" <<EOF
#!/bin/bash
export PATH="$NODE_BIN:$BREW_BIN:\\$PATH"
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/start-contextvault.sh"
EOF
chmod +x "$LAUNCHER"

echo "Installation completed. Starting ContextVault..."
/bin/bash "$LAUNCHER"
