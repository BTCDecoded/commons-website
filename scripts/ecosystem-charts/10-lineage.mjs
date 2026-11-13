// Lineage map: which implementations derive from Bitcoin Core and which are
// separate codebases. Every edge quotes the sentence in
// data/implementations.json (governance.history) that states it; the render
// fails if the sentence is gone. Each implementation box carries the primary
// language from data/stack.json. Own codebases use the same boxes and have
// no derivation arrow.
import { lineage, median, releaseStage } from "../charts.mjs";

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
        const reach = ctx.readJson("data/node-share.json");
        const reachBy = {};
        reach.rows.forEach(function (r) { reachBy[r.id] = r; });
        if (typeof reachBy.core.share !== "number" || typeof reachBy.knots.share !== "number" || !reachBy.other) throw new Error("lineage: node-share is missing Core, the Knots family, or the remainder");
        const notSplit = { "knots-legacy": 1, "bit-block": 1, "bitcoin-roots": 1 };
        rows.forEach(function (r) {
            if (!modelBy[r.slug]) throw new Error("lineage: stack row has no implementation: " + r.slug);
            nodes[r.slug] = { label: r.name, cls: r.slug === internal ? "hl" : "", href: "#card-" + r.slug, tag: primaryLang(r), facts: modelBy[r.slug].picker, release: releaseStage(modelBy[r.slug].stability) };
        });
        nodes["bitcoin-core"].share = reachBy.core.share;
        nodes["bitcoin-core"].shareText = reachBy.core.text;
        nodes["bitcoin-core"].shareTip = reachBy.core.text + " of reachable nodes";
        nodes.knots.share = reachBy.knots.share;
        nodes.knots.shareText = reachBy.knots.text;
        nodes.knots.shareTip = reachBy.knots.text + " of reachable nodes advertise the Knots family. The count is not split across Knots Legacy, Bit-Block, or Bitcoin Roots";
        Object.keys(nodes).forEach(function (id) {
            if (nodes[id].shareText) return;
            nodes[id].shareTip = notSplit[id] ? "not reported separately from the Knots family" : "reachable nodes not measured";
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
            { id: "core", cls: "core", label: "Satoshi lineage", nodeW: 148, grid: [["bitcoin-core", "bitcoin-roots"], ["knots", "knots-legacy"], [null, "bit-block"]] },
            { id: "own", label: "Own codebase", nodeW: 148, grid: ownGrid }
        ];
        const derivedNames = rows.filter(function (r) { return derived[r.slug] && r.slug !== "bitcoin-core"; }).map(function (r) { return r.name; });
        const tableRows = rows.map(function (r) {
            const p = modelBy[r.slug].picker;
            const who = p.keepers ? String(p.keepers) : "not stated";
            const age = p.age || "not stated";
            if (r.slug === "bitcoin-core") return [r.name, "Satoshi lineage", "Reference implementation", r.languages, p.label, who, age];
            const e = EDGES.filter(function (x) { return x.to === r.slug; });
            if (e.length) return [r.name, "Satoshi lineage", e.map(function (x) { return x.quote + (x.dashed ? " (indirect)" : ""); }).join("; "), r.languages, p.label, who, age];
            return [r.name, "Separate codebase", "No derivation stated in the data", r.languages, p.label, who, age];
        });
        return {
            id: "fig-lineage",
            headline: (function () {
                const med = median(ctx.model.rows.map(function (r) { return r.assurance.pct; }));
                const medText = Number.isInteger(med) ? String(med) : String(med);
                const own = ctx.model.rows.filter(function (r) { return r.lineage.cls === "own"; });
                const above = own.filter(function (r) { return r.assurance.pct > med; }).length;
                return separate.length + " of " + rows.length + " implementations are separate codebases. The median assurance score is " + medText + "%. " + above + " of " + own.length + " own codebases score above the median.";
            })(),
            caption: "The corner mark is how far the release checklist has gone: no release, tagged, released, or released fully. Released fully means all seven checks. Tagged means a non-pre tag exists and the docs still say pre-release, or the version is not 1.0 or an LTS. Bitcoin Knots is not a row and has no release mark. The number beside a governance mark is a maintainer count this page already states. Knots Legacy, Bit-Block, and Bitcoin Roots have no stated start of their own. The Knots footer, " + reachBy.knots.text + ", is the whole family, and it is not split across Knots Legacy, Bit-Block, or Bitcoin Roots. The remainder, " + reachBy.other.text + ", is not a named implementation. The dashed arrow is Bitcoin Roots carrying Knots features onto Core. Bitcoin Knots is not a row on this page" + (knotsUp ? "; its arrow from Core cites the Knots README." : "."),
            measures: "Where each implementation's code comes from; it matters because clients that share code share its bugs.",
            takeaway: "",
            title: "Lineage of the " + rows.length + " implementations",
            desc: "Satoshi lineage: Bitcoin Core (" + nodes["bitcoin-core"].tag + ", " + nodes["bitcoin-core"].release.label + ", " + nodes["bitcoin-core"].shareTip + "); " + (knotsUp ? "Bitcoin Knots, a fork of Core, not a row, " + nodes.knots.shareTip + "; " : "") + "Bitcoin Roots (" + nodes["bitcoin-roots"].tag + ", " + nodes["bitcoin-roots"].release.label + "), a patch series on Core that also carries Knots features; Knots Legacy (" + nodes["knots-legacy"].tag + ", " + nodes["knots-legacy"].release.label + ") and Bit-Block (" + nodes["bit-block"].tag + ", " + nodes["bit-block"].release.label + "), both from Bitcoin Knots. Own codebase: " + ownSlugs.map(function (s) { return nodes[s].label + " (" + nodes[s].tag + ", " + nodes[s].release.label + ")"; }).join(", ") + ". A box with no reachable-node count has no share footer.",
            chart: lineage(groups, nodes, edges),
            notes: ["&ldquo;Separate&rdquo; means the data on this page states no derivation from Core or Knots. rbitcoin carries Bitcoin Core as a git submodule for tests (stack table); that is not a derivation."],
            sources: (knotsUp ? knotsUp.sources.slice(0, 1) : []).concat([{ label: "data/implementations.json (history, class, upstream)" }]).concat([ { label: "data/stack.json (languages)" }, { label: "data/node-share.json" }]).concat(reach.sources),
            table: { caption: "Lineage of each implementation", columns: ["Implementation", "Group", "Stated relationship", "Languages", "Governance", "Maintainers", "Age", "Release", "Reachable nodes"], rows: tableRows.map(function (row, i) {
                return row.concat([nodes[rows[i].slug].release.label, nodes[rows[i].slug].shareTip]);
            }).concat(knotsUp ? [[knotsUp.name + " (not a row)", "Satoshi lineage", knotsUp.quote + " (" + knotsUp.sources[0].label + ")", "not measured", "not stated", "not stated", "not stated", "not a row", nodes.knots.shareTip]] : []) }
        };
}

export default {
    slot: "chart-lineage",
    build: function () { return ""; }
};
