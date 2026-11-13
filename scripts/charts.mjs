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
// An SVG that holds links is a group, not an image, so the links stay
// reachable and are not nested inside an image role.
function linkRole(open, body) {
    return body.indexOf("<a ") >= 0 ? open.replace("role=\"img\"", "role=\"group\"") : open;
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
    if (spec.html === undefined) spec.html = null;
    function draw(chart, width, cls, id, title, desc) {
        var r = chart(width, id + "-" + cls);
        var sid = id + "-" + cls;
        return "<div class=\"ch-v ch-" + cls + "\">" + linkRole(svgOpen(sid, width, r.height, title, desc), r.body) + r.body + "</svg></div>";
    }
    var tables = spec.tables || [spec.table];
    var table = tables.map(function (tb) {
        return "<div class=\"visually-hidden\"><table><caption>" + esc(tb.caption) + "</caption><thead><tr>" +
            tb.columns.map(function (c) { return "<th scope=\"col\">" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
            tb.rows.map(function (r) {
                return "<tr>" + r.map(function (c, i) { return i === 0 ? "<th scope=\"row\">" + esc(c) + "</th>" : "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
            }).join("") + "</tbody></table></div>";
    }).join("");
    var sources = (spec.sources || []).length ? "<p class=\"ch-src\">Data: " + spec.sources.map(function (s) {
        return s.href ? "<a href=\"" + esc(s.href) + "\">" + esc(s.label) + "</a>" : esc(s.label);
    }).join(", ") + ".</p>" : "";
    var notes = (spec.notes || []).map(function (n) { return "<p class=\"ch-note\">" + n + "</p>"; }).join("");
    var reading = (spec.caption ? "<p>" + esc(spec.caption) + "</p>" : "") +
        (spec.measures ? "<p>" + esc(spec.measures) + "</p>" : "") +
        (spec.takeaway ? "<p>" + esc(spec.takeaway) + "</p>" : "") +
        notes + sources;
    var more = reading ? "<details class=\"ch-more\"><summary>How to read this</summary>" + reading + "</details>" : "";
    var wide = spec.wide || WIDE, narrow = spec.narrow || NARROW;
    var body = spec.html ? spec.html : spec.parts ? spec.parts.map(function (p) {
        var piece = (p.kicker ? "<h3 class=\"ch-sub\" id=\"" + esc(p.id) + "\">" + esc(p.kicker) + "</h3>" : "") +
            draw(p.chart, wide, "wide", p.id, p.title, p.desc) +
            draw(p.chart, narrow, "narrow", p.id, p.title, p.desc);
        return spec.split ? "<div class=\"eco-ov-part\">" + piece + "</div>" : piece;
    }).join("") : draw(spec.chart, wide, "wide", spec.id, spec.title, spec.desc) + draw(spec.chart, narrow, "narrow", spec.id, spec.title, spec.desc);
    if (spec.split) body = "<div class=\"eco-ov\">" + body + "</div>";
    var lead = spec.lead ? "<p class=\"ch-lead\">" + esc(spec.lead) + "</p>" : "";
    return "<figure class=\"ch" + (spec.cls ? " " + spec.cls : "") + "\" id=\"" + esc(spec.id) + "\"><figcaption><strong class=\"ch-head\">" + esc(spec.headline) + "</strong></figcaption>" +
        lead + body + more + table + "</figure>";
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
            var node = "<rect x=\"" + fmt(p.x) + "\" y=\"" + fmt(p.y) + "\" width=\"" + fmt(p.w) + "\" height=\"" + p.h + "\" rx=\"6\" class=\"ch-node" + (n.cls ? " ch-node-" + n.cls : "") + "\"/>" +
                t(p.x + p.w / 2, p.y + p.h / 2 + fs * 0.35, n.label, "ch-t ch-nodet" + (n.cls === "hl" ? " ch-hl" : n.cls === "muted" ? " ch-muted" : ""), " text-anchor=\"middle\"");
            out += n.href ? "<a href=\"" + esc(n.href) + "\" class=\"ch-link\"><title>" + esc(n.label) + "</title>" + node + "</a>" : node;
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
            if (narrow) { out += t(0, y + 14, row.label, "ch-t ch-label"); y += 22; if (row.sub) out += t(width, y + r + 6, row.sub, "ch-t ch-muted", " text-anchor=\"end\" font-size=\"12\""); }
            else { out += t(lx, y + r + 5, row.label, "ch-t ch-label"); if (row.sub) out += t(lx, y + r + 21, row.sub, "ch-t ch-muted", " font-size=\"12\""); }
            for (var j = 0; j < row.n; j++) {
                var on = j < row.k;
                out += "<circle cx=\"" + fmt(dotsX + r + j * step) + "\" cy=\"" + fmt(y + r + 1) + "\" r=\"" + r + "\" class=\"ch-kdot" + (on ? " ch-kdot-on" + (row.cls ? "-" + row.cls : "") : "") + "\"/>";
            }
            out += t(dotsX + maxN * step + 8, y + r + 6, row.valueText || (row.k + " of " + row.n), "ch-t ch-val");
            y += narrow ? 2 * r + 14 : Math.max(2 * r + 14, row.sub ? 40 : 0);
        });
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: y };
    };
}

