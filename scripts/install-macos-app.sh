#!/bin/bash
# Create double-clickable macOS apps in ~/Applications that start/stop the
# local server and open the web app.

set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$HOME/Applications"

mkdir -p "$APPS_DIR"

make_icon() {
  local app="$1"
  local icon_src="$ROOT/scripts/AppIcon.svg"

  [ -f "$icon_src" ] || return 0
  command -v sips >/dev/null 2>&1 || return 0
  command -v iconutil >/dev/null 2>&1 || return 0

  local work
  work="$(mktemp -d)"
  mkdir -p "$work/AppIcon.iconset"

  if sips -s format png "$icon_src" --out "$work/icon.png" >/dev/null 2>&1; then
    local size
    for size in 16 32 128 256 512; do
      sips -z "$size" "$size" "$work/icon.png" \
        --out "$work/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null 2>&1
      sips -z $((size * 2)) $((size * 2)) "$work/icon.png" \
        --out "$work/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null 2>&1
    done
    if iconutil -c icns "$work/AppIcon.iconset" -o "$work/AppIcon.icns" >/dev/null 2>&1; then
      cp "$work/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
    fi
  fi

  rm -rf "$work"
}

make_app() {
  local name="$1"
  local bundle_id="$2"
  local launcher="$3"
  local app="$APPS_DIR/$name.app"

  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

  cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIdentifier</key>
  <string>$bundle_id</string>
  <key>CFBundleName</key>
  <string>$name</string>
  <key>CFBundleDisplayName</key>
  <string>$name</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
EOF

  cat > "$app/Contents/MacOS/launcher" <<EOF
#!/bin/bash
exec "$launcher"
EOF
  chmod +x "$app/Contents/MacOS/launcher"

  make_icon "$app"
  touch "$app"
  echo "Created: $app"
}

make_app "Eisenhower Matrix" "local.eisenhower-matrix.launch" "$ROOT/scripts/launch-app.sh"
make_app "Eisenhower Matrix Stop" "local.eisenhower-matrix.stop" "$ROOT/scripts/stop-app.sh"

echo
echo "Open the app from Launchpad, or drag it to the Dock."
