// Lineage map: which implementations derive from Bitcoin Core and which are
// separate codebases. Every edge quotes the sentence in
// data/implementations.json (governance.history) that states it; the render
// fails if the sentence is gone. Each implementation box carries the primary
// language from data/stack.json. Own codebases use the same boxes and have
// no derivation arrow.
import { lineage, median } from "../charts.mjs";

const EDGES = [
    { from: "knots", to: "knots-legacy", slug: "knots-legacy", quote: "Knots Legacy continues Bitcoin Knots v29.3.knots20260507" },
    { from: "knots", to: "bit-block", slug: "bit-block", quote: "Bit-Block is a fork of Bitcoin Knots v29.1.knots20250903" },
    { from: "bitcoin-core", to: "bitcoin-roots", slug: "bitcoin-roots", quote: "Bitcoin Roots is a patch series on Bitcoin Core v32.1" },
    { from: "knots", to: "bitcoin-roots", slug: "bitcoin-roots", quote: "carries selected policy features from the Knots 29.3.knots20260507 code line", dashed: true }
];
// Core's source layout is stated in data/implementations.json `class`.
const LAYOUT_QUOTE = "Knots Legacy, Bit-Block, and Bitcoin Roots because those checkouts use Core's src layout";

export function lineageSpec(ctx) {
        const hist = {};
        ctx.data.governance.history.forEach(function (h) { hist[h.slug] = h.text; });
        EDGES.forEach(function (e) { if ((hist[e.slug] || "").indexOf(e.quote) < 0) throw new Error("lineage: data no longer states: " + e.quote); });
        if (ctx.data.class.indexOf(LAYOUT_QUOTE) < 0) throw new Error("lineage: class note changed");
        // Upstream projects that are not rows (Bitcoin Knots) and what they
        // derive from, each with its own quote and source.
        const upstream = (ctx.data.upstream || []).filter(function (u) { return u.derives_from && u.quote && u.sources && u.sources.length; });
        const edges = upstream.map(function (u) { return { from: u.derives_from, to: u.slug }; }).concat(EDGES);
        const knotsUp = upstream.filter(function (u) { return u.slug === "knots"; })[0];
        const internal = ctx.data.internal_slug;
        const rows = ctx.stack.rows;
        const derived = { "bitcoin-core": 1, "knots-legacy": 1, "bit-block": 1, "bitcoin-roots": 1 };
        const nodes = { knots: { label: "Bitcoin Knots", cls: "muted" } };
        const modelBy = {};
        ctx.model.rows.forEach(function (r) { modelBy[r.slug] = r; });
        function primaryLang(r) {
            if (!r.languages) throw new Error("lineage: no language for " + r.slug);
            return r.languages.split(",")[0].trim();
        }
        rows.forEach(function (r) {
            if (!modelBy[r.slug]) throw new Error("lineage: stack row has no implementation: " + r.slug);
            nodes[r.slug] = { label: r.name, cls: r.slug === internal ? "hl" : "", href: "#card-" + r.slug, tag: primaryLang(r), facts: modelBy[r.slug].picker };
        });
        const separate = rows.filter(function (r) { return !derived[r.slug]; });
        const ownSlugs = separate.map(function (r) { return r.slug; }).sort(function (a, b) {
            var ay = modelBy[a].assurance.pct, by = modelBy[b].assurance.pct;
            if (by !== ay) return by - ay;
            return nodes[a].label < nodes[b].label ? -1 : 1;
        });
        const ownGrid = [];
        for (var i = 0; i < ownSlugs.length; i += 2) ownGrid.push(ownSlugs.slice(i, i + 2));
        const groups = [
            { id: "core", cls: "core", label: "Core lineage", nodeW: 148, grid: [["bitcoin-core", "bitcoin-roots"], ["knots", "knots-legacy"], [null, "bit-block"]] },
            { id: "own", label: "Own codebase", nodeW: 148, grid: ownGrid }
        ];
        const derivedNames = rows.filter(function (r) { return derived[r.slug] && r.slug !== "bitcoin-core"; }).map(function (r) { return r.name; });
        const tableRows = rows.map(function (r) {
            const p = modelBy[r.slug].picker;
            const who = p.keepers ? String(p.keepers) : "not stated";
            const age = p.age || "not stated";
            if (r.slug === "bitcoin-core") return [r.name, "Core family", "Reference implementation", r.languages, p.label, who, age];
            const e = EDGES.filter(function (x) { return x.to === r.slug; });
            if (e.length) return [r.name, "Core family", e.map(function (x) { return x.quote + (x.dashed ? " (indirect)" : ""); }).join("; "), r.languages, p.label, who, age];
            return [r.name, "Separate codebase", "No derivation stated in the data", r.languages, p.label, who, age];
        });
        return {
            id: "fig-lineage",
            headline: (function () {
                const med = median(ctx.model.rows.map(function (r) { return r.assurance.pct; }));
                const medText = Number.isInteger(med) ? String(med) : String(med);
                const own = ctx.model.rows.filter(function (r) { return r.lineage.cls === "own"; });
                const above = own.filter(function (r) { return r.assurance.pct > med; }).length;
                return separate.length + " of " + rows.length + " implementations are separate codebases. The other " + (rows.length - separate.length) + " are Bitcoin Core and clients built from it. The median assurance score is " + medText + "%. " + above + " of " + own.length + " own codebases score above the median.";
            })(),
            caption: "One graph. Each box names the implementation, tags its primary language, and shows the governance mark. A number beside the mark is a maintainer count this page already states. The age is that project's stated start, counted to " + ctx.data.measured_at + ". Knots Legacy, Bit-Block, and Bitcoin Roots have no stated start of their own, so those boxes have no age. Arrows in Core lineage are the derivation stated on this page; the dashed arrow is Bitcoin Roots carrying Knots policy features onto Core. Bitcoin Knots itself is not a row on this page" + (knotsUp ? "; its arrow from Core cites the Knots README" : "") + ". Own codebases use the same boxes and have no derivation arrow. Select a name to open its card.",
            measures: "Where each implementation's code comes from; it matters because clients that share code share its bugs.",
            takeaway: (function () {
                const fam = rows.filter(function (r) { return derived[r.slug]; }).map(function (r) { return r.name; });
                const sub = rows.filter(function (r) { return !derived[r.slug] && /Bitcoin Core is a git submodule/.test(r.vendored || ""); }).map(function (r) { return r.name; });
                const lst = function (a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1]; };
                return "The graph is a Core lineage of " + fam.length + " implementations \u2014 " + lst(fam) + " \u2014 and " + (rows.length - fam.length) + " own codebases in the same boxes. The tag on each box is the primary language. Own codebases do not show which Core line they come from, because the page states no derivation. Bitcoin Knots itself is not a row" + (sub.length ? ", and " + lst(sub) + "\u2019s Core git submodule is not a derivation." : ".");
            })(),
            title: "Lineage of the " + rows.length + " implementations",
            desc: "Core lineage: Bitcoin Core (" + nodes["bitcoin-core"].tag + "); " + (knotsUp ? "Bitcoin Knots, a fork of Core, not a row; " : "") + "Bitcoin Roots (" + nodes["bitcoin-roots"].tag + "), a patch series on Core that also carries Knots features; Knots Legacy (" + nodes["knots-legacy"].tag + ") and Bit-Block (" + nodes["bit-block"].tag + "), both from Bitcoin Knots. Own codebase: " + ownSlugs.map(function (s) { return nodes[s].label + " (" + nodes[s].tag + ")"; }).join(", ") + ".",
            chart: lineage(groups, nodes, edges),
            notes: ["&ldquo;Separate&rdquo; means the data on this page states no derivation from Core or Knots. rbitcoin carries Bitcoin Core as a git submodule for tests (stack table); that is not a derivation."],
            sources: (knotsUp ? knotsUp.sources.slice(0, 1) : []).concat([{ label: "data/implementations.json (history, class, upstream)" }]).concat([ { label: "data/stack.json (languages)" }]),
            table: { caption: "Lineage of each implementation", columns: ["Implementation", "Group", "Stated relationship", "Languages", "Governance", "Maintainers", "Age"], rows: tableRows.concat(knotsUp ? [[knotsUp.name + " (not a row)", "Core family", knotsUp.quote + " (" + knotsUp.sources[0].label + ")", "not measured", "not stated", "not stated", "not stated"]] : []) }
        };
}

export default {
    slot: "chart-lineage",
    build: function () { return ""; }
};
