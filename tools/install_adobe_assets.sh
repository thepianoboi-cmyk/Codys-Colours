#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Codys Colours"
EXTENSION_ID="com.ultimatum.codyscolours"
OLD_EXTENSION_ID="com.ultimatum.spotcolourassistant"

CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/$EXTENSION_ID"
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"
AI_SCRIPT_DIR="$HOME/Library/Application Support/Adobe/Adobe Illustrator 30/en_US/Scripts"
AI_SWATCH_DIR="$HOME/Library/Application Support/Adobe/Adobe Illustrator 30/en_US/Swatches"
PS_SCRIPT_DIR="$HOME/Library/Application Support/Adobe/Adobe Photoshop 2025/Presets/Scripts"
PS_SWATCH_DIR="$HOME/Library/Application Support/Adobe/Adobe Photoshop 2025/Presets/Color Swatches"

mkdir -p "$AI_SCRIPT_DIR" "$AI_SWATCH_DIR" "$PS_SCRIPT_DIR" "$PS_SWATCH_DIR"
rm -rf "$HOME/Library/Application Support/Adobe/CEP/extensions/$OLD_EXTENSION_ID"
rm -rf "$CEP_DIR"
rm -f "$AI_SCRIPT_DIR/Spot Colour Assistant - Illustrator.jsx"
rm -f "$PS_SCRIPT_DIR/Spot Colour Assistant - Photoshop.jsx"
rm -f "$AI_SWATCH_DIR/Spot Colour Assistant.ase"
rm -f "$PS_SWATCH_DIR/Spot Colour Assistant.ase"
if [[ -f "$ROOT/dist/$APP_NAME.zxp" && -x "$UPIA" ]]; then
  "$UPIA" --remove "$APP_NAME" >/dev/null 2>&1 || true
  "$UPIA" --install "$ROOT/dist/$APP_NAME.zxp"
else
  mkdir -p "$CEP_DIR"
  rsync -a --delete "$ROOT/extension/" "$CEP_DIR/"
fi

cp "$ROOT/scripts/$APP_NAME - Illustrator.jsx" "$AI_SCRIPT_DIR/"
cp "$ROOT/scripts/$APP_NAME - Photoshop.jsx" "$PS_SCRIPT_DIR/"
if [[ -f "$ROOT/output/$APP_NAME.ase" ]]; then
  cp "$ROOT/output/$APP_NAME.ase" "$AI_SWATCH_DIR/"
  cp "$ROOT/output/$APP_NAME.ase" "$PS_SWATCH_DIR/"
  INSTALLED_ASE=1
else
  INSTALLED_ASE=0
fi

for version in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$version" PlayerDebugMode 1
done

echo "Installed $APP_NAME CEP panel:"
if [[ -f "$ROOT/dist/$APP_NAME.zxp" ]]; then
  echo "  $ROOT/dist/$APP_NAME.zxp"
else
  echo "  $CEP_DIR"
fi
echo "Installed fallback scripts:"
echo "  $AI_SCRIPT_DIR/$APP_NAME - Illustrator.jsx"
echo "  $PS_SCRIPT_DIR/$APP_NAME - Photoshop.jsx"
if [[ "$INSTALLED_ASE" == "1" ]]; then
  echo "Installed ASE swatch libraries:"
  echo "  $AI_SWATCH_DIR/$APP_NAME.ase"
  echo "  $PS_SWATCH_DIR/$APP_NAME.ase"
else
  echo "No bundled ASE swatch library in this public build."
  echo "Import authorised CSV or JSON colour libraries from the Codys Colours panel."
fi