// ---------- composition ----------
// parts: [{ heading, chart }] Stacks primitives in one SVG under small headings.
export function compose(parts, opts) {
    opts = opts || {};
    return function (width, uid) {
        var y = 0, out = "", gap = opts.gap || 22;
        parts.forEach(function (p, i) {
            if (i > 0) y += gap;
            if (p.heading) {
                wrap(p.heading, 12, width).forEach(function (l) { out += t(0, y + 13, l, "ch-t ch-ghead"); y += 18; });
                y += 6;
            }
            var r = p.chart(width, (uid || "ch") + "-p" + i);
            out += "<g transform=\"translate(0 " + fmt(y) + ")\">" + r.body + "</g>";
            y += r.height;
        });
        return { body: out, height: y };
    };
}

// Shared hatch pattern for "not measured" and "pending fix" areas. Pattern
// ids carry the chart's uid so two SVGs on a page never share one.
function hatchDef(id, cls) {
    return "<pattern id=\"" + id + "\" width=\"6\" height=\"6\" patternUnits=\"userSpaceOnUse\" patternTransform=\"rotate(45)\"><rect width=\"6\" height=\"6\" class=\"ch-hatch-bg" + (cls ? " " + cls : "") + "\"/><line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"6\" class=\"ch-hatch" + (cls ? " " + cls : "") + "\"/></pattern>";
}
function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function sector(cx, cy, r0, r1, a0, a1) {
    var p1 = polar(cx, cy, r1, a0), p2 = polar(cx, cy, r1, a1), large = a1 - a0 > 180 ? 1 : 0;
    if (r0 <= 0) return "M" + fmt(cx) + " " + fmt(cy) + " L" + fmt(p1[0]) + " " + fmt(p1[1]) + " A" + fmt(r1) + " " + fmt(r1) + " 0 " + large + " 1 " + fmt(p2[0]) + " " + fmt(p2[1]) + " Z";
    var q1 = polar(cx, cy, r0, a1), q2 = polar(cx, cy, r0, a0);
    return "M" + fmt(p1[0]) + " " + fmt(p1[1]) + " A" + fmt(r1) + " " + fmt(r1) + " 0 " + large + " 1 " + fmt(p2[0]) + " " + fmt(p2[1]) + " L" + fmt(q1[0]) + " " + fmt(q1[1]) + " A" + fmt(r0) + " " + fmt(r0) + " 0 " + large + " 0 " + fmt(q2[0]) + " " + fmt(q2[1]) + " Z";
}

