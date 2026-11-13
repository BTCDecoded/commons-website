// Code, side by side: the five comparisons as one star.
// Spokes, in order: program lines, checkout, large files, tests per line,
// rules share. The rim is the largest measured value on that spoke.
// A rules share that is not measured, or a tree with no cut, is a gap.
// It is never drawn as zero. The cuts are different instruments, so the
// rules-share spoke is not a ranking across trees.
import { figure, radar, smallMultiples, compose, median } from "../charts.mjs";

function measured(cell) {
    return cell && cell.status === "measured" && typeof cell.value === "number" ? cell.value : null;
}
function lines(v) {
    return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
function pct(v) {
    return (Math.round(v * 10) / 10).toFixed(1) + "%";
}
function ratio(v) {
    return (Math.round(v * 100) / 100).toFixed(2);
}

export default {
    slot: "chart-compare",
    build: function (ctx) {
        const trees = (ctx.data.trees || []).filter(function (t) {
            return measured(t.values && t.values.program_code) !== null;
        });
        function val(t, id) { return measured(t.values && t.values[id]); }
        function testLines(slug) {
            const row = (ctx.metrics.rows || []).filter(function (r) { return r.slug === slug; })[0];
            if (!row) return null;
            var sum = 0;
            const keys = ["test_insource", "test_folder", "test_fuzz", "test_property"];
            for (var i = 0; i < keys.length; i++) {
                const cell = row[keys[i]];
                if (!cell || cell.status !== "measured" || typeof cell.value !== "number") return null;
                sum += cell.value;
            }
            return sum;
        }
        function checkout(t) {
            const parts = ["program_code", "tooling_code", "vendored_code", "locale_code"].map(function (id) { return val(t, id); });
            const tests = testLines(t.slug);
            if (tests === null || parts.some(function (v) { return v === null; })) return null;
            return parts[0] + tests + parts[1] + parts[2] + parts[3];
        }
        const AX = [
            { key: "program", label: "Program lines", short: "Program", get: function (t) { return val(t, "program_code"); }, text: function (t, v) { return t ? t.values.program_code.text : lines(v); } },
            { key: "checkout", label: "Checkout", short: "Checkout", get: checkout, text: function (t, v) { return lines(v); } },
            { key: "files", label: "Large files", short: "Large files", get: function (t) { return val(t, "share_lines_ge_1000"); }, text: function (t, v) { return t ? t.values.share_lines_ge_1000.text : pct(v); } },
            { key: "tests", label: "Tests per line", short: "Tests", get: function (t) { return val(t, "test_per_implementation"); }, text: function (t, v) { return t ? t.values.test_per_implementation.text : ratio(v); } },
            { key: "rules", label: "Rules share, own cut", short: "Rules", get: function (t) { return val(t, "rules_share"); }, text: function (t, v) { return t ? t.values.rules_share.text : pct(v); } }
        ];
        const axes = AX.map(function (a) {
            const vals = trees.map(a.get).filter(function (v) { return typeof v === "number"; });
            const max = Math.max.apply(null, vals);
            if (!(max > 0)) throw new Error("compare star: " + a.key + " has no measured maximum");
            return { key: a.key, label: a.label + " (0 to " + (a.key === "tests" ? ratio(max) : a.key === "files" || a.key === "rules" ? pct(max) : lines(max)) + ")", short: a.short, max: max, get: a.get, text: a.text };
        });
        function point(t, a) {
            const v = a.get(t);
            if (v === null) {
                const cell = a.key === "rules" ? t.values.rules_share : null;
                return { v: null, text: cell && cell.text ? cell.text : "not measured" };
            }
            return { v: v, text: a.text(t, v) };
        }
        function series(t, cls) {
            return { name: t.name, cls: cls, values: axes.map(function (a) { return point(t, a); }) };
        }
        const med = { name: "Median of the measured trees", cls: "median", values: axes.map(function (a) {
            const vs = trees.map(a.get).filter(function (v) { return typeof v === "number"; });
            if (!vs.length) return { v: null, text: "not measured" };
            const m = median(vs);
            return { v: m, text: a.text(null, m) };
        }) };
        const blvm = trees.filter(function (t) { return t.slug === ctx.data.internal_slug; })[0];
        const core = trees.filter(function (t) { return t.slug === "bitcoin-core"; })[0];
        if (!blvm || !core) throw new Error("compare star: BLVM or Bitcoin Core has no program-line row");
        const overlay = radar(axes, [med, series(core, "core"), series(blvm, "hl")], { labels: "full", size: 560 });
        const grid = smallMultiples(trees.map(function (t) {
            return { title: t.name, href: "#card-" + t.slug, cls: t.slug === blvm.slug ? "hl" : "", chart: radar(axes, [series(t, t.slug === blvm.slug ? "hl" : t.slug === "bitcoin-core" ? "core" : "")], { labels: "none" }) };
        }), { wide: 3, narrow: 2 });
        const gaps = trees.filter(function (t) { return val(t, "rules_share") === null; }).map(function (t) { return t.name + " (" + t.values.rules_share.text + ")"; });
        const further = axes.filter(function (a, i) {
            const b = series(blvm, "").values[i], m = med.values[i];
            return b.v !== null && m.v !== null && b.v > m.v;
        }).length;
        return figure({
            id: "fig-compare",
            headline: trees.length + " measured trees on five spokes. BLVM sits further from the centre than the median on " + further + " spokes that are measured for both.",
            caption: "Each spoke runs from 0 at the centre to the largest measured value at the rim. Orange circles: BLVM. Blue squares: Bitcoin Core. Yellow dashed triangles: the median of the trees measured on that spoke. Checkout is program, test lines, tooling, vendored, and locale. Rules share uses each tree's own cut, so that spoke is not a ranking. A hatched spoke is not measured, and it is not drawn as zero.",
            measures: "Program lines, checkout size, the share of program lines in files of 1,000 or more, test lines per implementation line, and rules share.",
            takeaway: "A point further out is a larger measured number on that spoke. It is not a score.",
            title: "Code comparisons as a star",
            desc: [series(blvm, ""), series(core, ""), med].map(function (s) { return s.name + ": " + axes.map(function (a, i) { return a.short + " " + s.values[i].text; }).join(", "); }).join(". ") + ".",
            chart: compose([{ heading: "BLVM, Bitcoin Core, and the median", chart: overlay }, { heading: "Each measured tree, same scales", chart: grid }]),
            notes: ["Rules share is hatched for " + gaps.join(", ") + ". The Core file cut, the crate-role cut, and the repository-role cut are separate instruments."],
            sources: [{ label: "the comparison table", href: "#eco-cmp" }, { label: "every weekly count", href: "#eco-size" }],
            table: {
                caption: "The five spokes, by implementation",
                columns: ["Implementation"].concat(axes.map(function (a) { return a.short; })),
                rows: trees.map(function (t) { return [t.name].concat(series(t, "").values.map(function (v) { return v.text; })); }).concat([[med.name].concat(med.values.map(function (v) { return v.text; }))])
            }
        });
    }
};
