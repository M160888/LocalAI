#!/bin/bash
# Build the VSCodium extension VSIX
set -e

cd "$(dirname "$0")/extension"

echo "Installing extension dev dependencies..."
npm install

echo "Compiling TypeScript..."
npm run compile

echo "Packaging VSIX..."
npx vsce package --out ../local-ai-studio-panel.vsix

echo ""
echo "Built: $(dirname "$0")/local-ai-studio-panel.vsix"
echo "Install with: codium --install-extension local-ai-studio-panel.vsix"
