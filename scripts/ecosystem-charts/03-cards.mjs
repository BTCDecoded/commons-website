// One character card per implementation: lineage and accountability badges,
// a six-spoke assurance radial scored yes = 2, partial = 1, not found = 0
// (n/a left out; the rule is printed on every card), the six checks in words,
// and three stats: code size, direct dependencies and fuzz targets. Fuzz
// target counts are pending a data fix and are shown as "pending fix".
// Everything comes from ctx.model (render-ecosystem.mjs).
import { figure, assuranceRadial, svgOnce, esc, median } from "../charts.mjs";

const GLYPH = { "yes": "\u25CF", "partial": "\u25D0", "not found": "\u25CB", "n/a": "\u2013" };
const LIN_GLYPH = { own: "\u25C6", fork: "\u25C7", core: "\u25A0" };

// Stability checklist meter: one segment per criterion in data/stability.json
// (met solid with a tick, not met empty with a cross, not measured hatched
// with a question mark). With no criteria written yet, one hatched bar says
// so in words. Never drawn as zero.
const STAB_GLYPH = { met: "\u2713", not_met: "\u2715", not_measured: "?" };
function stabMeter(st) {
    const segs = st.total ? st.cells.map(function (c) {
        return "<span class=\"eco-stab-seg s-" + c.status + "\" title=\"" + esc(c.label + ": " + c.status.replace("_", " ")) + "\">" + STAB_GLYPH[c.status] + "</span>";
    }).join("") : "<span class=\"eco-stab-seg s-not_measured s-all\">not measured</span>";
    return "<div class=\"eco-stab\"><p class=\"eco-stab-h\"><b>Release stability</b> <span" + (st.measured ? "" : " class=\"nm\"") + ">" + esc(st.text) + "</span></p>" +
        "<div class=\"eco-stab-meter\" aria-hidden=\"true\">" + segs + "</div>" +
        st.tags.map(function (t) { return "<p class=\"eco-stab-tag\"><b>" + esc(t.label) + ":</b> " + (t.tag ? esc(t.tag) + (t.evidence_url ? " <a href=\"" + esc(t.evidence_url) + "\">Source</a>" : "") : "not measured") + "</p>"; }).join("") + "</div>";
}

// Research's card takeaway, with every clause computed from the cells.
function names(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function cardsTakeaway(rows) {
    const st = function (r, id) { return r.assurance.cells.filter(function (c) { return c.id === id; })[0].status; };
    const allYes = rows.filter(function (r) { return r.assurance.cells.every(function (c) { return c.status === "yes"; }); });
    const specYes = rows.filter(function (r) { return st(r, "formal_spec") === "yes"; }).map(function (r) { return r.name; });
    const fvP = rows.filter(function (r) { return st(r, "formal_verification") === "partial"; }).map(function (r) { return r.name; });
    const fvY = rows.filter(function (r) { return st(r, "formal_verification") === "yes"; }).map(function (r) { return r.name; });
    const core = rows.filter(function (r) { return r.lineage.cls === "core"; })[0];
    return (allYes.length ? names(allYes.map(function (r) { return r.name; })) + " has all six verification layers marked yes" : "No implementation has all six verification layers marked yes") +
        "; a written formal spec marked yes appears " + (specYes.length === 1 ? "only for " + specYes[0] : "for " + (specYes.length ? names(specYes) : "none")) +
        ", formal verification is " + (fvY.length ? "yes for " + names(fvY) + ", " : "") + (fvP.length ? "partial for " + names(fvP) + " and " : "") + "not found elsewhere" +
        (core && st(core, "differential") === "n/a" ? ", and " + core.name + "\u2019s differential cell is n/a because Core is the reference." : ".");
}

export default {
    slot: "chart-cards",
    build: function (ctx) {
        const rows = ctx.model.rows;
        const med = median(rows.map(function (r) { return r.assurance.pct; }));
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
                stabMeter(r.stability) +
                "<dl><dt>Code size</dt><dd>" + esc(r.size.text) + (r.size.value !== null ? " lines" : "") + "</dd>" +
                "<dt>Direct deps</dt><dd>" + esc(r.deps.text) + "</dd>" +
                "<dt>Fuzz targets</dt>" + (pendFuzz ? "<dd class=\"pend\">pending fix</dd>" : "<dd>" + esc(fuzz ? fuzz.text : "not measured") + "</dd>") + "</dl>" +
                "</article>";
        }).join("");
        return figure({
            id: "fig-cards",
            cls: "ch-wide-fig",
            headline: "The median implementation scores " + med + "% on assurance. One card per implementation, each with its own score.",
            caption: "Each card shows where the code comes from (lineage badge), who answers for it (accountability badge), and the six assurance checks as a radial: a full wedge is yes, a half wedge partial, an empty wedge not found, a hatched wedge n/a.",
            measures: "Assurance counts which of six kinds of evidence each project shows that it follows Bitcoin's rules; it matters because a node that disagrees with the others splits from them.",
            takeaway: cardsTakeaway(rows),
            html: "<div class=\"eco-cards\">" + cards + "</div>",
            notes: ["Release stability asks whether a project has a release line an operator can run and expect to stay fixed; it matters because a node that changes under you can drift from the network. " + esc(ctx.model.stability.rule) + " " + esc(ctx.model.stability.note) + ctx.model.stability.extra.map(function (x) { return " " + esc(x.name) + ": " + esc(x.note); }).join(""), (pendFuzz ? "Fuzz target counts are being corrected in a separate change and are shown as &ldquo;pending fix&rdquo;. " : "Fuzz targets are declared harnesses at the pinned commit, from the Depth table. ") + "Code size is tokei code lines from the Size table. Direct deps are from the Stack table."],
            sources: [{ label: "data/verification.json" }, { label: "data/implementations.json" }, { label: "data/stack.json" }, { label: "data/metrics.json" }, { label: "data/stability.json" }],
            table: {
                caption: "Implementation cards",
                columns: ["Implementation", "Lineage", "Accountability", "Assurance", "Code size", "Direct deps", "Fuzz targets", "Release stability"],
                rows: rows.map(function (r) { return [r.name, r.lineage.label, r.accountability.full, r.assurance.score + " of " + r.assurance.max, r.size.text, r.deps.text, pendFuzz ? "pending fix" : (r.metrics && r.metrics.fuzz_targets ? r.metrics.fuzz_targets.text : "not measured"), r.stability.text]; })
            }
        });
    }
};
