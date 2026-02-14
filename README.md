# Seadragon Deep Collection (SDC)

A static site for browsing collections of high-resolution zoomable images. Each collection is a directory of [DZI](https://en.wikipedia.org/wiki/Deep_Zoom) tiles displayed in a proportional montage layout using [OpenSeadragon](https://openseadragon.github.io/).

Live: https://davidgedye.github.io/sdc/montages/

## Project structure

```
sdc/
  viewer.js                # Shared viewer: layout, zoom, navigation
  util/
    build.sh               # Generates DZI tiles + images.js + index.html
  montages/                # One image collection (more can be added)
    index.html             # Minimal page that loads viewer.js
    images.js              # Image names and pixel dimensions (generated)
    *.dzi                  # DZI descriptors (generated)
    *_files/               # Tile pyramids (generated)
    *.jpg                  # Source images
```

To add a new collection, create a directory with source images and run the build script. The generated `index.html` loads `../viewer.js`, so all collections share the same viewer code.

## How the viewer works

`viewer.js` expects a global `images` array (set by `images.js`) where each entry has `{ dzi, w, h }` — the DZI filename and original pixel dimensions.

**Layout:** A global scale factor `s` is applied to all images so their relative pixel sizes are preserved. Images are sorted by height, then packed into rows greedily (like word-wrap). Binary search finds the `s` that makes the total layout height match the viewport.

**Interaction:**
- Click an image to zoom in
- When zoomed, click the left or right third of the image to navigate to the previous/next image
- Arrow keys also navigate when zoomed in
- Smooth 3.5s zoom animation via OSD canvas drawer

## Build script

```bash
./util/build.sh <image-directory>
```

Requires [libvips](https://www.libvips.org/). For each source image (jpg, jpeg, png, tif, tiff):

1. Generates DZI tiles (`vips dzsave`, tile size 510, overlap 1, JPEG Q=85)
2. Skips images that already have a `.dzi` file
3. Writes `images.js` with dimensions extracted from the DZI XML
4. Writes `index.html` (loads OSD from CDN, `images.js`, and `../viewer.js`)

## Hosting

Fully static — just serve the `sdc/` directory. DZI tiles are plain files; no server-side processing needed.

```bash
# Local development
python3 -m http.server

# Then open http://localhost:8000/montages/
```

Also works on GitHub Pages, S3, Cloudflare Pages, or any static host.
