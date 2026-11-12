// One character card per implementation: lineage and accountability badges,
// a six-spoke assurance radial scored yes = 2, partial = 1, not found = 0
// (n/a left out; the rule is printed on every card), the six checks in words,
// and three stats: code size, direct dependencies and fuzz targets. Fuzz
// target counts are pending a data fix and are shown as "pending fix".
// Everything comes from ctx.model (render-ecosystem.mjs).
import { figure, assuranceRadial, svgOnce, esc, median } from "../charts.mjs";

const GLYPH = { "yes": "\u25CF", "partial": "\u25D0", "not found": "\u25CB", "n/a": "\u2013" };
const LIN_GLYPH = { own: "\u25C6", fork: "\u25C7", core: "\u25A0" };

export default {
    slot: "chart-cards",
    build: function (ctx) {
        const rows = ctx.model.rows;
        const med = median(rows.map(function (r) { return r.assurance.pct; }));
        const top = rows.slice().sort(function (a, b) { return b.assurance.pct - a.assurance.pct; })[0];
        const pendFuzz = "fuzz_targets" in ctx.model.pending;
        const cards = rows.map(function (r) {
            const id = "card-" + r.slug;
            const a = r.assurance;
            const desc = r.name + ". Assurance " + a.score + " of " + a.max + ": " + a.cells.map(function (c) { return c.name + " " + c.status; }).join(", ") + ".";
            const NARROW_LABEL = { formal_spec: "Spec", test_vectors: "Vectors", property_tests: "Property", fuzzing: "Fuzz", formal_verification: "Proofs", differential: "Diff" };
            const cells = a.cells.map(function (c) { return Object.assign({}, c, { label: NARROW_LABEL[c.id] || c.short }); });
            const radial = svgOnce(id + "-r", 350, assuranceRadial(cells, { size: 300, labelSize: 17, center: a.score + "/" + a.max, centerSub: "assurance", cls: r.internal ? "hl" : r.lineage.cls === "core" ? "core" : "" }), r.name + " assurance radial", desc);
            const fuzz = r.metrics && r.metrics.fuzz_targets;
            return "<article class=\"eco-card" + (r.internal ? " internal" : "") + "\" id=\"" + id + "\" aria-labelledby=\"" + id + "-h\">" +
                "<h3 id=\"" + id + "-h\">" + esc(r.name) + "</h3>" +
                "<ul class=\"eco-badges\" aria-label=\"Badges\">" +
                "<li class=\"eco-badge eco-badge-" + r.lineage.cls + "\"><span aria-hidden=\"true\">" + LIN_GLYPH[r.lineage.cls] + " </span>" + esc(r.lineage.label) + "</li>" +
                "<li class=\"eco-badge\">" + esc(r.accountability.label) + "</li></ul>" +
                radial +
                "<p class=\"eco-card-rule\">Assurance " + a.score + " of " + a.max + " (" + a.pct + "%). Scored yes&nbsp;=&nbsp;2, partial&nbsp;=&nbsp;1, not&nbsp;found&nbsp;=&nbsp;0" + (a.max < 12 ? "; n/a is left out" : "") + ".</p>" +
                "<dl><dt>Code size</dt><dd>" + esc(r.size.text) + (r.size.value !== null ? " lines" : "") + "</dd>" +
                "<dt>Direct deps</dt><dd>" + esc(r.deps.text) + "</dd>" +
                "<dt>Fuzz targets</dt>" + (pendFuzz ? "<dd class=\"pend\">pending fix</dd>" : "<dd>" + esc(fuzz ? fuzz.text : "not measured") + "</dd>") + "</dl>" +
                "</article>";
        }).join("");
        return figure({
            id: "fig-cards",
            cls: "ch-wide-fig",
            headline: "One card per implementation. " + top.name + " scores " + top.assurance.score + " of " + top.assurance.max + " on assurance; the median card scores " + med + "%.",
            caption: "Each card shows where the code comes from (lineage badge), who answers for it (accountability badge), and the six assurance checks as a radial: a full wedge is yes, a half wedge partial, an empty wedge not found, a hatched wedge n/a.",
            measures: "Assurance counts which of six kinds of evidence each project shows that it follows Bitcoin's rules; it matters because a node that disagrees with the others splits from them.",
            takeaway: "Read the badges first, then the radial: more filled wedges means more kinds of evidence, not better code.",
            html: "<div class=\"eco-cards\">" + cards + "</div>",
            notes: ["Fuzz target counts are being corrected in a separate change and are shown as &ldquo;pending fix&rdquo;. Code size is tokei code lines from the Size table. Direct deps are from the Stack table."],
            sources: [{ label: "data/verification.json" }, { label: "data/implementations.json" }, { label: "data/stack.json" }, { label: "data/metrics.json" }],
            table: {
                caption: "Implementation cards",
                columns: ["Implementation", "Lineage", "Accountability", "Assurance", "Code size", "Direct deps", "Fuzz targets"],
                rows: rows.map(function (r) { return [r.name, r.lineage.label, r.accountability.full, r.assurance.score + " of " + r.assurance.max, r.size.text, r.deps.text, pendFuzz ? "pending fix" : (r.metrics && r.metrics.fuzz_targets ? r.metrics.fuzz_targets.text : "not measured")]; })
            }
        });
    }
};
