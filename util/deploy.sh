#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
DEPLOY_DIR="$REPO_ROOT/.deploy"

# Ensure montages have been built
if [ ! -f "$REPO_ROOT/montages/index.html" ]; then
    echo "Error: montages/index.html not found. Run util/build.sh first."
    exit 1
fi

# Create gh-pages branch if it doesn't exist
if ! git -C "$REPO_ROOT" rev-parse --verify gh-pages >/dev/null 2>&1; then
    echo "Creating gh-pages branch..."
    EMPTY_TREE=$(git -C "$REPO_ROOT" mktree < /dev/null)
    COMMIT=$(git -C "$REPO_ROOT" commit-tree "$EMPTY_TREE" -m "Initial gh-pages")
    git -C "$REPO_ROOT" branch gh-pages "$COMMIT"
fi

# Set up worktree if needed
if [ ! -d "$DEPLOY_DIR" ]; then
    git -C "$REPO_ROOT" worktree add "$DEPLOY_DIR" gh-pages
fi

# Sync deployment files
rsync -a --delete "$REPO_ROOT/montages/" "$DEPLOY_DIR/montages/"
cp "$REPO_ROOT/viewer.js" "$DEPLOY_DIR/"

# Commit and push
cd "$DEPLOY_DIR"
git add -A
if git diff --cached --quiet; then
    echo "Nothing new to deploy."
else
    git commit -m "Deploy $(date -u +%Y-%m-%d)"
    git push origin gh-pages
    echo "Deployed!"
fi
