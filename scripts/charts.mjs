// Small, dependency-free SVG chart primitives for static pages.
//
// Every primitive takes plain data rows and returns an SVG string for a given
// width. `figure()` wraps a primitive into an accessible <figure>: a headline
// and caption, a wide SVG (shown above 640 px) and a narrow SVG (390 px phones),
// each with <title> and <desc>, a source line, and a visually hidden data table
// that carries every number the chart draws. Output is deterministic: no
// randomness, no clock, no measured text, so a render is byte-identical.
//
// Adding a chart: write a definition in scripts/ecosystem-charts/ that maps
// data rows to one primitive and returns figure({...}). New stats plug in by
// adding rows or a new definition file; the primitives do not change.

export const WIDE = 760;
export const NARROW = 336;

export function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
}
// Approximate text width (no font metrics at build time). Overpass averages
// about 0.56 em per character; digits and capitals are close to that.
export function textWidth(s, size) { return String(s).length * size * 0.56; }
function fmt(n) { return Math.round(n * 100) / 100; }
function wrap(text, size, max) {
    var words = String(text).split(" "), lines = [], line = "";
    words.forEach(function (w) {
        var next = line ? line + " " + w : w;
        if (textWidth(next, size) > max && line) { lines.push(line); line = w; } else line = next;
    });
    if (line) lines.push(line);
    return lines;
}
function t(x, y, s, cls, extra) {
    return "<text x=\"" + fmt(x) + "\" y=\"" + fmt(y) + "\" class=\"" + (cls || "ch-t") + "\"" + (extra || "") + ">" + esc(s) + "</text>";
}
function svgOpen(id, w, h, title, desc) {
    return "<svg class=\"ch-svg\" viewBox=\"0 0 " + w + " " + fmt(h) + "\" width=\"" + w + "\" height=\"" + fmt(h) + "\" role=\"img\" aria-labelledby=\"" + id + "-t " + id + "-d\" preserveAspectRatio=\"xMinYMin meet\">" +
        "<title id=\"" + id + "-t\">" + esc(title) + "</title><desc id=\"" + id + "-d\">" + esc(desc) + "</desc>";
}