// ---------- radar / star chart ----------
// axes:   [{ label, short, max, invert, pending, scale }]  value / max sets
//         the radius; invert puts 0 at the rim (fewer is better).
// series: [{ name, cls: "hl"|"core"|"median"|"", values: [{ v, text }] }]
//         v null = not measured. A missing or pending axis is drawn as a
//         hatched wedge and the outline breaks there; it is never drawn as 0.
// opts:   { size, labels: "full"|"short"|"none", values: bool, pad }
export function radar(axes, series, opts) {
    opts = opts || {};
    return function (width, uid) {
        var n = axes.length, step = 360 / n, lab = opts.labels || "full";
        var size = Math.min(opts.size || width, width), pad = lab === "none" ? 6 : (opts.pad || (lab === "full" ? 70 : 34));
        var narrowLab = width < 500 && lab === "full";
        if (narrowLab) pad = Math.max(pad, 58);
        var R = (size - 2 * pad) / 2, cx = width / 2, cy = pad + R + (lab === "none" ? 0 : 8);
        var hid = (uid || "ch") + "-hatch", pid = (uid || "ch") + "-pend";
        var out = "<defs>" + hatchDef(hid, "") + hatchDef(pid, "ch-pend") + "</defs>";
        [0.25, 0.5, 0.75, 1].forEach(function (f) {
            var pts = axes.map(function (a, i) { var p = polar(cx, cy, R * f, -90 + i * step); return fmt(p[0]) + "," + fmt(p[1]); }).join(" ");
            out += "<polygon points=\"" + pts + "\" class=\"ch-rgrid" + (f === 1 ? " ch-rgrid-o" : "") + "\"/>";
        });
        axes.forEach(function (a, i) {
            var p = polar(cx, cy, R, -90 + i * step);
            out += "<line x1=\"" + fmt(cx) + "\" y1=\"" + fmt(cy) + "\" x2=\"" + fmt(p[0]) + "\" y2=\"" + fmt(p[1]) + "\" class=\"ch-rgrid\"/>";
        });
        // Hatched wedges where an axis is pending for everyone, or missing for
        // the (single) series drawn.
        axes.forEach(function (a, i) {
            var one = series.length === 1 ? series[0].values[i] : null;
            var missing = a.pending || (one && (one.v === null || one.v === undefined));
            if (!missing) return;
            var ang = -90 + i * step, pend = a.pending || (one && one.pending);
            out += "<path d=\"" + sector(cx, cy, 0, R, ang - step / 2.6, ang + step / 2.6) + "\" style=\"fill:url(#" + (pend ? pid : hid) + ")\" class=\"ch-rmiss\"/>";
        });
        series.forEach(function (sr) {
            var pts = sr.values.map(function (val, i) {
                var a = axes[i];
                if (a.pending || val.v === null || val.v === undefined) return null;
                var f = Math.max(0, Math.min(1, val.v / a.max)); if (a.invert) f = 1 - f;
                return polar(cx, cy, R * f, -90 + i * step);
            });
            var fill = "";
            pts.forEach(function (p, i) {
                var q = pts[(i + 1) % n];
                if (p && q) fill += "M" + fmt(cx) + " " + fmt(cy) + " L" + fmt(p[0]) + " " + fmt(p[1]) + " L" + fmt(q[0]) + " " + fmt(q[1]) + " Z ";
            });
            if (fill && sr.cls !== "median") out += "<path d=\"" + fill + "\" class=\"ch-rfill ch-r-" + (sr.cls || "all") + "\"/>";
            var line = "";
            pts.forEach(function (p, i) {
                var q = pts[(i + 1) % n];
                if (p && q) line += "M" + fmt(p[0]) + " " + fmt(p[1]) + " L" + fmt(q[0]) + " " + fmt(q[1]) + " ";
            });
            if (line) out += "<path d=\"" + line + "\" class=\"ch-rline ch-r-" + (sr.cls || "all") + "\"/>";
            pts.forEach(function (p) {
                if (!p) return;
                if (sr.cls === "core") out += "<rect x=\"" + fmt(p[0] - 3.5) + "\" y=\"" + fmt(p[1] - 3.5) + "\" width=\"7\" height=\"7\" class=\"ch-rdot ch-r-core\"/>";
                else if (sr.cls === "median") out += "<path d=\"M" + fmt(p[0]) + " " + fmt(p[1] - 4.5) + " L" + fmt(p[0] + 4.5) + " " + fmt(p[1] + 3.5) + " L" + fmt(p[0] - 4.5) + " " + fmt(p[1] + 3.5) + " Z\" class=\"ch-rdot ch-r-median\"/>";
                else out += "<circle cx=\"" + fmt(p[0]) + "\" cy=\"" + fmt(p[1]) + "\" r=\"3.2\" class=\"ch-rdot ch-r-" + (sr.cls || "all") + "\"/>";
            });
        });
        if (lab !== "none") {
            var fsz = lab === "full" ? (width < 500 ? 12 : 12.5) : 11;
            axes.forEach(function (a, i) {
                var ang = -90 + i * step, p = polar(cx, cy, R + 10, ang);
                var c = Math.cos(ang * Math.PI / 180), anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
                var dy = Math.sin(ang * Math.PI / 180) > 0.5 ? fsz : Math.sin(ang * Math.PI / 180) < -0.5 ? -4 : 4;
                var name = lab === "full" ? a.label : a.short || a.label;
                var lines = lab === "full" ? wrap(name, fsz, narrowLab ? 70 : 110) : [name];
                var extra = [];
                if (a.pending) extra.push("pending fix");
                else if (opts.values && series[0]) extra.push(series[0].values[i].text);
                lines = lines.concat(extra);
                var y0 = p[1] + dy - (Math.sin(ang * Math.PI / 180) < -0.5 ? (lines.length - 1) * (fsz + 2) : 0);
                lines.forEach(function (l, j) {
                    var isVal = j >= lines.length - extra.length;
                    out += t(p[0], y0 + j * (fsz + 2), l, "ch-t " + (isVal ? (a.pending ? "ch-pendt" : "ch-val") : "ch-label"), " text-anchor=\"" + anchor + "\" font-size=\"" + fsz + "\"");
                });
            });
        }
        return { body: out, height: cy + R + (lab === "none" ? 6 : pad - 4) };
    };
}

