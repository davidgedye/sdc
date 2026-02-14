#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(dirname "$0")

"$SCRIPT_DIR/build.sh" montages
"$SCRIPT_DIR/deploy.sh"