// ---------- figure wrapper ----------
// spec: { id, headline, caption, notes: [html], sources: [{label, href}],
//         title, desc, chart: function (width) -> {body, height},
//         table: { caption, columns: [label], rows: [[cell, ...]] } }
export function figure(spec) {
    function variant(width, cls) {
        var r = spec.chart(width, spec.id + "-" + cls);
        var id = spec.id + "-" + cls;
        return "<div class=\"ch-v ch-" + cls + "\">" + svgOpen(id, width, r.height, spec.title, spec.desc) + r.body + "</svg></div>";
    }
    var table = "<div class=\"visually-hidden\"><table><caption>" + esc(spec.table.caption) + "</caption><thead><tr>" +
        spec.table.columns.map(function (c) { return "<th scope=\"col\">" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        spec.table.rows.map(function (r) {
            return "<tr>" + r.map(function (c, i) { return i === 0 ? "<th scope=\"row\">" + esc(c) + "</th>" : "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    var sources = (spec.sources || []).length ? "<p class=\"ch-src\">Data: " + spec.sources.map(function (s) {
        return s.href ? "<a href=\"" + esc(s.href) + "\">" + esc(s.label) + "</a>" : esc(s.label);
    }).join(", ") + ".</p>" : "";
    var notes = (spec.notes || []).map(function (n) { return "<p class=\"ch-note\">" + n + "</p>"; }).join("");
    return "<figure class=\"ch\" id=\"" + esc(spec.id) + "\"><figcaption><strong class=\"ch-head\">" + esc(spec.headline) + "</strong> <span class=\"ch-cap\">" + esc(spec.caption) + "</span></figcaption>" +
        variant(WIDE, "wide") + variant(NARROW, "narrow") + notes + sources + table + "</figure>";
}

// ---------- horizontal bars ----------
// rows: [{ label, value (number|null), valueText, cls, note, missingText }]
// opts: { max, labelWidth }
export function bars(rows, opts) {
    opts = opts || {};
    return function (width) {
        var narrow = width < 500, fs = narrow ? 14 : 13, rowH = narrow ? 46 : 28;
        var labelW = narrow ? 0 : (opts.labelWidth || 130);
        var valueW = narrow ? 0 : 150;
        var plotX = labelW, plotW = width - labelW - valueW - 8;
        var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value || 0; })) || 1;
        var y = 4, out = "";
        rows.forEach(function (r) {
            var barY = narrow ? y + 20 : y + 7, barH = narrow ? 12 : 14;
            if (narrow) out += t(0, y + 14, r.label, "ch-t ch-label" + (r.cls === "hl" ? " ch-hl" : ""));
            else out += t(labelW - 10, y + 18, r.label, "ch-t ch-label" + (r.cls === "hl" ? " ch-hl" : ""), " text-anchor=\"end\"");
            if (r.value === null || r.value === undefined) {
                var miss = r.missingText || "not measured";
                if (narrow) out += t(width, y + 14, miss, "ch-t ch-muted", " text-anchor=\"end\"");
                else out += t(plotX, y + 18, miss, "ch-t ch-muted");
            } else {
                var w = Math.max(1.5, plotW * r.value / max);
                out += "<rect x=\"" + plotX + "\" y=\"" + barY + "\" width=\"" + fmt(plotW) + "\" height=\"" + barH + "\" class=\"ch-track\"/>";
                out += "<rect x=\"" + plotX + "\" y=\"" + barY + "\" width=\"" + fmt(w) + "\" height=\"" + barH + "\" class=\"ch-bar " + (r.cls === "hl" ? "ch-fill-hl" : "ch-fill") + "\"/>";
                if (narrow) out += t(width, y + 14, r.valueText, "ch-t ch-val", " text-anchor=\"end\"");
                else out += t(plotX + plotW + 8, y + 18, r.valueText, "ch-t ch-val");
            }
            y += rowH;
        });
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: y + 2 };
    };
}

// ---------- one stacked bar (shares of a whole) and progress ----------
// segments: [{ label, value, valueText, cls }] cls: hl | a | b | c | muted
export function stacked(segments, opts) {
    opts = opts || {};
    return function (width) {
        var narrow = width < 500, fs = narrow ? 14 : 13;
        var total = opts.total || segments.reduce(function (s, x) { return s + x.value; }, 0);
        var barH = 26, x = 0, out = "", y = 0;
        segments.forEach(function (s) {
            var w = width * s.value / total;
            out += "<rect x=\"" + fmt(x) + "\" y=\"" + y + "\" width=\"" + fmt(Math.max(w, s.value > 0 ? 2 : 0)) + "\" height=\"" + barH + "\" class=\"ch-seg ch-seg-" + (s.cls || "a") + "\"/>";
            x += w;
        });
        // Legend rows under the bar: swatch, label, value. One per line on
        // narrow screens, flowing on wide ones.
        y = barH + 14;
        var lx = 0, lineH = 24;
        segments.forEach(function (s) {
            var text = s.label + " " + s.valueText;
            var itemW = 18 + textWidth(text, fs) + 18;
            if (!narrow && lx > 0 && lx + itemW > width) { lx = 0; y += lineH; }
            out += "<rect x=\"" + fmt(lx) + "\" y=\"" + (y + 2) + "\" width=\"12\" height=\"12\" class=\"ch-seg ch-seg-" + (s.cls || "a") + "\"/>";
            out += "<text x=\"" + fmt(lx + 18) + "\" y=\"" + (y + 13) + "\" class=\"ch-t\"><tspan class=\"ch-label\">" + esc(s.label) + "</tspan> <tspan class=\"ch-val\">" + esc(s.valueText) + "</tspan></text>";
            if (narrow) y += lineH; else lx += itemW;
        });
        if (!narrow) y += lineH;
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: y + 2 };
    };
}
export function progress(segments, opts) { return stacked(segments, opts); }

// ---------- heatmap / status matrix ----------
// columns: [{ id, label, short }]
// rows: [{ label, cls, cells: { colId: status } }]
// statuses: { status: { cls, mark, text } } (mark is a glyph so color is not
// the only cue)
export function heatmap(rows, columns, statuses) {
    return function (width) {
        var narrow = width < 500, fs = narrow ? 13 : 13;
        var labelW = narrow ? 104 : 140, headH = narrow ? 44 : 40;
        var cellW = (width - labelW) / columns.length, cellH = narrow ? 30 : 30, out = "";
        columns.forEach(function (c, i) {
            var cx = labelW + cellW * i + cellW / 2;
            var lines = narrow ? wrap(c.short || c.label, fs, cellW - 4) : wrap(c.label, fs, cellW - 6);
            lines.slice(0, 2).forEach(function (ln, k) {
                out += t(cx, headH - 8 - (lines.slice(0, 2).length - 1 - k) * (fs + 2), ln, "ch-t ch-colh", " text-anchor=\"middle\"");
            });
        });
        rows.forEach(function (r, ri) {
            var y = headH + ri * cellH;
            out += t(labelW - 8, y + cellH / 2 + fs * 0.35, r.label, "ch-t ch-label" + (r.cls === "hl" ? " ch-hl" : ""), " text-anchor=\"end\"");
            columns.forEach(function (c, ci) {
                var st = statuses[r.cells[c.id]] || statuses["not found"];
                var x = labelW + ci * cellW;
                out += "<rect x=\"" + fmt(x + 1.5) + "\" y=\"" + (y + 1.5) + "\" width=\"" + fmt(cellW - 3) + "\" height=\"" + (cellH - 3) + "\" rx=\"3\" class=\"ch-cell " + st.cls + "\"/>";
                var label = narrow ? st.mark : st.mark + " " + st.text;
                out += t(x + cellW / 2, y + cellH / 2 + fs * 0.35, label, "ch-t ch-cellt " + st.cls + "-t", " text-anchor=\"middle\"");
            });
        });
        var y = headH + rows.length * cellH + 16, lx = 0;
        Object.keys(statuses).forEach(function (k) {
            var st = statuses[k], item = st.mark + " " + st.text;
            var iw = 24 + textWidth(item, fs) + 14;
            if (lx > 0 && lx + iw > width) { lx = 0; y += 26; }
            out += "<rect x=\"" + fmt(lx) + "\" y=\"" + (y - 13) + "\" width=\"20\" height=\"18\" rx=\"3\" class=\"ch-cell " + st.cls + "\"/>";
            out += t(lx + 10, y + 1, st.mark, "ch-t ch-cellt " + st.cls + "-t", " text-anchor=\"middle\"");
            out += t(lx + 26, y + 1, st.text, "ch-t ch-label");
            lx += iw;
        });
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: y + 10 };
    };
}

