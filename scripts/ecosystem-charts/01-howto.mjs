// "How to read this" legend and the glossary, at the top of the page.
// The words are Research's newcomer copy (data/glossary.json): What and Why
// verbatim, How and Caveats verbatim where they carry no figures. Where
// Research's How carries figures, the data files' own method text is shown,
// so no number on this page comes from copy. Entries for series a separate
// change is correcting are tagged "pending fix".
import { esc, govMark, releaseMark, assuranceRank, assuranceEmblem } from "../charts.mjs";

const PEND_FIELD = { fuzz_targets: "fuzz_targets", authors_12m: "authors_12m", ci_workflows: "ci_workflows", ci_jobs: "ci_jobs", rules_share: "rules_share" };
const STAR = { test_split_total: 1, vector_files: 1, spec_files: 1, releases_12m: 1, fuzz_targets: 1, authors_12m: 1, plugin_system: 1, direct_deps: 1, program_code: 1, checkout: 1, share_lines_ge_1000: 1, test_per_implementation: 1, rules_share: 1 };

function md(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); }

export default {
    slot: "chart-howto",
    build: function (ctx) {
        const G = ctx.readJson("data/glossary.json");
        const m = ctx.metrics.methods || {}, pend = ctx.model.pending;
        const treeM = {};
        const key = function (field) { var f = (field || "").replace(/`/g, ""); var k = f.split(/[\s,]/)[0].split(".").pop().replace(/^rows\[\]\./, ""); return k.replace(/^.*\]\./, ""); };
        const methodFor = function (k) {
            if (k === "test_split_total") return m.test_split || "";
            if (k === "plugin_system") return m.plugin_system || "";
            if (k === "direct_deps" || k === "vendored") return ctx.stack.method || "";
            return m[k] || treeM[k] || "";
        };
        let gl = "";
        G.groups.forEach(function (g) {
            gl += "<h4 class=\"eco-gloss-g\">" + esc(g.name) + "</h4><dl class=\"eco-gloss\">";
            g.entries.forEach(function (e) {
                const k = key(e.field);
                const isPend = k in pend;
                const how = e.how ? md(e.how) : esc(methodFor(k) || "See the linked table, where each row's sources open under it.");
                gl += "<dt>" + esc(e.name) + (STAR[k] ? " <span class=\"eco-gloss-tag\">star axis</span>" : "") + (isPend ? " <span class=\"ch-pendt-html\">(pending fix)</span>" : "") + "</dt><dd><b>What:</b> " + md(e.what) + (e.why ? " <b>Why:</b> " + md(e.why) : "") + " <b>How:</b> " + how + (e.caveats ? " <b>Caveats:</b> " + md(e.caveats) : "") + " <a href=\"" + esc(e.link) + "\">Open the table<span class=\"visually-hidden\">: " + esc(e.name) + "</span></a></dd>";
            });
            gl += "</dl>";
        });
        const st = ctx.model.stability;
        gl += "<h4 class=\"eco-gloss-g\">Release stability</h4><dl class=\"eco-gloss\"><dt>Release stability checklist</dt><dd><b>What:</b> a checklist of what a release line needs to count as stable, one segment per criterion: met, not met, or not measured. <b>Why:</b> a node that changes under you, or has no release to pin, can drift from the network. <b>How:</b> " + esc(st.rule) + " " + esc(st.note) + " <a href=\"#stability\">Open the grid<span class=\"visually-hidden\">: release stability</span></a></dd></dl>";
        // Research's how-to-read lines, verbatim except where a line states a
        // count the data gives (tree coverage), which is computed here.
        const noTree = ctx.model.rows.filter(function (r) { return r.size.value === null; }).map(function (r) { return r.name; });
        const nTrees = ctx.model.rows.length - noTree.length;
        const list = function (a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1]; };
        const lines = G.how_to_read.map(function (l) {
            if (/^Size and composition tables cover/.test(l)) return "Size and composition tables cover " + nTrees + " trees. " + list(noTree) + " appear in the other tables but have no size row.";
            // Partial scores 1 on the radials; only not-measured and n/a are gaps.
            if (/^The page is organized on three axes/.test(l)) return "Code-health figures are sizes and counts, not grades.";
            if (/^Assurance radials score/.test(l)) return l.replace(" That rule is printed on the page.", "").replace("A not-measured, partial, or n/a cell", "A not-measured or n/a cell");
            return l;
        });
        return "<ul class=\"eco-keys\" id=\"eco-key\" aria-label=\"Key\">" +
            "<li><span class=\"eco-key-g eco-gov eco-gov-single\">" + govMark("single") + "</span><span class=\"eco-key-l\">single maintainer</span></li>" +
            "<li><span class=\"eco-key-g eco-gov eco-gov-group\">" + govMark("group") + "</span><span class=\"eco-key-l\">maintainer group</span></li>" +
            "<li><span class=\"eco-key-g eco-gov eco-gov-foundation\">" + govMark("foundation") + "</span><span class=\"eco-key-l\">foundation, one signing key</span></li>" +
            "<li><span class=\"eco-key-g eco-gov eco-gov-commons\">" + govMark("commons") + "</span><span class=\"eco-key-l\">commons governance</span></li>" +
            "<li><span class=\"eco-key-g eco-gov eco-gov-unknown\">" + govMark("unknown") + "</span><span class=\"eco-key-l\">not classified</span></li>" +
            "<li><span class=\"eco-key-foot\">1</span><span class=\"eco-key-l\">stated maintainer count</span></li>" +
            "<li><span class=\"eco-key-bar\" aria-hidden=\"true\"><i></i></span><span class=\"eco-key-l\">share of reachable nodes, on a box that has a count</span></li>" +
            "<li><span class=\"eco-key-node\">BLVM</span><span class=\"eco-key-l\">this project</span></li>" +
            (function () {
                var seen = {};
                ctx.model.rows.forEach(function (r) { var rank = assuranceRank(r.assurance); seen[rank.id] = rank; });
                return ["spec", "proof", "property", "diff", "fuzz", "vectors", "none"].filter(function (id) { return seen[id]; }).map(function (id) {
                    return "<li><span class=\"eco-key-g\">" + assuranceEmblem(id, 16) + "</span><span class=\"eco-key-l\">" + esc(seen[id].label) + "</span></li>";
                }).join("");
            })() +
            "<li><span class=\"eco-key-g eco-rel eco-rel-none\">" + releaseMark("none") + "</span><span class=\"eco-key-l\">no release</span></li>" +
            "<li><span class=\"eco-key-g eco-rel eco-rel-tag\">" + releaseMark("tag") + "</span><span class=\"eco-key-l\">tagged, not a stable line</span></li>" +
            "<li><span class=\"eco-key-g eco-rel eco-rel-out\">" + releaseMark("out") + "</span><span class=\"eco-key-l\">released</span></li>" +
            "<li><span class=\"eco-key-g eco-rel eco-rel-full\">" + releaseMark("full") + "</span><span class=\"eco-key-l\">released fully</span></li>" +
            "</ul>" +
            "<details class=\"eco-howto ch-more\" id=\"howto\"><summary>How to read this page</summary>" +
            "<ul class=\"eco-howto-lines\">" + lines.map(function (l) { return "<li>" + md(l) + "</li>"; }).join("") + "</ul>" +
            "<details><summary>Glossary</summary><div class=\"eco-gloss-wrap\">" + gl + "<p class=\"eco-meta\">" + esc(G.note) + "</p></div></details></details>";
    }
};
