#!/usr/bin/env bash
set -euo pipefail

# Rewrite images.js using physical dimensions parsed from source filenames.
# Filename format: Title.HxW.Year.ext
# Overwrites the w/h in images.js so the layout reflects real-world proportions.
# Usage: ./util/physical_dims.sh <collection-directory>

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

echo -n "var images = [" > "$OUT/images.js"
first=true

for img in "$SRC"/*.jpg "$SRC"/*.jpeg "$SRC"/*.JPG "$SRC"/*.JPEG "$SRC"/*.png "$SRC"/*.PNG "$SRC"/*.tif "$SRC"/*.tiff; do
    [ -f "$img" ] || continue

    base=$(basename "$img")
    name="${base%.*}"
    dzi="$OUT/${name}.dzi"

    [ -f "$dzi" ] || { echo "Warning: no DZI for '$name', skipping"; continue; }

    # Filename format: Title.HxW.Year  (last two dot-parts are HxW and Year)
    year="${name##*.}"
    remainder="${name%.*}"
    dims="${remainder##*.}"
    title="${remainder%.*}"

    h="${dims%x*}"
    w="${dims#*x}"

    if [ "$first" = true ]; then
        first=false
    else
        echo -n "," >> "$OUT/images.js"
    fi
    echo "" >> "$OUT/images.js"
    echo -n "    { \"dzi\": \"${name}.dzi\", \"w\": ${w}, \"h\": ${h} }" >> "$OUT/images.js"
done

echo "" >> "$OUT/images.js"
echo "];" >> "$OUT/images.js"

echo "Done: physical dimensions written to $OUT/images.js"
