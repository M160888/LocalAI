#!/bin/bash
# Full build: extension VSIX + Tauri app
set -e

echo "=== Building VSCodium Extension ==="
bash "$(dirname "$0")/build-extension.sh"

echo ""
echo "=== Building Tauri App ==="
cd "$(dirname "$0")"

# Install frontend deps
npm install

# Build
npm run tauri build

echo ""
echo "Done. Binaries in src-tauri/target/release/bundle/"