// ---------- dot plot / scatter with simple label placement ----------
// points: [{ label, x, y, cls }]; axes: { x: {label, max, ticks}, y: {...} }
export function scatter(points, axes) {
    return function (width) {
        var narrow = width < 500, fs = narrow ? 14 : 13;
        var padL = narrow ? 52 : 70, padB = 44, padT = 10, padR = narrow ? 10 : 20;
        var plotW = width - padL - padR, plotH = narrow ? 300 : 300;
        var X = function (v) { return padL + plotW * v / axes.x.max; };
        var Y = function (v) { return padT + plotH - plotH * v / axes.y.max; };
        var out = "";
        axes.x.ticks.forEach(function (v) {
            out += "<line x1=\"" + fmt(X(v)) + "\" x2=\"" + fmt(X(v)) + "\" y1=\"" + padT + "\" y2=\"" + (padT + plotH) + "\" class=\"ch-grid\"/>";
            out += t(X(v), padT + plotH + 18, String(v), "ch-t ch-muted", " text-anchor=\"middle\"");
        });
        axes.y.ticks.forEach(function (v) {
            out += "<line x1=\"" + padL + "\" x2=\"" + (padL + plotW) + "\" y1=\"" + fmt(Y(v)) + "\" y2=\"" + fmt(Y(v)) + "\" class=\"ch-grid\"/>";
            out += t(padL - 6, Y(v) + 4, axes.y.tickText ? axes.y.tickText(v) : String(v), "ch-t ch-muted", " text-anchor=\"end\"");
        });
        out += t(padL + plotW / 2, padT + plotH + 38, axes.x.label, "ch-t ch-label", " text-anchor=\"middle\"");
        out += t(12, padT + plotH / 2, axes.y.label, "ch-t ch-label", " text-anchor=\"middle\" transform=\"rotate(-90 12 " + fmt(padT + plotH / 2) + ")\"");
        // Label placement: try right, left, above, below, then further out with
        // a leader line. Boxes already taken (dots and labels) are avoided.
        var taken = points.map(function (p) { return { x: X(p.x) - 6, y: Y(p.y) - 6, w: 12, h: 12 }; });
        function hits(b) {
            if (b.x < padL - 2 || b.x + b.w > width || b.y < 0 || b.y + b.h > padT + plotH + 2) return true;
            return taken.some(function (o) { return b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y; });
        }
        var labels = "";
        points.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; }).forEach(function (p) {
            var i, px = X(p.x), py = Y(p.y), w = textWidth(p.label, fs) + 4, h = fs + 4, placed = null, far = false;
            for (var ring = 0; ring < 6 && !placed; ring++) {
                far = ring > 0;
                var d = 8 + ring * 14;
                var cands = [[px + d, py - h / 2], [px - d - w, py - h / 2], [px - w / 2, py - d - h], [px - w / 2, py + d],
                    [px + d, py - d - h], [px + d, py + d], [px - d - w, py - d - h], [px - d - w, py + d]];
                for (i = 0; i < cands.length; i++) {
                    var b = { x: cands[i][0], y: cands[i][1], w: w, h: h };
                    if (!hits(b)) { placed = b; break; }
                }
            }
            if (!placed) placed = { x: px + 8, y: py - h / 2, w: w, h: h };
            taken.push(placed);
            var cx = placed.x + placed.w / 2, cy = placed.y + placed.h / 2;
            if (far || i > 3) {
                var ex = Math.max(placed.x, Math.min(px, placed.x + placed.w)), ey = Math.max(placed.y, Math.min(py, placed.y + placed.h));
                labels += "<line x1=\"" + fmt(px) + "\" y1=\"" + fmt(py) + "\" x2=\"" + fmt(ex) + "\" y2=\"" + fmt(ey) + "\" class=\"ch-leader\"/>";
            }
            labels += t(placed.x + 2, placed.y + h - 4, p.label, "ch-t ch-label" + (p.cls === "hl" ? " ch-hl" : ""));
        });
        points.forEach(function (p) {
            out += "<circle cx=\"" + fmt(X(p.x)) + "\" cy=\"" + fmt(Y(p.y)) + "\" r=\"5.5\" class=\"" + (p.cls === "hl" ? "ch-dot-hl" : "ch-dot") + "\"/>";
        });
        return { body: "<g font-size=\"" + fs + "\">" + out + labels + "</g>", height: padT + plotH + padB + 4 };
    };
}

