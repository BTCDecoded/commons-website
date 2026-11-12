// "How to read this" legend and the glossary, at the top of the page. Every
// glossary entry says what the measure is, why it matters, how it is
// measured (method text from the data files), and links to its table.
import { esc } from "../charts.mjs";

// Why each measure matters, in one plain sentence. Method text comes from the
// data files; only this "why" is written here.
const WHY = {
    independence: "If most nodes run the same code, one bug can reach most of the network at once.",
    accountability: "It tells you who can change the rules a project follows, and whether anyone else must agree.",
    formal_spec: "A written spec lets anyone check the code against the rules instead of against other code.",
    test_vectors: "Shared vectors are the same test cases every implementation must pass, so they catch disagreement early.",
    property_tests: "They try many generated inputs against a stated rule, not just hand-picked cases.",
    fuzzing: "Random inputs find crashes and odd cases that people do not think to test.",
    formal_verification: "A machine-checked proof shows code meets a rule for every input, not just the tested ones.",
    differential: "Comparing verdicts with Core directly catches places where an implementation would split from the network.",
    test_split_total: "More test code usually means more of the program is exercised.",
    vector_files: "Files of shared test cases the project carries.",
    spec_files: "Specification documents in the tree.",
    releases_12m: "How often a project ships; a project with no releases asks users to build from source.",
    plugin: "A plug-in system lets others add features without changing the node itself.",
    direct_deps: "Every outside library is code someone else controls inside the node.",
    fuzz_targets: "How many separate fuzz entry points the tree has.",
    authors_12m: "How many people wrote code recently; one author is a single point of failure."
};

export default {
    slot: "chart-howto",
    build: function (ctx) {
        const m = ctx.metrics.methods || {}, pend = ctx.model.pending;
        const entry = function (name, what, why, how, href, linkText, pending) {
            return "<dt>" + esc(name) + (pending ? " <span class=\"ch-pendt-html\">(pending fix)</span>" : "") + "</dt><dd><b>What:</b> " + esc(what) + " <b>Why:</b> " + esc(why) + " <b>How:</b> " + esc(how) + " <a href=\"" + href + "\">" + esc(linkText) + "</a></dd>";
        };
        let gl = "";
        gl += entry("Independence", "Whether a project is Bitcoin Core, a fork of Core or Knots, or its own codebase.", WHY.independence, "Read from each project's stated history; a project is its own codebase when no derivation is stated.", "#why", "Lineage map");
        gl += entry("Accountability", "Who answers for changes: single maintainer, maintainer group, foundation key, or written rules.", WHY.accountability, ctx.data.governance_model.note, "#institution", "Institution table");
        ctx.verification.columns.forEach(function (c) {
            gl += entry("Assurance: " + c.name, c.what, WHY[c.id] || "", "Read from each project's tree and docs at a pinned commit. Scored yes = 2, partial = 1, not found = 0; n/a is left out.", "#eco-glance", "Verification table");
        });
        [["test_split_total", "Test lines", "test_split"], ["vector_files", "Vector files", "vector_files"], ["spec_files", "Spec files", "spec_files"], ["releases_12m", "Releases, 12 months", "releases_12m"], ["fuzz_targets", "Fuzz targets", "fuzz_targets"], ["authors_12m", "Authors, 12 months", "authors_12m"]].forEach(function (x) {
            gl += entry("Star axis: " + x[1], x[1] + " per implementation.", WHY[x[0]], m[x[2]] || "", "#depth", "Depth table", x[0] in pend);
        });
        gl += entry("Star axis: Plug-in support", "Whether the node has a module or plug-in system.", WHY.plugin, (m.plugin_system || "") + " Scored yes = 2, partial = 1, no = 0.", "#modules", "Modules table");
        gl += entry("Star axis: Dependency surface", "Direct third-party libraries of a default build; fewer is drawn further out.", WHY.direct_deps, ctx.stack.method, "#stack", "Stack table");
        return "<div class=\"eco-howto\" id=\"howto\"><h3>How to read this page</h3>" +
            "<p>The page asks three questions about each of " + ctx.model.rows.length + " node implementations. <b>Independence:</b> is it its own code or a fork of Bitcoin Core? <b>Assurance:</b> how much evidence does it show that it follows Bitcoin&rsquo;s rules? <b>Accountability:</b> who can change it?</p>" +
            "<ul class=\"eco-keys\">" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u25CF</span> yes, 2 points</li>" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u25D0</span> partial, 1 point</li>" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u25CB</span> not found, 0 points</li>" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u2013</span> n/a, left out of the score</li>" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u2571</span> grey hatching: not measured</li>" +
            "<li><span class=\"eco-key-g eco-key-med\" aria-hidden=\"true\">\u2571</span> yellow hatching: pending fix, not final</li>" +
            "<li><span class=\"eco-key-g eco-key-hl\" aria-hidden=\"true\">\u25CF</span> orange: BLVM</li>" +
            "<li><span class=\"eco-key-g eco-key-core\" aria-hidden=\"true\">\u25A0</span> blue square: Bitcoin Core</li>" +
            "<li><span class=\"eco-key-g eco-key-med\" aria-hidden=\"true\">\u25B2</span> yellow dashed: median of all 12</li>" +
            "<li><span class=\"eco-key-g\" aria-hidden=\"true\">\u25C6 \u25C7</span> own codebase, Core lineage</li>" +
            "</ul>" +
            "<details><summary>Glossary: what each measure is, why it matters, how it is measured</summary><dl class=\"eco-gloss\">" + gl + "</dl></details></div>";
    }
};
