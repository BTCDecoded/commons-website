// Metrics star charts: one overlay (BLVM, Bitcoin Core, median of all 12) and
// a small-multiples grid of all 12. Axes are measured cells from
// data/metrics.json and data/stack.json. Axes a separate change is
// correcting (ctx.model.pending) are drawn as yellow-hatched "pending fix"
// wedges and never plotted. Releases from shallow checkouts are pending too.
// A value that is not measured is a grey-hatched gap, never zero.
import { figure, radar, smallMultiples, compose, median } from "../charts.mjs";

// One code-health star for the section and for each implementation card.
// Axes, scales, and the median come from the same rows, so a card star
// matches the grid.
export function codeHealth(rows, pending) {
    const pend = pending || {};
    const PLUG = { yes: 2, partial: 1, no: 0 };
    function mval(r, k) { const c = r.metrics && r.metrics[k]; return c && c.status === "measured" && typeof c.value === "number" ? c.value : null; }
    const AX = [
        { key: "test_split_total", label: "Test lines", short: "Tests", get: function (r) { return mval(r, "test_split_total"); } },
        { key: "vector_files", label: "Vector files", short: "Vectors", get: function (r) { return mval(r, "vector_files"); } },
        { key: "spec_files", label: "Spec files", short: "Specs", get: function (r) { return mval(r, "spec_files"); } },
        { key: "releases_12m", label: "Releases, 12 months", short: "Releases", get: function (r) { return mval(r, "releases_12m"); } },
        { key: "plugin", label: "Plug-in support", short: "Plug-ins", get: function (r) { const c = r.metrics && r.metrics.plugin_system; return c && c.value in PLUG ? PLUG[c.value] : null; }, max: 2, fmt: function (v) { return ["no", "partial", "yes"][v]; } },
        { key: "direct_deps", label: "Dependency surface (fewer is outward)", short: "Few deps", get: function (r) { return typeof r.stack.direct_deps === "number" ? r.stack.direct_deps : null; }, invert: true },
        { key: "fuzz_targets", label: "Fuzz targets", short: "Fuzz", get: function (r) { return mval(r, "fuzz_targets"); } },
        { key: "authors_12m", label: "Authors, 12 months", short: "Authors", get: function (r) { return mval(r, "authors_12m"); } }
    ];
    const axes = AX.map(function (a) {
        const vals = rows.map(a.get).filter(function (v) { return typeof v === "number"; });
        const max = a.max || Math.max.apply(null, vals) || 1;
        const hi = max.toLocaleString("en-US");
        const range = a.key in pend ? "" : a.invert ? " (0 at the rim, " + hi + " at the centre)" : " (0 to " + hi + ")";
        return { key: a.key, label: a.label + range, short: a.short, max: max, invert: a.invert, pending: a.key in pend, get: a.get, fmt: a.fmt };
    });
    function series(r, cls) {
        return { name: r.name, cls: cls, values: axes.map(function (a) {
            if (a.pending) return { v: null, text: "pending fix", pending: true };
            const v = a.get(r);
            if (v && v.pending) return { v: null, text: "pending fix", pending: true };
            return v === null ? { v: null, text: "not measured" } : { v: v, text: a.fmt ? a.fmt(v) : v.toLocaleString("en-US") };
        }) };
    }
    const med = { name: "Median of " + rows.length, cls: "median", values: axes.map(function (a) {
        if (a.pending) return { v: null, text: "pending fix", pending: true };
        const vs = rows.map(a.get).filter(function (v) { return typeof v === "number"; });
        const m = vs.length ? median(vs) : null;
        return m === null ? { v: null, text: "not measured" } : { v: m, text: a.fmt ? String(m) : m.toLocaleString("en-US") };
    }) };
    return { axes: axes, series: series, median: med };
}

export default {
    slot: "chart-stars",
    build: function (ctx) {
        const rows = ctx.model.rows, pend = ctx.model.pending;
        const health = codeHealth(rows, pend);
        const axes = health.axes, series = health.series, med = health.median;
        const blvm = rows.filter(function (r) { return r.internal; })[0], core = rows.filter(function (r) { return r.slug === "bitcoin-core"; })[0];
        const overlay = radar(axes, [med, series(core, "core"), series(blvm, "hl")], { labels: "full", size: 520 });
        const grid = smallMultiples(rows.map(function (r) {
            return { title: r.name, href: "#card-" + r.slug, cls: r.internal ? "hl" : "", chart: radar(axes, [series(r, r.internal ? "hl" : r.slug === "bitcoin-core" ? "core" : "")], { labels: "none" }) };
        }), { wide: 4, narrow: 2 });
        const pendNames = axes.filter(function (a) { return a.pending; }).map(function (a) { return a.label; });
        const shallowNames = rows.filter(function (r) { return r.shallow; }).map(function (r) { return r.name; });
        return figure({
            id: "fig-stars",
            headline: (function () {
                const measured = axes.filter(function (a, i) { return med.values[i].v !== null; });
                const coreAbove = axes.filter(function (a, i) { const b = series(core, "").values[i], m = med.values[i]; if (b.v === null || m.v === null) return false; return a.invert ? b.v < m.v : b.v > m.v; }).length;
                return "The median star is drawn on " + measured.length + " measured code-health axes; Bitcoin Core is above the median on " + coreAbove + " of them.";
            })(),
            caption: "Each spoke is one measure, scaled from 0 at the centre to the largest value among the 12 at the rim; dependency surface is reversed so fewer libraries sit further out. Orange circles: BLVM. Blue squares: Bitcoin Core. Yellow dashed triangles: median. The grid below shows every implementation on the same scales; select one to open its card.",
            measures: "Code health from the Depth, Modules and Stack tables; it matters because it shows the work behind a project, not whether its rules are right.",
            takeaway: "A bigger star means more measured activity on these axes, not more correct code" + (Object.keys(pend).length ? "; yellow-hatched spokes are being corrected and are not shown." : "."),
            title: "Code-health star charts",
            desc: [med, series(core, ""), series(blvm, "")].map(function (s) { return s.name + ": " + axes.map(function (a, i) { return a.label + " " + s.values[i].text; }).join(", "); }).join(". ") + ".",
            chart: compose([{ heading: "BLVM, Bitcoin Core and the median", chart: overlay }, { heading: "All " + rows.length + ", same scales", chart: grid }]),
            notes: ["Pending fix, not drawn: " + pendNames.join(", ") + (shallowNames.length ? "; releases for " + shallowNames.join(", ") + ", read from a shallow checkout" : "") + ". Grey hatching is a value that is not measured."],
            sources: [{ label: "data/metrics.json", href: "#depth" }, { label: "data/stack.json", href: "#stack" }],
            table: {
                caption: "Code-health axes by implementation",
                columns: ["Implementation"].concat(axes.map(function (a) { return a.label; })),
                rows: rows.map(function (r) { return [r.name].concat(series(r, "").values.map(function (v) { return v.text; })); }).concat([[med.name].concat(med.values.map(function (v) { return v.text; }))])
            }
        });
    }
};