// ---------- lineage: groups of nodes with derivation edges ----------
// groups: [{ id, label, cols, grid: [[nodeId|null, ...], ...] }]
//   grid rows are laid out as given on wide screens; on narrow screens a group
//   whose `flow` is true reflows its nodes into two columns.
// nodes: { id: { label, cls } }  cls: hl | muted
// edges: [{ from, to, dashed }]
export function lineage(groups, nodes, edges) {
    return function (width, uid) {
        var arrow = (uid || "ch") + "-arrow";
        var narrow = width < 500, fs = narrow ? 13 : 13;
        var nodeH = 30, gapX = narrow ? 26 : 34, gapY = 12, pad = 10, headH = 24, groupGap = narrow ? 14 : 16;
        var pos = {}, out = "", gx = 0, gy = 0, rowH = 0;
        groups.forEach(function (g) {
            var grid = g.grid;
            if (narrow && g.flow) {
                var flat = [].concat.apply([], grid).filter(Boolean), rows = [];
                for (var i = 0; i < flat.length; i += 2) rows.push(flat.slice(i, i + 2));
                grid = rows;
            }
            var cols = Math.max.apply(null, grid.map(function (r) { return r.length; }));
            var nodeW;
            if (narrow) nodeW = (width - 2 * pad - (cols - 1) * gapX) / cols;
            else nodeW = g.nodeW || 140;
            var gw = 2 * pad + cols * nodeW + (cols - 1) * gapX;
            var gh = headH + pad + grid.length * nodeH + (grid.length - 1) * gapY + pad;
            if (narrow) { gx = 0; } else if (gx > 0 && gx + gw > width) { gx = 0; gy += rowH + groupGap; rowH = 0; }
            out += "<rect x=\"" + fmt(gx + 0.5) + "\" y=\"" + fmt(gy + 0.5) + "\" width=\"" + fmt(gw - 1) + "\" height=\"" + fmt(gh - 1) + "\" rx=\"8\" class=\"ch-group" + (g.cls ? " ch-group-" + g.cls : "") + "\"/>";
            out += t(gx + pad, gy + 17, g.label, "ch-t ch-ghead");
            grid.forEach(function (row, ri) {
                row.forEach(function (id, ci) {
                    if (!id) return;
                    pos[id] = { x: gx + pad + ci * (nodeW + gapX), y: gy + headH + pad + ri * (nodeH + gapY), w: nodeW, h: nodeH };
                });
            });
            if (narrow) { gy += gh + groupGap; } else { gx += gw + groupGap; rowH = Math.max(rowH, gh); }
        });
        var height = narrow ? gy - groupGap : gy + rowH;
        // Edges leave a node in "trunks": one per (source, dashed) pair, each
        // with its own start height and vertical lane, so a dashed edge never
        // shares a segment with a solid one. Incoming edges spread over the
        // target's left side.
        var trunks = [], trunkOf = {}, incoming = {};
        edges.forEach(function (e) {
            var k = e.from + "|" + (e.dashed ? 1 : 0);
            if (!(k in trunkOf)) { trunkOf[k] = trunks.length; trunks.push({ from: e.from, dashed: !!e.dashed }); }
            (incoming[e.to] = incoming[e.to] || []).push(e);
        });
        var trunksBySrc = {};
        trunks.forEach(function (tr) { (trunksBySrc[tr.from] = trunksBySrc[tr.from] || []).push(tr); });
        var laneKeys = {};
        trunks.forEach(function (tr) { var a = pos[tr.from]; var lk = Math.round(a.x + a.w); (laneKeys[lk] = laneKeys[lk] || []).push(tr); });
        edges.forEach(function (e) {
            var a = pos[e.from], b = pos[e.to];
            if (!a || !b) throw new Error("lineage edge without node: " + e.from + " -> " + e.to);
            var tr = trunks[trunkOf[e.from + "|" + (e.dashed ? 1 : 0)]];
            var mine = trunksBySrc[e.from], si = mine.indexOf(tr);
            var y1 = a.y + a.h * (si + 1) / (mine.length + 1);
            var inc = incoming[e.to], ii = inc.indexOf(e);
            var y2 = b.y + b.h * (ii + 1) / (inc.length + 1);
            var d;
            if (b.x > a.x + a.w - 1) {
                var lanes = laneKeys[Math.round(a.x + a.w)], li = lanes.indexOf(tr);
                var x1 = a.x + a.w, x2 = b.x - 2, mx = x1 + (x2 - x1) * (li + 1) / (lanes.length + 1);
                d = "M" + fmt(x1) + " " + fmt(y1) + " H" + fmt(mx) + " V" + fmt(y2) + " H" + fmt(x2);
            } else {
                var vx1 = a.x + a.w / 2, vy1 = a.y + a.h, vx2 = b.x + b.w / 2, vy2 = b.y - 2, my = (vy1 + vy2) / 2;
                d = "M" + fmt(vx1) + " " + fmt(vy1) + " V" + fmt(my) + " H" + fmt(vx2) + " V" + fmt(vy2);
            }
            out += "<path d=\"" + d + "\" class=\"ch-edge" + (e.dashed ? " ch-edge-dash" : "") + "\" marker-end=\"url(#" + arrow + ")\"/>";
        });
        Object.keys(pos).forEach(function (id) {
            var p = pos[id], n = nodes[id];
            out += "<rect x=\"" + fmt(p.x) + "\" y=\"" + fmt(p.y) + "\" width=\"" + fmt(p.w) + "\" height=\"" + p.h + "\" rx=\"6\" class=\"ch-node" + (n.cls ? " ch-node-" + n.cls : "") + "\"/>";
            out += t(p.x + p.w / 2, p.y + p.h / 2 + fs * 0.35, n.label, "ch-t ch-nodet" + (n.cls === "hl" ? " ch-hl" : n.cls === "muted" ? " ch-muted" : ""), " text-anchor=\"middle\"");
        });
        var defs = "<defs><marker id=\"" + arrow + "\" viewBox=\"0 0 8 8\" refX=\"7\" refY=\"4\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M0 0 L8 4 L0 8 z\" class=\"ch-arrowhead\"/></marker></defs>";
        return { body: defs + "<g font-size=\"" + fs + "\">" + out + "</g>", height: height + 2 };
    };
}

