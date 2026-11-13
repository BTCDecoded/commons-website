// Lineage map: which implementations derive from Bitcoin Core and which are
// separate codebases. Every edge quotes the sentence in
// data/implementations.json (governance.history) that states it; the render
// fails if the sentence is gone. Implementations with no derivation stated in
// the data are grouped by primary language from data/stack.json.
import { figure, fieldMap, median } from "../charts.mjs";

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
        // Upstream projects that are not rows (Bitcoin Knots) and what they
        // derive from, each with its own quote and source.
        const upstream = (ctx.data.upstream || []).filter(function (u) { return u.derives_from && u.quote && u.sources && u.sources.length; });
        const edges = upstream.map(function (u) { return { from: u.derives_from, to: u.slug }; }).concat(EDGES);
        const knotsUp = upstream.filter(function (u) { return u.slug === "knots"; })[0];
        const internal = ctx.data.internal_slug;
        const rows = ctx.stack.rows;
        const derived = { "bitcoin-core": 1, "knots-legacy": 1, "bit-block": 1, "bitcoin-roots": 1 };
        const separate = rows.filter(function (r) { return !derived[r.slug]; });
        const langs = [];
        const byLang = {};
        separate.forEach(function (r) {
            const lang = r.languages.split(",")[0].trim();
            if (!byLang[lang]) { byLang[lang] = []; langs.push(lang); }
            byLang[lang].push(r.slug);
        });
        langs.sort(function (a, b) { return byLang[b].length - byLang[a].length || (a < b ? -1 : 1); });
        const model = {};
        ctx.model.rows.forEach(function (r) { model[r.slug] = r; });
        const med = median(ctx.model.rows.map(function (r) { return r.assurance.pct; }));
        const medText = Number.isInteger(med) ? String(med) : String(med);
        const cols = [{ id: "core", label: "Core family" }].concat(langs.map(function (l) { return { id: l, label: l }; }));
        const pts = rows.filter(function (r) { return r.slug !== internal && model[r.slug]; }).map(function (r) {
            const m = model[r.slug];
            const lang = r.languages.split(",")[0].trim();
            return {
                id: r.slug,
                card: "card-" + r.slug,
                col: derived[r.slug] ? "core" : lang,
                y: m.assurance.pct,
                label: r.name,
                valueText: m.assurance.score + " of " + m.assurance.max + " (" + m.assurance.pct + "%)",
                href: "#card-" + r.slug,
                cls: r.slug === "bitcoin-core" ? "core" : "",
                mark: r.slug === "bitcoin-core" ? "square" : ""
            };
        });
        const ownRows = ctx.model.rows.filter(function (r) { return r.lineage.cls === "own"; });
        const above = ownRows.filter(function (r) { return r.assurance.pct > med; }).length;
        const linYs = pts.filter(function (p) { return p.col === "core"; }).map(function (p) { return p.y; });
        const tableRows = rows.map(function (r) {
            if (r.slug === "bitcoin-core") return [r.name, "Core family", "Reference implementation", r.languages];
            const e = EDGES.filter(function (x) { return x.to === r.slug; });
            if (e.length) return [r.name, "Core family", e.map(function (x) { return x.quote + (x.dashed ? " (indirect)" : ""); }).join("; "), r.languages];
            return [r.name, "Separate codebase", "No derivation stated in the data", r.languages];
        });
        return figure({
            id: "fig-lineage",
            headline: separate.length + " of " + rows.length + " implementations are separate codebases. The median assurance score is " + medText + "%. The Core family sits between " + Math.min.apply(null, linYs) + "% and " + Math.max.apply(null, linYs) + "%; " + above + " of " + ownRows.length + " own codebases score above the median.",
            caption: "Columns are the lineage: the Core family, then separate codebases by primary language. Height is assurance, as a share of possible points, and the yellow line is the median of all " + rows.length + ". Select a name to open its card. BLVM is not on this chart; its score is on its card. Bitcoin Knots itself is not a row" + (knotsUp ? "; the Core-family history cites the Knots README" : "") + ".",
            measures: "Where the code comes from, against how much evidence it shows that it follows Bitcoin's rules. Clients that share code share its bugs, and a separate codebase only adds safety if it can show it follows the same rules.",
            takeaway: (function () {
                const fam = rows.filter(function (r) { return derived[r.slug]; }).map(function (r) { return r.name; });
                const sub = rows.filter(function (r) { return !derived[r.slug] && /Bitcoin Core is a git submodule/.test(r.vendored || ""); }).map(function (r) { return r.name; });
                const lst = function (a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1]; };
                return "The lineage map is a Core family of " + fam.length + " implementations \u2014 " + lst(fam) + " \u2014 plus " + (rows.length - fam.length) + " separate codebases grouped by primary language; Bitcoin Knots itself is not a row" + (sub.length ? ", and " + lst(sub) + "\u2019s Core git submodule is not a derivation." : ".");
            })(),
            title: "Lineage and median assurance",
            desc: pts.map(function (p) { return p.label + ", " + (p.col === "core" ? "Core family" : p.col) + ", assurance " + p.valueText; }).join("; ") + ". Median of all " + rows.length + ": " + medText + "%.",
            chart: fieldMap(cols, pts, { yLabel: "Assurance", median: med, uid: "lineage", edges: edges.filter(function (e) { return e.from !== "knots" && e.to !== "knots"; }) }),
            notes: ["&ldquo;Separate&rdquo; means the data on this page states no derivation from Core or Knots. rbitcoin carries Bitcoin Core as a git submodule for tests (stack table); that is not a derivation."],
            sources: (knotsUp ? knotsUp.sources.slice(0, 1) : []).concat([{ label: "data/implementations.json (history, class, upstream)" }]).concat([ { label: "data/stack.json (languages)" }]),
            table: { caption: "Lineage of each implementation", columns: ["Implementation", "Group", "Stated relationship", "Languages"], rows: tableRows.concat(knotsUp ? [[knotsUp.name + " (not a row)", "Core family", knotsUp.quote + " (" + knotsUp.sources[0].label + ")", "not measured"]] : []) }
        });
    }
};
