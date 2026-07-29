#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
BROWSER_EXECUTABLE="${BROWSER_EXECUTABLE:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
REMOTION_ENTRY="video/remotion/index.tsx"
COMPOSITION="CountySceneLoop"
PORT=3120

"$PYTHON_BIN" scripts/prepare-county-scene-assets.py

for room in hall treasury council works; do
  for state in stable strained deficit; do
    source_path="world/county/$room/$state/source.png"
    output_dir="public/scenes/county/$room/$state"
    mkdir -p "$output_dir"

    props="{\"imagePath\":\"$source_path\",\"state\":\"$state\",\"room\":\"$room\"}"

    pnpm exec remotion render "$REMOTION_ENTRY" "$COMPOSITION" \
      "$output_dir/loop.mp4" \
      --public-dir=video/sources \
      --codec=h264 \
      --crf=24 \
      --concurrency=1 \
      --port="$PORT" \
      --props="$props" \
      --browser-executable="$BROWSER_EXECUTABLE"
    PORT=$((PORT + 1))

    pnpm exec remotion render "$REMOTION_ENTRY" "$COMPOSITION" \
      "$output_dir/loop.webm" \
      --public-dir=video/sources \
      --codec=vp8 \
      --crf=30 \
      --concurrency=1 \
      --port="$PORT" \
      --props="$props" \
      --browser-executable="$BROWSER_EXECUTABLE"
    PORT=$((PORT + 1))
  done
done
