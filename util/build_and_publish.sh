#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
SCRIPT_DIR="$REPO_ROOT/util"

# Build every collection that has a .source file
found=false
for source_file in "$REPO_ROOT"/*/.source; do
    [ -f "$source_file" ] || continue
    found=true
    collection=$(dirname "$source_file")
    echo "=== Building $(basename "$collection") ==="
    "$SCRIPT_DIR/build.sh" "$collection"
    echo ""
done

if [ "$found" = false ]; then
    echo "No collections found (no */.source files)"
    exit 1
fi

"$SCRIPT_DIR/deploy.sh"
