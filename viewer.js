var gap = 0.01; // gap between images in viewport coords
var totalWidth = 1; // layout fits in [0, 1] horizontally

// Caption data loaded from captions.json (if present)
var captionLines = 0;
var captionData = {};
fetch("captions.json").then(function(r) {
    if (!r.ok) return;
    return r.json();
}).then(function(data) {
    if (!data) return;
    captionLines = data.captionLines || 0;
    captionData = data.captions || {};
}).catch(function() {});

function computeLayout(images, viewportAspect) {
    var n = images.length;
    var targetHeight = totalWidth / viewportAspect;

    // Global scale factor s: every image gets width = s*w, height = s*h.
    // Greedy row packing: add images left-to-right until the next
    // image would exceed totalWidth, then start a new row.
    // Binary search for s so total layout height ≈ targetHeight.

    // Sort by height so similar-height images share rows, minimizing dead space
    var order = images.map(function(_, i) { return i; });
    order.sort(function(a, b) { return images[a].h - images[b].h; });

    function packRows(s) {
        var rows = [];
        var i = 0;
        while (i < n) {
            var rowW = 0, hMax = 0, start = i;
            while (i < n) {
                var idx = order[i];
                var imgW = s * images[idx].w;
                var needed = rowW > 0 ? rowW + gap + imgW : imgW;
                if (rowW > 0 && needed > totalWidth) break;
                rowW = needed;
                var imgH = s * images[idx].h;
                if (imgH > hMax) hMax = imgH;
                i++;
            }
            rows.push({ start: start, end: i, hMax: hMax });
        }
        return rows;
    }

    function layoutHeight(s) {
        var rows = packRows(s);
        var h = 0;
        for (var i = 0; i < rows.length; i++) h += rows[i].hMax;
        return h + (rows.length - 1) * gap;
    }

    // Binary search: larger s => bigger images => taller layout
    var lo = 0, hi = totalWidth / Math.min.apply(null, images.map(function(img) { return img.w; }));
    for (var iter = 0; iter < 60; iter++) {
        var mid = (lo + hi) / 2;
        if (layoutHeight(mid) < targetHeight) lo = mid;
        else hi = mid;
    }
    var s = (lo + hi) / 2;

    // Place images with final s
    var rows = packRows(s);
    var placements = [];
    var y = 0;
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var x = 0;
        for (var k = row.start; k < row.end; k++) {
            var idx = order[k];
            var imgW = s * images[idx].w;
            var imgH = s * images[idx].h;
            placements.push({
                dzi: images[idx].dzi,
                x: x,
                y: y + row.hMax - imgH,
                width: imgW,
                height: imgH
            });
            x += imgW + gap;
        }
        y += row.hMax + gap;
    }

    return { placements: placements, totalHeight: y - gap };
}

var viewerEl = document.getElementById("viewer");
var viewportAspect = viewerEl.clientWidth / viewerEl.clientHeight;
var layout = computeLayout(images, viewportAspect);

var tiledImages = [];
var loaded = 0;
var startScale = 0.001;
var gx = totalWidth * 0.01;
var gy = layout.totalHeight * 0.01;
var tileSources = layout.placements.map(function(p, i) {
    var centerX = gx + p.x + p.width / 2;
    var centerY = gy + p.y + p.height / 2;
    var startW = p.width * startScale;
    return {
        tileSource: p.dzi,
        x: centerX - startW / 2,
        y: centerY - p.height * startScale / 2,
        width: startW,
        opacity: 0,
        success: function(event) {
            tiledImages[i] = event.item;
            loaded++;
            if (loaded === layout.placements.length) {
                for (var j = 0; j < tiledImages.length; j++) {
                    tiledImages[j].setOpacity(1);
                    tiledImages[j].setPosition(
                        new OpenSeadragon.Point(gx + layout.placements[j].x, gy + layout.placements[j].y)
                    );
                    tiledImages[j].setWidth(layout.placements[j].width);
                }
                // Reset to snappy animation on first interaction
                function snapSprings() {
                    viewer.viewport.centerSpringX.animationTime = 3.5;
                    viewer.viewport.centerSpringY.animationTime = 3.5;
                    viewer.viewport.zoomSpring.animationTime = 3.5;
                    viewerEl.removeEventListener("pointerdown", snapSprings, true);
                    viewerEl.removeEventListener("wheel", snapSprings, true);
                    window.removeEventListener("keydown", snapSprings, true);
                }
                viewerEl.addEventListener("pointerdown", snapSprings, true);
                viewerEl.addEventListener("wheel", snapSprings, true);
                window.addEventListener("keydown", snapSprings, true);
            }
        }
    };
});

var viewer = OpenSeadragon({
    id: "viewer",
    prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@5.0/build/openseadragon/images/",
    drawer: "canvas",
    showNavigator: false,
    animationTime: 10,
    gestureSettingsMouse: { clickToZoom: false },
    gestureSettingsPen: { clickToZoom: false },
    tileSources: tileSources
});

var homeBounds = new OpenSeadragon.Rect(0, 0, totalWidth + gx * 2, layout.totalHeight + gy * 2);

viewer.addHandler("open", function() {
    viewer.viewport.fitBounds(homeBounds, true);
});

viewer.viewport.goHome = function() {
    viewer.viewport.fitBounds(homeBounds);
};

