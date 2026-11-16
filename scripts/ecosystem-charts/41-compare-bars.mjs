// The five comparisons as bars, beside the star. Same trees, same cells,
// same checkout sum. A missing rules share is named and is not drawn as zero.
import { figure, bars, compose, esc } from "../charts.mjs";

function measured(cell) {
    return cell && cell.status === "measured" && typeof cell.value === "number" ? cell.value : null;
}
function lines(v) {
    return v.toLocaleString("en-US");
}
function fmt(n) {
    return (Math.round(n * 10) / 10).toString();
}

const PARTS = [
    { id: "program", label: "Program", cls: "a" },
    { id: "tests", label: "Tests", cls: "b" },
    { id: "tooling", label: "Tooling", cls: "c" },
    { id: "vendored", label: "Vendored", cls: "d" },
    { id: "locale", label: "Locale", cls: "muted" }
];

function checkoutRows(trees) {
    return function (width) {
        var narrow = width < 500, fs = narrow ? 14 : 13, rowH = narrow ? 46 : 28;
        var labelW = narrow ? 0 : 130, plotX = labelW, plotW = width - labelW - 8;
        var max = Math.max.apply(null, trees.map(function (t) { return t.total; })) || 1;
        var y = 4, out = "";
        trees.forEach(function (t) {
            var barY = narrow ? y + 20 : y + 7, barH = narrow ? 12 : 14, x = plotX;
            var nameCls = "ch-t ch-label" + (t.internal ? " ch-hl" : "");
            if (narrow) out += "<text x=\"0\" y=\"" + (y + 14) + "\" class=\"" + nameCls + "\">" + esc(t.name) + "</text>";
            else out += "<text x=\"" + (labelW - 10) + "\" y=\"" + (y + 18) + "\" class=\"" + nameCls + "\" text-anchor=\"end\">" + esc(t.name) + "</text>";
            out += "<rect x=\"" + plotX + "\" y=\"" + barY + "\" width=\"" + fmt(plotW) + "\" height=\"" + barH + "\" class=\"ch-track\"/>";
            PARTS.forEach(function (p) {
                var w = plotW * t[p.id] / max;
                if (w > 0) out += "<rect x=\"" + fmt(x) + "\" y=\"" + barY + "\" width=\"" + fmt(w) + "\" height=\"" + barH + "\" class=\"ch-seg ch-seg-" + p.cls + "\"><title>" + esc(t.name + " " + p.label + " " + lines(t[p.id])) + "</title></rect>";
                x += w;
            });
            y += rowH;
        });
        var lx = 0, ly = y + 8;
        PARTS.forEach(function (p) {
            var itemW = 18 + p.label.length * fs * 0.56 + 16;
            if (!narrow && lx > 0 && lx + itemW > width) { lx = 0; ly += 22; }
            out += "<rect x=\"" + fmt(lx) + "\" y=\"" + (ly + 2) + "\" width=\"12\" height=\"12\" class=\"ch-seg ch-seg-" + p.cls + "\"/>";
            out += "<text x=\"" + fmt(lx + 18) + "\" y=\"" + (ly + 13) + "\" class=\"ch-t ch-label\">" + esc(p.label) + "</text>";
            if (narrow) ly += 22; else lx += itemW;
        });
        if (!narrow) ly += 22;
        return { body: "<g font-size=\"" + fs + "\">" + out + "</g>", height: ly + 4 };
    };
}

function barRows(trees, internal, get, textOf) {
    return trees.map(function (t) {
        var v = get(t);
        return {
            label: t.name,
            cls: t.slug === internal ? "hl" : "",
            value: v,
            valueText: textOf(t, v),
            missingText: textOf(t, null)
        };
    }).sort(function (a, b) {
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
    });
}

