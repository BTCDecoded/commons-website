// One card per implementation. Badges, the assurance radial, and the same
// counts as the tables, in the same order on every card. A missing count says
// "not measured". n/a stays out of the assurance score. Fuzz targets that are
// listed in ctx.model.pending say "pending fix" and are not drawn as final.
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
    const lists = (st.total ? ["met", "not_met", "not_measured"].map(function (k) {
        const xs = st.cells.filter(function (c) { return c.status === k; });
        return xs.length ? "<p class=\"eco-stab-list s-" + k + "\"><b>" + STAB_GLYPH[k] + " " + ({ met: "Met", not_met: "Not met", not_measured: "Not measured" })[k] + ":</b> " + esc(xs.map(function (c) { return c.label; }).join(", ")) + "</p>" : "";
    }).join("") : "") + st.tags.filter(function (t) { return t.status !== "n/a"; }).map(function (t) { return "<p class=\"eco-stab-tag\"><b>" + esc(t.label) + ":</b> " + (t.tag ? esc(t.tag) + "" : "not measured") + "</p>"; }).join("");
    return "<div class=\"eco-stab\"><p class=\"eco-stab-h\"><b>Release</b> <span" + (st.measured ? "" : " class=\"nm\"") + ">" + esc(st.text) + "</span></p>" +
        "<div class=\"eco-stab-meter\">" + segs + "</div>" +
        (lists ? "<details class=\"ch-more\"><summary>Checks</summary>" + lists + "</details>" : "") + "</div>";
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