// ---------- assurance radial (one card) ----------
// cells: [{ short, status, points (0..2 | null) }] One wedge per check; the
// wedge fills by points (yes = 2 full, partial = 1 half, not found = 0 empty)
// and carries a glyph at the rim (● ◐ ○); n/a is hatched with a dash. The
// score sits in the middle.
export function assuranceRadial(cells, opts) {
    opts = opts || {};
    return function (width, uid) {
        var n = cells.length, step = 360 / n, size = Math.min(width, opts.size || 220);
        var labelRoom = opts.labels === "none" ? 8 : (opts.labelSize ? opts.labelSize * 2.6 : 34);
        var R = size / 2 - labelRoom, cx = width / 2, cy = size / 2, r0 = R * 0.3;
        var hid = (uid || "ch") + "-hatch", out = "<defs>" + hatchDef(hid, "") + "</defs>";
        var glyph = { "yes": "\u25CF", "partial": "\u25D0", "not found": "\u25CB", "n/a": "\u2013" };
        cells.forEach(function (c, i) {
            var a0 = -90 + i * step - step / 2 + 2, a1 = a0 + step - 4, mid = -90 + i * step;
            out += "<path d=\"" + sector(cx, cy, r0, R, a0, a1) + "\" class=\"ch-wtrack" + (c.points === null ? " ch-wtrack-na\" style=\"fill:url(#" + hid + ")\"" : "\"") + "/>";
            if (c.points) out += "<path d=\"" + sector(cx, cy, r0, r0 + (R - r0) * c.points / 2, a0, a1) + "\" class=\"ch-wfill" + (c.points === 1 ? " ch-wfill-p" : "") + (opts.cls ? " ch-w-" + opts.cls : "") + "\"/>";
            if (opts.labels !== "none") {
                var g = polar(cx, cy, R + 14, mid), cc = Math.cos(mid * Math.PI / 180);
                var anchor = Math.abs(cc) < 0.3 ? "middle" : cc > 0 ? "start" : "end";
                var gy = g[1] + (Math.sin(mid * Math.PI / 180) > 0.5 ? 12 : Math.sin(mid * Math.PI / 180) < -0.5 ? -2 : 5);
                out += "<text x=\"" + fmt(g[0]) + "\" y=\"" + fmt(gy) + "\" text-anchor=\"" + anchor + "\" class=\"ch-t\" font-size=\"" + (opts.labelSize || 13) + "\"><tspan class=\"ch-wglyph\">" + esc(glyph[c.status] || "?") + "</tspan> <tspan class=\"ch-label\">" + esc(c.label || c.short) + "</tspan></text>";
            }
        });
        var scoreSize = size < 200 ? 13 : 18, subSize = size < 200 ? 9 : 10.5;
        out += t(cx, cy + (size < 200 ? 1 : 2), opts.center || "", "ch-t ch-wscore", " text-anchor=\"middle\" font-size=\"" + scoreSize + "\"");
        out += t(cx, cy + (size < 200 ? 13 : 17), opts.centerSub || "", "ch-t ch-muted", " text-anchor=\"middle\" font-size=\"" + subSize + "\"");
        return { body: out, height: size };
    };
}