export default {
    slot: "chart-compare-bars",
    build: function (ctx) {
        const trees = (ctx.data.trees || []).filter(function (t) {
            return measured(t.values && t.values.program_code) !== null;
        });
        function val(t, id) { return measured(t.values && t.values[id]); }
        function testLines(slug) {
            const row = (ctx.metrics.rows || []).filter(function (r) { return r.slug === slug; })[0];
            if (!row) throw new Error("compare bars: no test row for " + slug);
            var sum = 0;
            const keys = ["test_insource", "test_folder", "test_fuzz", "test_property"];
            for (var i = 0; i < keys.length; i++) {
                const cell = row[keys[i]];
                if (!cell || cell.status !== "measured" || typeof cell.value !== "number") throw new Error("compare bars: " + slug + " " + keys[i]);
                sum += cell.value;
            }
            return sum;
        }
        const rows = trees.map(function (t) {
            const program = val(t, "program_code"), tooling = val(t, "tooling_code"), vend = val(t, "vendored_code"), loc = val(t, "locale_code");
            if (program === null || tooling === null || vend === null || loc === null) throw new Error("compare bars: checkout part missing for " + t.slug);
            const tests = testLines(t.slug);
            return { name: t.name, slug: t.slug, internal: t.slug === ctx.data.internal_slug, program: program, tests: tests, tooling: tooling, vendored: vend, locale: loc, total: program + tests + tooling + vend + loc };
        }).sort(function (a, b) { return b.total - a.total; });
        const internal = ctx.data.internal_slug;
        const program = barRows(trees, internal, function (t) { return val(t, "program_code"); }, function (t) { return t.values.program_code.text; });
        const files = barRows(trees, internal, function (t) { return val(t, "share_lines_ge_1000"); }, function (t) { return t.values.share_lines_ge_1000.text; });
        const tests = barRows(trees, internal, function (t) { return val(t, "test_per_implementation"); }, function (t) { return t.values.test_per_implementation.text; });
        const rules = barRows(trees, internal, function (t) { return val(t, "rules_share"); }, function (t) { return t.values.rules_share.text; });
        const unnamed = trees.filter(function (t) { return val(t, "rules_share") === null; }).map(function (t) { return t.name + " (" + t.values.rules_share.text + ")"; });
        return figure({
            id: "fig-compare-bars",
            headline: trees.length + " measured trees. Program lines, checkout, large files, tests per line, and rules share, as bars.",
            caption: "Each bar chart uses one scale, from zero to the largest measured value on that chart. Orange is BLVM. Checkout is program, test lines, tooling, vendored, and locale, and the bars share the largest checkout. Rules share uses each tree's own cut, so that chart is not a ranking. A rules share that is not measured is named and is not drawn as zero.",
            measures: "The same five measures as the star above.",
            takeaway: "A longer bar is a larger measured number. It is not a score.",
            title: "Code comparisons as bars",
            desc: rows.map(function (t) {
                return t.name + ": program " + lines(t.program) + ", checkout " + lines(t.total) + " (program " + lines(t.program) + ", tests " + lines(t.tests) + ", tooling " + lines(t.tooling) + ", vendored " + lines(t.vendored) + ", locale " + lines(t.locale) + ")";
            }).join(". ") + ".",
            chart: compose([
                { heading: "Program lines", chart: bars(program, { max: Math.max.apply(null, program.map(function (r) { return r.value; })) }) },
                { heading: "Checkout", chart: checkoutRows(rows) },
                { heading: "Large files, share of program lines", chart: bars(files, { max: Math.max.apply(null, files.map(function (r) { return r.value; })) }) },
                { heading: "Tests per implementation line", chart: bars(tests, { max: Math.max.apply(null, tests.map(function (r) { return r.value; })) }) },
                { heading: "Rules share, own cut", chart: bars(rules, { max: Math.max.apply(null, rules.map(function (r) { return r.value || 0; })) }) }
            ]),
            notes: ["Rules share is not drawn for " + unnamed.join(", ") + ". The Core file cut, the crate-role cut, and the repository-role cut are separate instruments."],
            sources: [{ label: "the comparison table", href: "#eco-cmp" }, { label: "every weekly count", href: "#eco-size" }],
            tables: [
                { caption: "Program lines", columns: ["Implementation", "Program lines"], rows: program.filter(function (r) { return r.value !== null; }).map(function (r) { return [r.label, r.valueText]; }) },
                { caption: "Checkout", columns: ["Implementation", "Program", "Tests", "Tooling", "Vendored", "Locale", "Checkout"], rows: rows.map(function (t) { return [t.name, lines(t.program), lines(t.tests), lines(t.tooling), lines(t.vendored), lines(t.locale), lines(t.total)]; }) },
                { caption: "Large files", columns: ["Implementation", "Share of program lines in files of 1,000 or more"], rows: files.map(function (r) { return [r.label, r.valueText]; }) },
                { caption: "Tests per implementation line", columns: ["Implementation", "Tests per line"], rows: tests.map(function (r) { return [r.label, r.valueText]; }) },
                { caption: "Rules share", columns: ["Implementation", "Rules share"], rows: rules.map(function (r) { return [r.label, r.valueText]; }) }
            ]
        });
    }
};
