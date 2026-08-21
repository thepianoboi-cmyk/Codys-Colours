#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Codys Colours"
EXTENSION_ID="com.ultimatum.codyscolours"
DIST_DIR="$ROOT/dist"
BUILD_DIR="$DIST_DIR/build"
STAGE_DIR="$BUILD_DIR/$APP_NAME"
ZXP_SIGN_CMD="${ZXP_SIGN_CMD:-$ROOT/tools/vendor/ZXPSignCmd}"
CERT="$BUILD_DIR/$APP_NAME-selfsigned.p12"
PASSWORD="${CODYS_COLOURS_CERT_PASSWORD:-codys-colours-local}"

mkdir -p "$DIST_DIR"
find "$DIST_DIR" -name '.DS_Store' -delete
rm -rf "$BUILD_DIR"
mkdir -p "$STAGE_DIR"

rsync -a --delete "$ROOT/extension/" "$STAGE_DIR/"
find "$STAGE_DIR" -name '.DS_Store' -delete
find "$STAGE_DIR" -name '__MACOSX' -type d -prune -exec rm -rf {} +

if find "$STAGE_DIR" -type l | grep -q .; then
  echo "Refusing to package: symlinks found in $STAGE_DIR" >&2
  find "$STAGE_DIR" -type l >&2
  exit 1
fi

rm -f "$DIST_DIR/$APP_NAME CEP Source.zip" "$DIST_DIR/$APP_NAME.zxp"
(cd "$BUILD_DIR" && zip -qry "$DIST_DIR/$APP_NAME CEP Source.zip" "$APP_NAME")

if [[ -x "$ZXP_SIGN_CMD" ]]; then
  if [[ ! -f "$CERT" ]]; then
    "$ZXP_SIGN_CMD" -selfSignedCert AU NSW Ultimatum "$APP_NAME" "$PASSWORD" "$CERT"
  fi
  if ! "$ZXP_SIGN_CMD" -sign "$STAGE_DIR" "$DIST_DIR/$APP_NAME.zxp" "$CERT" "$PASSWORD" -tsa https://timestamp.digicert.com; then
    echo "Timestamp server was unreachable; retrying local ZXP signing without TSA." >&2
    "$ZXP_SIGN_CMD" -sign "$STAGE_DIR" "$DIST_DIR/$APP_NAME.zxp" "$CERT" "$PASSWORD"
  fi
  "$ZXP_SIGN_CMD" -verify "$DIST_DIR/$APP_NAME.zxp"
  rm -f "$CERT"
  echo "Signed ZXP: $DIST_DIR/$APP_NAME.zxp"
else
  echo "ZXPSignCmd not found at $ZXP_SIGN_CMD; created unsigned upload ZIP only." >&2
fi

echo "CEP source ZIP: $DIST_DIR/$APP_NAME CEP Source.zip"
echo "Package staging folder: $STAGE_DIR"
