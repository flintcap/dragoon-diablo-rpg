#!/usr/bin/env bash
# Vendored engine: Three.js r128 (UMD build, works without modules/bundler).
# Pinned URL — restores js/three.min.js byte-identical to what the game was built against.
set -e
cd "$(dirname "$0")/../app/js"
curl -sL -o three.min.js https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
echo "three.min.js restored ($(wc -c < three.min.js) bytes)"
