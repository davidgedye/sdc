#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
DEPLOY_DIR="$REPO_ROOT/.deploy"

# Find all collection directories (those with a .source file)
collections=()
for source_file in "$REPO_ROOT"/*/.source; do
    [ -f "$source_file" ] || continue
    collections+=("$(basename "$(dirname "$source_file")")")
done

if [ ${#collections[@]} -eq 0 ]; then
    echo "Error: no collections found (no */.source files)"
    exit 1
fi

# Ensure collections have been built
for col in "${collections[@]}"; do
    if [ ! -f "$REPO_ROOT/$col/index.html" ]; then
        echo "Error: $col/index.html not found. Run util/build.sh $col first."
        exit 1
    fi
done

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
for col in "${collections[@]}"; do
    rsync -a --delete --exclude .source "$REPO_ROOT/$col/" "$DEPLOY_DIR/$col/"
done
cp "$REPO_ROOT/viewer.js" "$DEPLOY_DIR/"

# Commit and push
cd "$DEPLOY_DIR"
git add -A
if git diff --cached --quiet; then
    echo "Nothing new to deploy."
else
    echo "Deploying:"
    git diff --cached --stat | tail -1
    git commit -m "Deploy $(date -u +%Y-%m-%d)"
    git push origin gh-pages
    echo "Deployed!"
fi
