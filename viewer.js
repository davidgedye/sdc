var cfg = (typeof viewerConfig !== "undefined" && viewerConfig) || {};
var gap = cfg.gap !== undefined ? cfg.gap : 0.02;
var gapY = cfg.gapY !== undefined ? cfg.gapY : gap;
var totalWidth = 1; // layout fits in [0, 1] horizontally
var initialHash = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";

function computeLayout(images, viewportAspect) {
    var n = images.length;
    var targetHeight = totalWidth / viewportAspect;

    // Global scale factor s: every image gets width = s*w, height = s*h.
    // Greedy row packing: add images left-to-right until the next
    // image would exceed totalWidth, then start a new row.
    // Binary search for s so total layout height ≈ targetHeight.

    // Sort images for row-packing. Default: by height. Config can override.
    var order = images.map(function(_, i) { return i; });
    if (cfg.imageOrder && cfg.imageOrder.length) {
        var keyToIdx = {};
        images.forEach(function(img, i) { keyToIdx[img.dzi.replace(/\.dzi$/, "")] = i; });
        var seen = {};
        order = [];
        cfg.imageOrder.forEach(function(key) {
            if (keyToIdx[key] !== undefined && !seen[key]) {
                order.push(keyToIdx[key]);
                seen[key] = true;
            }
        });
        images.forEach(function(_, i) {
            if (!seen[images[i].dzi.replace(/\.dzi$/, "")]) order.push(i);
        });
    } else if (cfg.sortBy === "area") {
        order.sort(function(a, b) { return images[a].w * images[a].h - images[b].w * images[b].h; });
    } else {
        order.sort(function(a, b) { return images[a].h - images[b].h; });
    }
    if (cfg.sortReverse) order.reverse();

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
            rows.push({ start: start, end: i, hMax: hMax, rowW: rowW });
        }
        return rows;
    }

    function layoutHeight(s) {
        var rows = packRows(s);
        var h = 0;
        for (var i = 0; i < rows.length; i++) h += rows[i].hMax;
        return h + (rows.length - 1) * gapY;
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
        var x = (totalWidth - row.rowW) / 2;
        for (var k = row.start; k < row.end; k++) {
            var idx = order[k];
            var imgW = s * images[idx].w;
            var imgH = s * images[idx].h;
            placements.push({
                dzi: images[idx].dzi,
                x: x,
                y: y + row.hMax - imgH,
                width: imgW,
                height: imgH,
                row: r
            });
            x += imgW + gap;
        }
        y += row.hMax + gapY;
    }

    return { placements: placements, totalHeight: y - gap };
}

var viewerEl = document.getElementById("viewer");
var viewportAspect = viewerEl.clientWidth / viewerEl.clientHeight;
var layout = computeLayout(images, viewportAspect);

var tiledImages = [];
var loaded = 0;
var startScale = 0.001;
var gutterFraction = cfg.gutterFraction !== undefined ? cfg.gutterFraction : 0.02;
var gutterFractionY = cfg.gutterFractionY !== undefined ? cfg.gutterFractionY : gutterFraction;
var gx = totalWidth * gutterFraction;
var gy = layout.totalHeight * gutterFractionY;
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
                // Navigate to hash target after intro animation
                if (initialHash) {
                    for (var j = 0; j < layout.placements.length; j++) {
                        if (imageKey(j) === initialHash) {
                            hashNavPending = true;
                            (function(target) {
                                setTimeout(function() {
                                    hashNavPending = false;
                                    // Snap all images to final positions immediately
                                    for (var k = 0; k < tiledImages.length; k++) {
                                        tiledImages[k].setPosition(
                                            new OpenSeadragon.Point(gx + layout.placements[k].x, gy + layout.placements[k].y), true
                                        );
                                        tiledImages[k].setWidth(layout.placements[k].width, true);
                                    }
                                    snapSprings();
                                    zoomToImage(target);
                                }, 3000);
                            })(j);
                            break;
                        }
                    }
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
    showZoomControl: false,
    showHomeControl: false,
    showFullPageControl: false,
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
    history.replaceState(null, "", location.pathname + location.search);
};