// ---------- layered diagram (dependency tree, module map) ----------
// bands: [{ label, sub, rows: [[id, ...], ...] }] top to bottom. Each band is a
//   shaded strip; on wide screens its label sits in a left column, on narrow
//   screens above its nodes. Rows inside a band are laid out centred.
// nodes: { id: { label, short, sub, cls: "hl"|"muted"|"" } }; `short` replaces
//   `label` on narrow screens, `sub` is a smaller second line (wrapped).
// edges: [{ from, to, dashed }] from a higher row to a lower one. Edges run
//   down from the source, along a track in the gap below it, down a free lane
//   past any rows in between, and into the target's top edge.
// opts: { labelWidth (wide), maxNodeW, narrowPerRow }
export function layered(bands, nodes, edges, opts) {
    opts = opts || {};
    return function (width, uid) {
        var arrow = (uid || "ch") + "-arrow";
        var narrow = width < 500, fs = narrow ? 12 : 13, ss = narrow ? 11 : 11.5;
        var labelW = narrow ? 0 : (opts.labelWidth || 150), pad = 8, gapX = narrow ? 8 : 12;
        var areaX = labelW ? labelW + pad : pad, areaW = width - areaX - pad;
        var maxNodeW = opts.maxNodeW || 170;
        // 1. Rows (narrow screens may split a band row further).
        var rows = [];
        bands.forEach(function (b, bi) {
            b.rows.forEach(function (r, ri) {
                var per = narrow && opts.narrowPerRow ? opts.narrowPerRow : r.length;
                for (var i = 0; i < r.length; i += per) rows.push({ band: bi, first: ri === 0 && i === 0, ids: r.slice(i, i + per) });
            });
        });
        // 2. x positions and node heights.
        var pos = {};
        rows.forEach(function (row) {
            var n = row.ids.length;
            var w = Math.min(maxNodeW, (areaW - (n - 1) * gapX) / n);
            var total = n * w + (n - 1) * gapX, x0 = areaX + (areaW - total) / 2;
            var h = 0;
            row.ids.forEach(function (id, i) {
                var nd = nodes[id]; if (!nd) throw new Error("layered: no node " + id);
                var subLines = nd.sub ? wrap(nd.sub, ss, w - 12) : [];
                var nh = 30 + subLines.length * (ss + 3);
                pos[id] = { x: x0 + i * (w + gapX), w: w, sub: subLines, row: rows.indexOf(row) };
                h = Math.max(h, nh);
            });
            row.h = h;
        });
        // 3. Ports and lanes.
        var out = {}, inc = {};
        edges.forEach(function (e) {
            if (!pos[e.from] || !pos[e.to]) throw new Error("layered: edge without node " + e.from + " -> " + e.to);
            if (pos[e.to].row <= pos[e.from].row) throw new Error("layered: edge must point down " + e.from + " -> " + e.to);
            (out[e.from] = out[e.from] || []).push(e); (inc[e.to] = inc[e.to] || []).push(e);
        });
        function cx(id) { return pos[id].x + pos[id].w / 2; }
        Object.keys(out).forEach(function (id) {
            out[id].sort(function (a, b) { return cx(a.to) - cx(b.to); });
            out[id].forEach(function (e, k) { e._sx = pos[id].x + pos[id].w * (k + 1) / (out[id].length + 1); });
        });
        Object.keys(inc).forEach(function (id) {
            inc[id].sort(function (a, b) { return cx(a.from) - cx(b.from); });
            inc[id].forEach(function (e, k) { e._tx = pos[id].x + pos[id].w * (k + 1) / (inc[id].length + 1); });
        });
        var laneUse = {};
        edges.forEach(function (e) {
            var r1 = pos[e.from].row, r2 = pos[e.to].row;
            e._lane = null;
            if (r2 === r1 + 1) return;
            var blocked = [];
            for (var r = r1 + 1; r < r2; r++) rows[r].ids.forEach(function (id) { blocked.push([pos[id].x - 6, pos[id].x + pos[id].w + 6]); });
            function free(x) { return blocked.every(function (b) { return x < b[0] || x > b[1]; }); }
            var want = e._tx;
            if (free(want)) { e._lane = want; return; }
            var cands = [areaX - 2, width - pad + 2];
            blocked.forEach(function (b) { cands.push(b[0] - 1, b[1] + 1); });
            blocked.forEach(function (b) { blocked.forEach(function (c) { if (c[0] > b[1]) cands.push((b[1] + c[0]) / 2); }); });
            cands = cands.filter(free).sort(function (a, b) { return Math.abs(a - want) - Math.abs(b - want) || a - b; });
            var lane = cands.length ? cands[0] : want;
            var key = Math.round(lane), k = laneUse[key] = (laneUse[key] || 0) + 1;
            e._lane = lane + (k - 1) * 5 * (lane < want ? -1 : 1);
        });
        // 4. Tracks in each gap, then y positions.
        var gapEdges = rows.map(function () { return []; });
        edges.forEach(function (e) {
            var r1 = pos[e.from].row, r2 = pos[e.to].row;
            e._g1 = r1; e._g2 = r2 - 1;
            gapEdges[r1].push(e); if (r2 - 1 !== r1) gapEdges[r2 - 1].push({ ref: e });
        });
        var y = 0, out2 = "", bandRects = [];
        rows.forEach(function (row, ri) {
            var band = bands[row.band];
            if (row.first) {
                if (ri > 0) y += 6;
                var top = y;
                var subL = band.sub ? wrap(band.sub, ss, narrow ? width - 2 * pad - 4 : labelW - 12) : [];
                if (narrow) y += 20 + subL.length * (ss + 3) + 4; else y += 10;
                bandRects.push({ band: row.band, top: top, subL: subL });
            }
            row.y = y;
            row.ids.forEach(function (id) { pos[id].y = y; pos[id].h = row.h; });
            y += row.h;
            var last = ri === rows.length - 1 || rows[ri + 1].band !== row.band;
            var tracks = gapEdges[ri].length;
            row.gapTop = y;
            y += Math.max(last ? 18 : 22, 12 + tracks * 6) + (last ? 8 : 0);
            if (last && !narrow) {
                // A band is at least as tall as its label column.
                var br0 = bandRects[bandRects.length - 1], need = br0.top + 17 + 3 + br0.subL.length * (ss + 3) + 14;
                if (y < need) { row.gapTop += need - y; y = need; }
                if (ri === rows.length - 1) row.gapTop = Math.max(row.gapTop, need - 18);
            }
        });
        var height = rows[rows.length - 1].gapTop + 10;
        bandRects[bandRects.length - 1].bottom = height;
        gapEdges.forEach(function (list, ri) {
            list.forEach(function (item, k) {
                var e = item.ref || item, ty = rows[ri].gapTop + 9 + k * 6;
                if (item.ref) e._ty2 = ty; else e._ty1 = ty;
            });
        });
        // 5. Draw: band strips, edges, nodes.
        // Band labels are drawn after the edges with a halo in the band colour,
        // so an edge that passes behind a label never strikes through it.
        var strips = "", heads = "";
        bandRects.forEach(function (br, i) {
            var b = bands[br.band], bottom = i < bandRects.length - 1 ? bandRects[i + 1].top - 4 : br.bottom;
            strips += "<rect x=\"0.5\" y=\"" + fmt(br.top + 0.5) + "\" width=\"" + (width - 1) + "\" height=\"" + fmt(bottom - br.top - 1) + "\" rx=\"8\" class=\"ch-group" + (b.cls ? " ch-group-" + b.cls : "") + "\"/>";
            var lx = narrow ? pad + 2 : pad + 2, ly = br.top + 17;
            heads += t(lx, ly, b.label, "ch-t ch-ghead ch-halo");
            br.subL.forEach(function (l, j) { heads += t(lx, ly + 3 + (j + 1) * (ss + 3), l, "ch-t ch-bsub ch-halo", " font-size=\"" + ss + "\""); });
        });
        var paths = "";
        edges.forEach(function (e) {
            var a = pos[e.from], b = pos[e.to];
            var sy = a.y + a.h, ey = b.y - 2, d;
            if (e._lane === null) d = "M" + fmt(e._sx) + " " + fmt(sy) + " V" + fmt(e._ty1) + " H" + fmt(e._tx) + " V" + fmt(ey);
            else d = "M" + fmt(e._sx) + " " + fmt(sy) + " V" + fmt(e._ty1) + " H" + fmt(e._lane) + " V" + fmt(e._ty2) + " H" + fmt(e._tx) + " V" + fmt(ey);
            paths += "<path d=\"" + d + "\" class=\"ch-edge" + (e.dashed ? " ch-edge-dash" : "") + "\" marker-end=\"url(#" + arrow + ")\"/>";
        });
        var boxes = "";
        Object.keys(pos).forEach(function (id) {
            var p = pos[id], n = nodes[id], label = narrow && n.short ? n.short : n.label;
            boxes += "<rect x=\"" + fmt(p.x) + "\" y=\"" + fmt(p.y) + "\" width=\"" + fmt(p.w) + "\" height=\"" + fmt(p.h) + "\" rx=\"6\" class=\"ch-node" + (n.cls ? " ch-node-" + n.cls : "") + "\"/>";
            boxes += t(p.x + p.w / 2, p.y + 19, label, "ch-t ch-nodet" + (n.cls === "hl" ? " ch-hl" : n.cls === "muted" ? " ch-muted" : ""), " text-anchor=\"middle\"");
            p.sub.forEach(function (l, j) { boxes += t(p.x + p.w / 2, p.y + 19 + (j + 1) * (ss + 3) + 1, l, "ch-t ch-nsub", " text-anchor=\"middle\" font-size=\"" + ss + "\""); });
        });
        var defs = "<defs><marker id=\"" + arrow + "\" viewBox=\"0 0 8 8\" refX=\"7\" refY=\"4\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M0 0 L8 4 L0 8 z\" class=\"ch-arrowhead\"/></marker></defs>";
        return { body: defs + "<g font-size=\"" + fs + "\">" + strips + paths + heads + boxes + "</g>", height: height + 1 };
    };
}