// ---------- field map (category columns by score, linked dots) ----------
// cols: [{ id, label }]  points: [{ col, y (0-100), label, valueText, href, cls }]
// Each point is an <a href> (to its card) wrapping its dot and a label pill at
// least 44 px tall, so it is a usable tap target. Pills in a column are
// pushed apart vertically and joined to their exact dot by a leader line.
export function fieldMap(cols, points, opts) {
    opts = opts || {};
    return function (width) {
        var narrow = width < 500, axisW = narrow ? 34 : 44, pillH = narrow ? 56 : 54, gap = 4;
        var hasMedian = opts.median != null && isFinite(opts.median);
        var colW = (width - axisW) / cols.length;
        var counts = cols.map(function (c) { return points.filter(function (p) { return p.col === c.id; }).length; });
        var plotH = Math.max(narrow ? 360 : 320, Math.max.apply(null, counts) * (pillH + gap) + 8);
        var top = 34, out = "";
        [0, 25, 50, 75, 100].forEach(function (v) {
            var y = top + plotH * (1 - v / 100);
            out += "<line x1=\"" + axisW + "\" x2=\"" + width + "\" y1=\"" + fmt(y) + "\" y2=\"" + fmt(y) + "\" class=\"ch-grid\"/>";
            out += t(axisW - 6, y + 4, v + "%", "ch-t ch-muted", " text-anchor=\"end\" font-size=\"11\"");
        });
        out += t(0, 12, opts.yLabel || "", "ch-t ch-muted", " font-size=\"11\"");
        if (hasMedian) {
            var my = top + plotH * (1 - opts.median / 100);
            var medLabel = Number.isInteger(opts.median) ? String(opts.median) : String(opts.median);
            out += "<line x1=\"" + axisW + "\" x2=\"" + width + "\" y1=\"" + fmt(my) + "\" y2=\"" + fmt(my) + "\" class=\"ch-median-line\"/>";
            out += t(width, top + plotH + 16, "median " + medLabel + "%", "ch-t ch-med-label", " text-anchor=\"end\" font-size=\"11\"");
        }
        cols.forEach(function (c, ci) {
            var x0 = axisW + ci * colW, dotX = x0 + 14;
            out += t(x0 + 6, top - 10, c.label, "ch-t ch-ghead");
            out += "<line x1=\"" + fmt(dotX) + "\" x2=\"" + fmt(dotX) + "\" y1=\"" + top + "\" y2=\"" + fmt(top + plotH) + "\" class=\"ch-rgrid\"/>";
            var ps = points.filter(function (p) { return p.col === c.id; }).slice().sort(function (a, b) { return b.y - a.y || (a.label < b.label ? -1 : 1); });
            // Ideal pill centre = dot y; push down to avoid overlap, then pull
            // the stack up if it runs off the bottom.
            var ys = ps.map(function (p) { return top + plotH * (1 - p.y / 100); });
            var cy = [];
            ys.forEach(function (y, i) { cy.push(i === 0 ? Math.max(y, top + pillH / 2) : Math.max(y, cy[i - 1] + pillH + gap)); });
            var over = cy.length ? cy[cy.length - 1] + pillH / 2 - (top + plotH) : 0;
            if (over > 0) for (var i = cy.length - 1; i >= 0; i--) { var lim = i === cy.length - 1 ? cy[i] - over : Math.min(cy[i], cy[i + 1] - pillH - gap); cy[i] = lim; }
            ps.forEach(function (p, i) {
                var px = dotX + 18, pw = colW - 18 - 14 - 6;
                out += "<a href=\"" + esc(p.href) + "\" class=\"ch-link\"><title>" + esc(p.label + ": " + p.valueText) + "</title>";
                out += "<path d=\"M" + fmt(dotX) + " " + fmt(ys[i]) + " L" + fmt(px) + " " + fmt(cy[i]) + "\" class=\"ch-leader\"/>";
                out += "<rect x=\"" + fmt(px) + "\" y=\"" + fmt(cy[i] - pillH / 2) + "\" width=\"" + fmt(pw) + "\" height=\"" + pillH + "\" rx=\"6\" class=\"ch-pill" + (p.cls ? " ch-pill-" + p.cls : "") + "\"/>";
                out += t(px + 8, cy[i] - 3, p.label, "ch-t ch-pillt" + (p.cls === "hl" ? " ch-hl" : ""), " font-size=\"13\"");
                out += t(px + 8, cy[i] + 13, p.valueText, "ch-t ch-val", " font-size=\"11.5\"");
                if (p.cls === "hl") out += "<circle cx=\"" + fmt(dotX) + "\" cy=\"" + fmt(ys[i]) + "\" r=\"6\" class=\"ch-dot-hl\"/>";
                else if (p.mark === "square") out += "<rect x=\"" + fmt(dotX - 5) + "\" y=\"" + fmt(ys[i] - 5) + "\" width=\"10\" height=\"10\" class=\"ch-dot-core\"/>";
                else out += "<circle cx=\"" + fmt(dotX) + "\" cy=\"" + fmt(ys[i]) + "\" r=\"5\" class=\"ch-dot\"/>";
                out += "</a>";
            });
        });
        return { body: out, height: top + plotH + (hasMedian ? 24 : 8) };
    };
}

