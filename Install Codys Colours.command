#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

chmod +x tools/build_adobe_package.sh tools/install_adobe_assets.sh 2>/dev/null || true
chmod +x tools/vendor/ZXPSignCmd 2>/dev/null || true

if [[ ! -f "dist/Codys Colours.zxp" ]]; then
  echo "Building Codys Colours package..."
  ./tools/build_adobe_package.sh
fi

echo "Installing Codys Colours..."
./tools/install_adobe_assets.sh

echo ""
echo "Done. Restart Illustrator or Photoshop, then open:"
echo "Window > Extensions (Legacy) > Codys Colours"
echo ""
echo "Press any key to close."
read -k 1