// ---------- k-of-n rows (signature thresholds) ----------
// rows: [{ label, sub, k, n, valueText, cls }] Each row draws n dots with k
// filled, so thresholds of different sizes read side by side.
export function kOfN(rows, opts) {
    opts = opts || {};
    return function (width) {
        var narrow = width < 500, fs = narrow ? 13 : 13, r = narrow ? 7 : 8, step = r * 2 + (narrow ? 5 : 6);
        var maxN = Math.max.apply(null, rows.map(function (x) { return x.n; }));
        var labelW = narrow ? 0 : (opts.labelWidth || 220);
        var out = "", y = 0;
        rows.forEach(function (row, i) {
            if (row.gap) y += 10;
            var lx = 0, dotsX = narrow ? 0 : labelW;
            if (narrow) { out += t(0, y + 14, row.label, "ch-t ch-label"); if (row.sub) out += t(width, y + 14, row.sub, "ch-t ch-muted", " text-anchor=\"end\" font-size=\"12\""); y += 22; }
            else { out += t(lx, y + r + 5, row.label, "ch-t ch-label"); if (row.sub) out += t(lx, y + r + 21, row.sub, "ch-t ch-muted", " font-size=\"12\""); }
            for (var j = 0; j < row.n; j++) {
                var on = j < row.k;
                out += "<circle cx=\"" + fmt(dotsX + r + j * step) + "\" cy=\"" + fmt(y + r + 1) + "\" r=\"" + r + "\" class=\"ch-kdot" + (on ? " ch-kdot-on" + (row.cls ? "-" + row.cls : "") : "") + "\"/>";
            }
            out += t(dotsX + maxN * step + 8, y + r + 6, row.valueText || (row.k + " of " + row.n), "ch-t ch-val");
            y += narrow ? 2 * r + 14 : Math.max(2 * r + 14, row.sub ? 34 : 0);
        });
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: y };
    };
}