// ---------- flow (relationship chain) ----------
// steps: [{ label, sub, href }] Left to right on wide screens, top to bottom
// on phones, each step a link to its section.
export function flow(steps) {
    return function (width, uid) {
        var narrow = width < 500, n = steps.length, gap = narrow ? 0 : 26, arrow = (uid || "ch") + "-arrow";
        var out = "<defs><marker id=\"" + arrow + "\" viewBox=\"0 0 8 8\" refX=\"7\" refY=\"4\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M0 0 L8 4 L0 8 z\" class=\"ch-arrowhead\"/></marker></defs>";
        var w = narrow ? width : (width - (n - 1) * gap) / n, y = 0, h = 0;
        var subs = steps.map(function (s) { return wrap(s.sub, 12.5, w - 20); });
        var boxH = 46 + Math.max.apply(null, subs.map(function (l) { return l.length; })) * 16;
        steps.forEach(function (s, i) {
            var x = narrow ? 0 : i * (w + gap), by = narrow ? y : 0, bh = narrow ? 46 + subs[i].length * 16 : boxH;
            out += "<a href=\"" + esc(s.href) + "\" class=\"ch-link\">";
            out += "<rect x=\"" + fmt(x + 0.5) + "\" y=\"" + fmt(by + 0.5) + "\" width=\"" + fmt(w - 1) + "\" height=\"" + fmt(bh) + "\" rx=\"8\" class=\"ch-node" + (s.cls ? " ch-node-" + s.cls : "") + "\"/>";
            out += t(x + 12, by + 22, (i + 1) + ". " + s.label, "ch-t ch-nodet", " font-size=\"14\" font-weight=\"600\"");
            subs[i].forEach(function (l, j) { out += t(x + 12, by + 42 + j * 16, l, "ch-t ch-nsub", " font-size=\"12.5\""); });
            out += "</a>";
            if (i < n - 1) {
                if (narrow) out += "<path d=\"M" + fmt(width / 2) + " " + fmt(by + bh + 2) + " V" + fmt(by + bh + 22) + "\" class=\"ch-edge\" marker-end=\"url(#" + arrow + ")\"/>";
                else out += "<path d=\"M" + fmt(x + w + 2) + " " + fmt(boxH / 2) + " H" + fmt(x + w + gap - 2) + "\" class=\"ch-edge\" marker-end=\"url(#" + arrow + ")\"/>";
            }
            if (narrow) y += bh + 26;
            h = narrow ? y - 26 + 1 : boxH + 1;
        });
        return { body: out, height: h + 1 };
    };
}

