// Lineage map: which implementations derive from Bitcoin Core and which are
// separate codebases. Every edge quotes the sentence in
// data/implementations.json (governance.history) that states it; the render
// fails if the sentence is gone. Implementations with no derivation stated in
// the data are grouped by primary language from data/stack.json.
import { figure, lineage } from "../charts.mjs";

const EDGES = [
    { from: "knots", to: "knots-legacy", slug: "knots-legacy", quote: "Knots Legacy continues Bitcoin Knots v29.3.knots20260507" },
    { from: "knots", to: "bit-block", slug: "bit-block", quote: "Bit-Block is a fork of Bitcoin Knots v29.1.knots20250903" },
    { from: "bitcoin-core", to: "bitcoin-roots", slug: "bitcoin-roots", quote: "Bitcoin Roots is a patch series on Bitcoin Core v32.1" },
    { from: "knots", to: "bitcoin-roots", slug: "bitcoin-roots", quote: "carries selected policy features from the Knots 29.3.knots20260507 code line", dashed: true }
];
// Core's source layout is stated in data/implementations.json `class`.
const LAYOUT_QUOTE = "Knots Legacy, Bit-Block, and Bitcoin Roots because those checkouts use Core's src layout";

export default {
    slot: "chart-lineage",
    build: function (ctx) {
        const hist = {};
        ctx.data.governance.history.forEach(function (h) { hist[h.slug] = h.text; });
        EDGES.forEach(function (e) { if ((hist[e.slug] || "").indexOf(e.quote) < 0) throw new Error("lineage: data no longer states: " + e.quote); });
        if (ctx.data.class.indexOf(LAYOUT_QUOTE) < 0) throw new Error("lineage: class note changed");
        const internal = ctx.data.internal_slug;
        const rows = ctx.stack.rows;
        const derived = { "bitcoin-core": 1, "knots-legacy": 1, "bit-block": 1, "bitcoin-roots": 1 };
        const nodes = { knots: { label: "Bitcoin Knots", cls: "muted" } };
        rows.forEach(function (r) { nodes[r.slug] = { label: r.name, cls: r.slug === internal ? "hl" : "" }; });
        const separate = rows.filter(function (r) { return !derived[r.slug]; });
        const langs = [];
        const byLang = {};
        separate.forEach(function (r) {
            const lang = r.languages.split(",")[0].trim();
            if (!byLang[lang]) { byLang[lang] = []; langs.push(lang); }
            byLang[lang].push(r.slug);
        });
        langs.sort(function (a, b) { return byLang[b].length - byLang[a].length || (a < b ? -1 : 1); });
        const groups = [{ id: "core", cls: "core", label: "Core family", nodeW: 132, grid: [["bitcoin-core", "bitcoin-roots"], ["knots", "knots-legacy"], [null, "bit-block"]] }]
            .concat(langs.map(function (l) { return { id: l, label: l, flow: true, nodeW: 104, grid: byLang[l].map(function (s) { return [s]; }) }; }));
        const derivedNames = rows.filter(function (r) { return derived[r.slug] && r.slug !== "bitcoin-core"; }).map(function (r) { return r.name; });
        const tableRows = rows.map(function (r) {
            if (r.slug === "bitcoin-core") return [r.name, "Core family", "Reference implementation", r.languages];
            const e = EDGES.filter(function (x) { return x.to === r.slug; });
            if (e.length) return [r.name, "Core family", e.map(function (x) { return x.quote + (x.dashed ? " (indirect)" : ""); }).join("; "), r.languages];
            return [r.name, "Separate codebase", "No derivation stated in the data", r.languages];
        });
        return figure({
            id: "fig-lineage",
            headline: separate.length + " of " + rows.length + " implementations are separate codebases. The other " + (rows.length - separate.length) + " are Bitcoin Core and clients built from it.",
            caption: "Arrows show derivation as each project's history on this page states it; the dashed arrow is Bitcoin Roots carrying Knots policy features onto Core. Bitcoin Knots itself is not a row on this page. Separate codebases are grouped by primary language.",
            title: "Lineage of the " + rows.length + " implementations",
            desc: "Core family: Bitcoin Core; Bitcoin Roots, a patch series on Core that also carries Knots features; Knots Legacy and Bit-Block, both from Bitcoin Knots. Separate codebases: " + langs.map(function (l) { return l + ": " + byLang[l].map(function (s) { return nodes[s].label; }).join(", "); }).join("; ") + ".",
            chart: lineage(groups, nodes, EDGES),
            notes: ["&ldquo;Separate&rdquo; means the data on this page states no derivation from Core or Knots. rbitcoin carries Bitcoin Core as a git submodule for tests (stack table); that is not a derivation."],
            sources: [{ label: "data/implementations.json (history, class)" }, { label: "data/stack.json (languages)" }],
            table: { caption: "Lineage of each implementation", columns: ["Implementation", "Group", "Stated relationship", "Languages"], rows: tableRows }
        });
    }
};
