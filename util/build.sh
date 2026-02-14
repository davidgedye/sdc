#!/usr/bin/env bash
set -euo pipefail

# Build a Seadragon collection from a directory of images.
# Usage: ./util/build.sh <image-directory>
#
# Generates DZI tiles (tile size 510) and an index.html viewer page
# inside the given directory.

if [ $# -lt 1 ]; then
    echo "Usage: $0 <image-directory>"
    exit 1
fi

DIR="$1"

if [ ! -d "$DIR" ]; then
    echo "Error: '$DIR' is not a directory"
    exit 1
fi

# Collect DZI filenames as we generate them
dzi_files=()

for img in "$DIR"/*.jpg "$DIR"/*.jpeg "$DIR"/*.png "$DIR"/*.tif "$DIR"/*.tiff; do
    [ -f "$img" ] || continue

    base=$(basename "$img")
    name="${base%.*}"

    # Skip if DZI already exists
    if [ -f "$DIR/${name}.dzi" ]; then
        echo "Skipping $base (DZI already exists)"
        dzi_files+=("${name}.dzi")
        continue
    fi

    echo "Processing $base ..."
    vips dzsave "$img" "$DIR/$name" --tile-size 510 --overlap 1 --suffix .jpg[Q=85]
    dzi_files+=("${name}.dzi")
done

if [ ${#dzi_files[@]} -eq 0 ]; then
    echo "No images found in '$DIR'"
    exit 1
fi

echo "Generating index.html with ${#dzi_files[@]} images ..."

# Write images.js data file with dimensions extracted from DZI XML
echo -n "var images = [" > "$DIR/images.js"
first=true
for dzi in "${dzi_files[@]}"; do
    dzi_path="$DIR/$dzi"
    w=$(grep -oP 'Width="\K[0-9]+' "$dzi_path")
    h=$(grep -oP 'Height="\K[0-9]+' "$dzi_path")
    if [ "$first" = true ]; then
        first=false
    else
        echo -n "," >> "$DIR/images.js"
    fi
    echo "" >> "$DIR/images.js"
    echo -n "    { \"dzi\": \"${dzi}\", \"w\": ${w}, \"h\": ${h} }" >> "$DIR/images.js"
done
echo "" >> "$DIR/images.js"
echo "];" >> "$DIR/images.js"

# Get directory basename for the page title
collection_name=$(basename "$DIR")

cat > "$DIR/index.html" << HTMLEOF
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


echo "Done. Serve and open ${DIR}/index.html"