// ---------- small multiples ----------
// items: [{ title, sub, href, chart }] A grid of one primitive, each cell
// titled (and linked when href is set). cols: { wide, narrow }.
export function smallMultiples(items, opts) {
    opts = opts || {};
    return function (width, uid) {
        var cols = width < 500 ? (opts.narrow || 2) : (opts.wide || 4), gap = 10;
        var cw = (width - (cols - 1) * gap) / cols, out = "", y = 0, rowH = 0;
        items.forEach(function (it, i) {
            var c = i % cols; if (c === 0 && i > 0) { y += rowH + gap; rowH = 0; }
            var x = c * (cw + gap);
            var r = it.chart(cw, (uid || "ch") + "-m" + i);
            var cell = t(cw / 2, 16, it.title, "ch-t ch-label" + (it.cls === "hl" ? " ch-hl" : ""), " text-anchor=\"middle\" font-size=\"13\"") +
                (it.sub ? t(cw / 2, 31, it.sub, "ch-t ch-muted", " text-anchor=\"middle\" font-size=\"11\"") : "") +
                "<g transform=\"translate(0 " + (it.sub ? 36 : 22) + ")\">" + r.body + "</g>";
            var hh = (it.sub ? 36 : 22) + r.height;
            out += "<g transform=\"translate(" + fmt(x) + " " + fmt(y) + ")\">" + (it.href ? "<a href=\"" + esc(it.href) + "\" class=\"ch-link\"><rect width=\"" + fmt(cw) + "\" height=\"" + fmt(hh) + "\" class=\"ch-cellbg\"/>" + cell + "</a>" : cell) + "</g>";
            rowH = Math.max(rowH, hh);
        });
        return { body: out, height: y + rowH };
    };
}

// ---------- single SVG (no wide/narrow pair) ----------
// For charts that scale cleanly, such as one card's radial: one SVG with
// title and desc, sized by viewBox.
export function svgOnce(id, width, chart, title, desc, cls) {
    var r = chart(width, id);
    return "<svg class=\"ch-svg" + (cls ? " " + cls : "") + "\" viewBox=\"0 0 " + width + " " + fmt(r.height) + "\" role=\"" + (r.body.indexOf("<a ") >= 0 ? "group" : "img") + "\" aria-labelledby=\"" + id + "-t " + id + "-d\" preserveAspectRatio=\"xMidYMin meet\">" +
        "<title id=\"" + id + "-t\">" + esc(title) + "</title><desc id=\"" + id + "-d\">" + esc(desc) + "</desc>" + r.body + "</svg>";
}