function relayout() {
    if (loaded < images.length) return;
    layout = computeLayout(images, viewerEl.clientWidth / viewerEl.clientHeight);
    gy = layout.totalHeight * gutterFractionY;
    homeBounds = new OpenSeadragon.Rect(0, 0, totalWidth + gx * 2, layout.totalHeight + gy * 2);
    for (var j = 0; j < tiledImages.length; j++) {
        if (!tiledImages[j]) continue;
        tiledImages[j].setPosition(new OpenSeadragon.Point(gx + layout.placements[j].x, gy + layout.placements[j].y), true);
        tiledImages[j].setWidth(layout.placements[j].width, true);
    }
    viewer.viewport.fitBounds(homeBounds, true);
}

function imageKey(i) {
    return layout.placements[i].dzi.replace(".dzi", "");
}

function zoomToImage(i) {
    location.hash = imageKey(i);
    var bounds = tiledImages[i].getBounds();
    var bx = bounds.width * 0.02;
    var by = bounds.height * 0.02;
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(
        bounds.x - bx, bounds.y - by,
        bounds.width + bx * 2, bounds.height + by * 2
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

var relayoutTimer = null;
new ResizeObserver(function() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(relayout, 150);
}).observe(viewerEl);

var hashNavPending = !!initialHash;
viewer.addHandler("update-viewport", function() {
    var vb = viewer.viewport.getBounds(true);
    if (!hashNavPending && findFeaturedIndex() === -1 && location.hash) {
        history.replaceState(null, "", location.pathname + location.search);
    }
});

// Block OSD's default keyboard panning so it doesn't fight with our navigation
viewer.addHandler("canvas-key", function(event) {
    event.preventHorizontalPan = true;
    event.preventVerticalPan = true;
});

function findVerticalNeighbor(idx, direction) {
    var p = layout.placements[idx];
    var targetRow = p.row + direction;
    var cx = p.x + p.width / 2;
    var bestIdx = -1, bestOverlap = 0;
    for (var j = 0; j < layout.placements.length; j++) {
        if (layout.placements[j].row !== targetRow) continue;
        var q = layout.placements[j];
        var overlapL = Math.max(p.x, q.x);
        var overlapR = Math.min(p.x + p.width, q.x + q.width);
        var overlap = overlapR - overlapL;
        if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestIdx = j;
        }
    }
    // If no overlap, pick the nearest by horizontal center
    if (bestIdx === -1) {
        var bestDist = Infinity;
        for (var j = 0; j < layout.placements.length; j++) {
            if (layout.placements[j].row !== targetRow) continue;
            var qcx = layout.placements[j].x + layout.placements[j].width / 2;
            var dist = Math.abs(qcx - cx);
            if (dist < bestDist) { bestDist = dist; bestIdx = j; }
        }
    }
    return bestIdx;
}

window.addEventListener("hashchange", function() {
    if (!location.hash) return;
    var key = decodeURIComponent(location.hash.slice(1));
    for (var i = 0; i < layout.placements.length; i++) {
        if (imageKey(i) === key) {
            zoomToImage(i);
            return;
        }
    }
});

// Tour mode: space to start, any interaction cancels
var tourTimer = null;

function stopTour() {
    if (tourTimer !== null) {
        clearTimeout(tourTimer);
        tourTimer = null;
    }
}

function tourStep(i) {
    if (i >= tiledImages.length) { stopTour(); return; }
    zoomToImage(i);
    tourTimer = setTimeout(function() { tourStep(i + 1); }, 10000);
}

function cancelTourOnInteraction() {
    if (tourTimer !== null) stopTour();
}

viewerEl.addEventListener("pointerdown", cancelTourOnInteraction, true);
viewerEl.addEventListener("wheel", cancelTourOnInteraction, true);

window.addEventListener("keydown", function(event) {
    // Space toggles tour
    if (event.key === " ") {
        event.preventDefault();
        if (tourTimer !== null) {
            stopTour();
            return;
        }
        var idx = findFeaturedIndex();
        tourStep(idx === -1 ? 0 : idx + 1);
        return;
    }

    // Arrow keys cancel tour and navigate
    var arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (arrows.indexOf(event.key) === -1) return;
    stopTour();
    var idx = findFeaturedIndex();
    if (idx === -1) return;
    var next = -1;
    if (event.key === "ArrowLeft") next = idx - 1;
    else if (event.key === "ArrowRight") next = idx + 1;
    else if (event.key === "ArrowUp") next = findVerticalNeighbor(idx, -1);
    else if (event.key === "ArrowDown") next = findVerticalNeighbor(idx, 1);
    if (next >= 0 && next < tiledImages.length) {
        zoomToImage(next);
    }
});
