#!/usr/bin/env bash
set -euo pipefail

# Build a Seadragon collection from source images.
# Usage: ./util/build.sh <collection-directory>
#
# Reads the source image path from <collection-directory>/.source,
# generates DZI tiles, images.js, and index.html in <collection-directory>.

if [ $# -lt 1 ]; then
    echo "Usage: $0 <collection-directory>"
    exit 1
fi

OUT="$1"
SOURCE_FILE="$OUT/.source"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: '$SOURCE_FILE' not found"
    exit 1
fi

SRC=$(head -1 "$SOURCE_FILE")

if [ ! -d "$SRC" ]; then
    echo "Error: source directory '$SRC' does not exist"
    exit 1
fi

mkdir -p "$OUT"

# Collect DZI filenames as we generate them
dzi_files=()
built=()

for img in "$SRC"/*.jpg "$SRC"/*.jpeg "$SRC"/*.png "$SRC"/*.tif "$SRC"/*.tiff; do
    [ -f "$img" ] || continue

    base=$(basename "$img")
    name="${base%.*}"

    # Skip if DZI exists and is newer than the source image
    if [ -f "$OUT/${name}.dzi" ] && [ "$OUT/${name}.dzi" -nt "$img" ]; then
        dzi_files+=("${name}.dzi")
        continue
    fi

    echo "Building $base ..."
    vips dzsave "$img" "$OUT/$name" --tile-size 510 --overlap 1 --suffix .jpg[Q=85]
    dzi_files+=("${name}.dzi")
    built+=("$base")
done

if [ ${#dzi_files[@]} -eq 0 ]; then
    echo "No images found in '$SRC'"
    exit 1
fi

# Remove orphaned DZIs (source image was deleted)
removed=()
for dzi_path in "$OUT"/*.dzi; do
    [ -f "$dzi_path" ] || continue
    name=$(basename "$dzi_path" .dzi)
    has_source=false
    for ext in jpg jpeg png tif tiff; do
        if [ -f "$SRC/${name}.${ext}" ]; then
            has_source=true
            break
        fi
    done
    if [ "$has_source" = false ]; then
        echo "Removing orphaned $name (source image deleted)"
        rm -f "$dzi_path"
        rm -rf "$OUT/${name}_files"
        removed+=("$name")
    fi
done

# Write images.js data file with dimensions extracted from DZI XML
echo -n "var images = [" > "$OUT/images.js"
first=true
for dzi in "${dzi_files[@]}"; do
    dzi_path="$OUT/$dzi"
    w=$(grep -oP 'Width="\K[0-9]+' "$dzi_path")
    h=$(grep -oP 'Height="\K[0-9]+' "$dzi_path")
    if [ "$first" = true ]; then
        first=false
    else
        echo -n "," >> "$OUT/images.js"
    fi
    echo "" >> "$OUT/images.js"
    echo -n "    { \"dzi\": \"${dzi}\", \"w\": ${w}, \"h\": ${h} }" >> "$OUT/images.js"
done
echo "" >> "$OUT/images.js"
echo "];" >> "$OUT/images.js"

# Get directory basename for the page title
collection_name=$(basename "$OUT")

cat > "$OUT/index.html" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${collection_name} — Seadragon Collection</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a1a; }
        #viewer { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="viewer"></div>
    <script src="https://cdn.jsdelivr.net/npm/openseadragon@5.0/build/openseadragon/openseadragon.min.js"></script>
    <script src="images.js"></script>
    <script src="../viewer.js"></script>
</body>
</html>
HTMLEOF

# Copy captions.json from source dir if present
if [ -f "$SRC/captions.json" ]; then
    cp "$SRC/captions.json" "$OUT/captions.json"
fi

echo "Build: ${#built[@]} new/updated, ${#removed[@]} removed, $((${#dzi_files[@]} - ${#built[@]})) up to date, ${#dzi_files[@]} total"