// ---------- radial tree ----------
// tree: { id, label, children: [...], cls, dashedFrom } rooted at a hidden
// centre. Leaves spread evenly round the circle; a parent sits at the mean
// angle of its children, one ring further in per generation. extra: dashed
// cross-links [{ from, to }].
export function radialTree(tree, extra, opts) {
    opts = opts || {};
    return function (width, uid) {
        var narrow = width < 500, fs = narrow ? 11.5 : 13;
        var depth = 0, leaves = [], pos = {};
        (function walk(n, d) { n._d = d; depth = Math.max(depth, d); if (!n.children || !n.children.length) leaves.push(n); else n.children.forEach(function (c) { walk(c, d + 1); }); })(tree, 0);
        var labelRoom = narrow ? 62 : 110, R = Math.min(width / 2 - labelRoom, opts.maxR || 230), cx = width / 2, cy = R + labelRoom * 0.55;
        leaves.forEach(function (l, i) { l._a = -90 + i * 360 / leaves.length; });
        (function place(n) { if (n.children && n.children.length) { n.children.forEach(place); n._a = n.children.reduce(function (s, c) { return s + c._a; }, 0) / n.children.length; } })(tree);
        var out = "", arrow = (uid || "ch") + "-arrow";
        [1, 2, 3].forEach(function (k) { if (k <= depth) out += "<circle cx=\"" + fmt(cx) + "\" cy=\"" + fmt(cy) + "\" r=\"" + fmt(R * k / depth) + "\" class=\"ch-rgrid\"/>"; });
        (function xy(n) { var r = n._d === 0 ? 0 : R * (n._leafOuter && !n.children ? 1 : n._d / depth); var p = polar(cx, cy, n.children && n.children.length ? R * n._d / depth : R, n._a); if (n._d === 0) p = [cx, cy]; pos[n.id] = p; (n.children || []).forEach(xy); })(tree);
        (function edges(n) { (n.children || []).forEach(function (c) { if (n._d > 0) out += "<path d=\"M" + fmt(pos[n.id][0]) + " " + fmt(pos[n.id][1]) + " L" + fmt(pos[c.id][0]) + " " + fmt(pos[c.id][1]) + "\" class=\"ch-edge\" marker-end=\"url(#" + arrow + ")\"/>"; else out += "<path d=\"M" + fmt(cx) + " " + fmt(cy) + " L" + fmt(pos[c.id][0]) + " " + fmt(pos[c.id][1]) + "\" class=\"ch-rgrid\"/>"; edges(c); }); })(tree);
        (extra || []).forEach(function (e) { out += "<path d=\"M" + fmt(pos[e.from][0]) + " " + fmt(pos[e.from][1]) + " L" + fmt(pos[e.to][0]) + " " + fmt(pos[e.to][1]) + "\" class=\"ch-edge ch-edge-dash\" marker-end=\"url(#" + arrow + ")\"/>"; });
        (function nodes(n) {
            if (n._d > 0) {
                var p = pos[n.id], leaf = !n.children || !n.children.length;
                out += n.cls === "core" ? "<rect x=\"" + fmt(p[0] - 5) + "\" y=\"" + fmt(p[1] - 5) + "\" width=\"10\" height=\"10\" class=\"ch-dot-core\"/>" : "<circle cx=\"" + fmt(p[0]) + "\" cy=\"" + fmt(p[1]) + "\" r=\"5\" class=\"" + (n.cls === "hl" ? "ch-dot-hl" : n.cls === "muted" ? "ch-wtrack" : "ch-dot") + "\"/>";
                var c = Math.cos(n._a * Math.PI / 180), q = polar(cx, cy, (leaf ? R : R * n._d / depth) + 10, n._a);
                var anchor = Math.abs(c) < 0.25 ? "middle" : c > 0 ? "start" : "end", dy = Math.sin(n._a * Math.PI / 180) > 0.6 ? fs : Math.sin(n._a * Math.PI / 180) < -0.6 ? -3 : 4;
                if (!leaf) { q = [p[0] + 9, p[1] - 8]; anchor = "start"; dy = 0; }
                out += t(q[0], q[1] + dy, n.label, "ch-t ch-label ch-halo-d" + (n.cls === "hl" ? " ch-hl" : n.cls === "muted" ? " ch-muted" : ""), " text-anchor=\"" + anchor + "\"");
            }
            (n.children || []).forEach(nodes);
        })(tree);
        var defs = "<defs><marker id=\"" + arrow + "\" viewBox=\"0 0 8 8\" refX=\"7\" refY=\"4\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M0 0 L8 4 L0 8 z\" class=\"ch-arrowhead\"/></marker></defs>";
        return { body: defs + "<g font-size=\"" + fs + "\">" + out + "</g>", height: cy + R + labelRoom * 0.45 };
    };
}

// Median of a list of numbers (mean of the middle two for an even count).
export function median(xs) {
    var s = xs.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
