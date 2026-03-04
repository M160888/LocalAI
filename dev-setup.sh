#!/bin/bash
# One-shot dev environment setup
set -e

echo "Checking prerequisites..."

# Rust
if ! command -v cargo &>/dev/null; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

# Node
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Install it from https://nodejs.org or via your package manager."
  exit 1
fi

# Tauri system deps (Linux only)
if [[ "$(uname)" == "Linux" ]]; then
  echo "Installing Tauri system dependencies..."
  sudo apt-get update -qq
  sudo apt-get install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev 2>/dev/null || \
  sudo dnf install -y \
    webkit2gtk3-devel \
    openssl-devel \
    curl \
    wget \
    libappindicator-gtk3-devel \
    librsvg2-devel 2>/dev/null || true
fi

echo "Installing npm dependencies..."
cd "$(dirname "$0")"
npm install

echo ""
echo "Setup complete. Run 'npm run tauri dev' to start the development server."
