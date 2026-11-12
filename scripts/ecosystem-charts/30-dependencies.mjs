// Dependency surface: direct third-party dependencies (data/stack.json) against
// vendored code lines. Vendored lines come from the code counter in
// data/implementations.json (trees[].values.vendored_code) where a tree is
// measured; otherwise from the stack table, which must say "None" to plot 0.
import { figure, scatter } from "../charts.mjs";

function thousands(n) { return n.toLocaleString("en-US"); }

export default {
    slot: "chart-deps",
    build: function (ctx) {
        const internal = ctx.data.internal_slug;
        const tree = {};
        ctx.data.trees.forEach(function (t) { tree[t.slug] = t; });
        const pts = ctx.stack.rows.map(function (r) {
            var y, ySrc;
            const vc = tree[r.slug] && tree[r.slug].values.vendored_code;
            if (vc && vc.status === "measured") { y = vc.value; ySrc = "code counter"; }
            else if (/^None/.test(r.vendored)) { y = 0; ySrc = "stack table: " + r.vendored; }
            else throw new Error("deps chart: no vendored figure for " + r.slug);
            if (typeof r.direct_deps !== "number") throw new Error("deps chart: no direct deps for " + r.slug);
            return { slug: r.slug, label: r.name, x: r.direct_deps, y: y, ySrc: ySrc, stackVendored: r.vendored, cls: r.slug === internal ? "hl" : "" };
        });
        const maxX = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.x; })) / 10) * 10;
        const maxY = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.y; })) / 30000) * 30000;
        const xt = [], yt = [];
        for (var i = 0; i <= maxX; i += 10) xt.push(i);
        for (var j = 0; j <= maxY; j += 30000) yt.push(j);
        const lowDeps = pts.filter(function (p) { return p.x <= 3; });
        const noVend = pts.filter(function (p) { return p.y === 0; });
        // Where the two tables on this page disagree, say so under the chart.
        const notes = [];
        pts.forEach(function (p) {
            if (p.ySrc === "code counter" && p.y > 0 && /^None/.test(p.stackVendored)) notes.push(p.label + ": the code counter finds " + thousands(p.y) + " vendored lines; the stack table says \u201C" + p.stackVendored + "\u201D.");
        });
        return figure({
            id: "fig-deps",
            headline: lowDeps.length + " implementations pull in 3 or fewer outside libraries and, by the code counter, carry vendored code; " + noVend.length + " vendor nothing and depend on 11 to " + Math.max.apply(null, noVend.map(function (p) { return p.x; })) + " crates or modules.",
            caption: "Each dot is one implementation: direct third-party dependencies of a default node build (across) against vendored code lines (up). Build tools, test and dev dependencies, off-by-default extras and a project\u2019s own crates are excluded; vendored source is counted separately; no transitive counts.",
            title: "Direct dependencies against vendored code",
            desc: pts.map(function (p) { return p.label + ": " + p.x + " direct dependencies, " + thousands(p.y) + " vendored lines"; }).join("; ") + ".",
            chart: scatter(pts, { x: { label: "Direct third-party dependencies", max: maxX, ticks: xt }, y: { label: "Vendored lines", max: maxY, ticks: yt, tickText: function (v) { return v ? (v / 1000) + "k" : "0"; } } }),
            notes: notes,
            sources: [{ label: "data/stack.json (direct deps, vendored)" }, { label: "data/implementations.json (vendored_code)" }],
            table: { caption: "Direct dependencies and vendored lines", columns: ["Implementation", "Direct dependencies", "Vendored lines", "Vendored source"], rows: pts.map(function (p) { return [p.label, String(p.x), thousands(p.y), p.ySrc]; }) }
        });
    }
};