function zoomToImage(i) {
    var bounds = tiledImages[i].getBounds();
    var bx = bounds.width * 0.02;
    var by = bounds.height * 0.02;
    var captionVp = 0;
    if (captionLines > 0) {
        var rectWidth = bounds.width + bx * 2;
        captionVp = captionLines * 28 * rectWidth / viewerEl.clientWidth;
    }
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(
        bounds.x - bx, bounds.y - by,
        bounds.width + bx * 2, bounds.height + by * 2 + captionVp
    ));
}

function visibleFraction(ti, vb) {
    var b = ti.getBounds();
    var l = Math.max(b.x, vb.x), t = Math.max(b.y, vb.y);
    var r = Math.min(b.x + b.width, vb.x + vb.width);
    var bot = Math.min(b.y + b.height, vb.y + vb.height);
    if (r <= l || bot <= t) return 0;
    return (r - l) * (bot - t) / (b.width * b.height);
}

function isFeatured(ti, vb) {
    var b = ti.getBounds();
    return visibleFraction(ti, vb) > 0.9 &&
        (b.width / vb.width > 0.8 || b.height / vb.height > 0.8);
}

// Click to zoom; when already zoomed, left/right third navigates
viewer.addHandler("canvas-click", function(event) {
    if (!event.quick) return;
    var pos = viewer.viewport.pointFromPixel(event.position);
    var vb = viewer.viewport.getBounds();
    for (var i = 0; i < tiledImages.length; i++) {
        if (!tiledImages[i]) continue;
        var bounds = tiledImages[i].getBounds();
        if (!bounds.containsPoint(pos)) continue;
        if (isFeatured(tiledImages[i], vb)) {
            var xFrac = (pos.x - bounds.x) / bounds.width;
            if (xFrac < 0.333 && i > 0) zoomToImage(i - 1);
            else if (xFrac > 0.666 && i < tiledImages.length - 1) zoomToImage(i + 1);
        } else {
            zoomToImage(i);
        }
        break;
    }
});

// Arrow keys navigate between images when zoomed in
function findFeaturedIndex() {
    var vb = viewer.viewport.getBounds();
    var bestIndex = -1, bestFrac = 0;
    for (var i = 0; i < tiledImages.length; i++) {
        if (!tiledImages[i]) continue;
        if (!isFeatured(tiledImages[i], vb)) continue;
        var f = visibleFraction(tiledImages[i], vb);
        if (f > bestFrac) { bestFrac = f; bestIndex = i; }
    }
    return bestIndex;
}

// Text overlay: separate canvas layered on top of OSD, redrawn each frame
var textCanvas = document.createElement("canvas");
textCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none";
viewer.container.appendChild(textCanvas);
var textCtx = textCanvas.getContext("2d");

function resizeTextCanvas() {
    var ratio = window.devicePixelRatio || 1;
    textCanvas.width = viewerEl.clientWidth * ratio;
    textCanvas.height = viewerEl.clientHeight * ratio;
    textCanvas.style.width = viewerEl.clientWidth + "px";
    textCanvas.style.height = viewerEl.clientHeight + "px";
}
resizeTextCanvas();
new ResizeObserver(resizeTextCanvas).observe(viewerEl);

// Font size in viewport coords — sized to fit in the gap between rows
var labelFontVp = gap * 0.6;
var labelMinPx = 10;
var labelMaxPx = 24;

// Precompute label text from DZI filenames
var labels = layout.placements.map(function(p) {
    return p.dzi.replace(".dzi", "").replace(/[-_]/g, " ");
});

viewer.addHandler("update-viewport", function() {
    var ratio = window.devicePixelRatio || 1;
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    var vb = viewer.viewport.getBounds(true);
    var pxPerUnit = viewerEl.clientWidth / vb.width;
    var fontPx = labelFontVp * pxPerUnit;

    // Fade out below minimum size
    var alpha = 1;
    if (fontPx < labelMinPx) alpha = Math.max(0, fontPx / labelMinPx);
    if (alpha < 0.02) return;

    // Clamp above maximum size
    var drawPx = Math.min(fontPx, labelMaxPx);

    textCtx.save();
    textCtx.scale(ratio, ratio);
    textCtx.font = drawPx.toFixed(2) + "px sans-serif";
    textCtx.fillStyle = "rgba(255,255,255," + alpha + ")";
    textCtx.textAlign = "center";
    textCtx.textBaseline = "top";

    for (var i = 0; i < tiledImages.length; i++) {
        if (!tiledImages[i]) continue;
        var b = tiledImages[i].getBounds(true);
        var cx = b.x + b.width / 2;
        var ty = b.y + b.height + gap * 0.15;

        // Viewport culling
        if (cx < vb.x - b.width || cx > vb.x + vb.width + b.width) continue;
        if (ty < vb.y || ty > vb.y + vb.height) continue;

        var pixel = viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(cx, ty), true);
        textCtx.fillText(labels[i], pixel.x, pixel.y);
    }
    textCtx.restore();
});

// Block OSD's default keyboard panning so it doesn't fight with our navigation
viewer.addHandler("canvas-key", function(event) {
    event.preventHorizontalPan = true;
    event.preventVerticalPan = true;
});

window.addEventListener("keydown", function(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    var idx = findFeaturedIndex();
    if (idx === -1) return;
    var next = idx + (event.key === "ArrowLeft" ? -1 : 1);
    if (next >= 0 && next < tiledImages.length) {
        zoomToImage(next);
    }
});