function treeOf(ctx, slug) {
    return (ctx.data.trees || []).filter(function (t) { return t.slug === slug; })[0] || null;
}
function counted(tree, id) {
    var cell = tree && tree.values && tree.values[id];
    if (!cell || cell.status === "not-measured" || cell.status === "not-found" || !cell.text) return "not measured";
    return cell.text;
}
function metricText(metrics, id) {
    var cell = metrics && metrics[id];
    if (!cell || !cell.text) return "not measured";
    return cell.text;
}
const HINT = {
    "Program": "Implementation lines minus tooling.",
    "Implementation": "tokei code lines, one bucket per file.",
    "Tests / line": "Test lines for each implementation line.",
    "Tooling": "Build and check code outside the program.",
    "Vendored": "Bundled libraries. Line count when this tree is in the code table.",
    "Locale": "Translation files.",
    "Large files": "Share of program lines in files of 1,000 or more.",
    "Rules share": "Share on the rules side of that tree's own cut.",
    "Own-team": "Optional modules named by that project.",
    "Independent": "Modules maintained outside the project.",
    "License": "The repository license file.",
    "Languages": "Languages with 5% or more of the code.",
    "Direct deps": "Direct third-party libraries of a default node build.",
    "Authors": "Human commit authors in the last 12 months.",
    "Releases": "Tags in the last 12 months.",
    "CI jobs": "GitHub Actions jobs at the pin.",
    "Fuzz targets": "Declared fuzz harnesses at the pin."
};
function fact(label, text, extra) {
    var title = [HINT[label] || "", extra || ""].filter(Boolean).join(" ");
    return "<dt>" + esc(label) + "</dt><dd" + (title ? " title=\"" + esc(title) + "\"" : "") + ">" + esc(text) + "</dd>";
}
function group(name) {
    return "<div class=\"eco-card-group\">" + esc(name) + "</div>";
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
            const tree = treeOf(ctx, r.slug);
            const half = counted(tree, "files_holding_half");
            const names = r.metrics && Array.isArray(r.metrics.plugin_names) ? r.metrics.plugin_names : [];
            const own = metricText(r.metrics, "plugin_own");
            const fuzzText = pendFuzz ? "pending fix" : metricText(r.metrics, "fuzz_targets");
            const vendored = tree ? counted(tree, "vendored_code") : (r.stack && r.stack.vendored ? r.stack.vendored : "not measured");
            return "<article class=\"eco-card" + (r.internal ? " internal" : "") + "\" id=\"" + id + "\" aria-labelledby=\"" + id + "-h\">" +
                "<h3 id=\"" + id + "-h\">" + esc(r.name) + "</h3>" +
                "<ul class=\"eco-badges\" aria-label=\"Badges\">" +
                "<li class=\"eco-badge eco-badge-" + r.lineage.cls + "\"><span aria-hidden=\"true\">" + LIN_GLYPH[r.lineage.cls] + " </span>" + esc(r.lineage.label) + "</li>" +
                "<li class=\"eco-badge\">" + esc(r.accountability.full) + "</li>" +
                "<li class=\"eco-badge\">Modules: " + esc(metricText(r.metrics, "plugin_system")) + "</li></ul>" +
                radial +
                "<dl>" +
                group("Code") +
                fact("Program", counted(tree, "program_code")) +
                fact("Implementation", counted(tree, "implementation_code")) +
                fact("Tests / line", counted(tree, "test_per_implementation")) +
                fact("Tooling", counted(tree, "tooling_code")) +
                fact("Vendored", vendored) +
                fact("Locale", counted(tree, "locale_code")) +
                fact("Large files", counted(tree, "share_lines_ge_1000"), half === "not measured" ? "" : half + " files hold half") +
                fact("Rules share", counted(tree, "rules_share"), tree && tree.instrument ? tree.instrument : "") +
                group("Modules") +
                fact("Own-team", own, names.length ? names.join(", ") : "") +
                fact("Independent", metricText(r.metrics, "plugin_independent")) +
                group("Stack") +
                fact("License", r.stack && r.stack.license ? r.stack.license : "not measured") +
                fact("Languages", r.stack && r.stack.languages ? r.stack.languages : "not measured") +
                fact("Direct deps", r.deps.text) +
                group("Last 12 months") +
                fact("Authors", metricText(r.metrics, "authors_12m")) +
                fact("Releases", metricText(r.metrics, "releases_12m")) +
                fact("CI jobs", metricText(r.metrics, "ci_jobs")) +
                fact("Fuzz targets", fuzzText) +
                "</dl>" +
                stabMeter(r.stability) +
                "</article>";
        }).join("");
        return figure({
            id: "fig-cards",
            cls: "ch-wide-fig",
            headline: "The median implementation scores " + med + "% on assurance. One card per implementation.",
            caption: "Each card uses the same rows. Badges are lineage, accountability, and the module-system reading. The radial is the six assurance checks: a full wedge is yes, a half wedge partial, an empty wedge not found, a hatched wedge n/a. The lines under it are the code, module, stack, and 12-month counts from the tables.",
            measures: "Assurance counts which of six kinds of evidence each project shows that it follows Bitcoin's rules; it matters because a node that disagrees with the others splits from them.",
            takeaway: cardsTakeaway(rows),
            html: "<div class=\"eco-cards\">" + cards + "</div>",
            notes: ["A line says not measured when that tree is not in the file that holds the count. Vendored lines come from the code table when the tree is measured there, and from the stack note otherwise. Own-team names, when the card has them, are on the row. Release stability asks whether a project has a release line an operator can run and expect to stay fixed. " + esc(ctx.model.stability.rule) + " " + esc(ctx.model.stability.note) + ctx.model.stability.extra.map(function (x) { return " " + esc(x.name) + ": " + esc(x.note); }).join(""), (pendFuzz ? "Fuzz target counts are being corrected in a separate change and are shown as &ldquo;pending fix&rdquo;." : "Fuzz targets are declared harnesses at the pinned commit.")],
            sources: [{ label: "data/verification.json" }, { label: "data/implementations.json" }, { label: "data/stack.json" }, { label: "data/metrics.json" }, { label: "data/stability.json" }],
            table: {
                caption: "Implementation cards",
                columns: ["Implementation", "Lineage", "Accountability", "Module system", "Assurance", "Program", "Tests / line", "Own-team modules", "License", "Authors, 12 months", "Release stability"],
                rows: rows.map(function (r) {
                    var tree = treeOf(ctx, r.slug);
                    return [r.name, r.lineage.label, r.accountability.full, metricText(r.metrics, "plugin_system"), r.assurance.score + " of " + r.assurance.max, counted(tree, "program_code"), counted(tree, "test_per_implementation"), metricText(r.metrics, "plugin_own"), r.stack && r.stack.license ? r.stack.license : "not measured", metricText(r.metrics, "authors_12m"), r.stability.text];
                })
            }
        });
    }
};
