// Radial lineage: the same derivations as the box lineage map, drawn as a
// radial tree. A mockup to compare against the box map.
import { figure, radialTree } from "../charts.mjs";

export default {
    slot: "chart-lineage-radial",
    build: function (ctx) {
        const rows = ctx.model.rows, by = {};
        rows.forEach(function (r) { by[r.slug] = r; });
        const leaf = function (r) { return { id: r.slug, label: r.name, cls: r.internal ? "hl" : "" }; };
        const tree = { id: "root", label: "", children: [
            { id: "bitcoin-core", label: "Bitcoin Core", cls: "core", children: [
                { id: "knots", label: "Bitcoin Knots", cls: "muted", children: [leaf(by["knots-legacy"]), leaf(by["bit-block"])] },
                leaf(by["bitcoin-roots"])
            ] }
        ].concat(rows.filter(function (r) { return r.lineage.cls === "own"; }).map(leaf)) };
        const own = rows.filter(function (r) { return r.lineage.cls === "own"; }).length;
        return figure({
            id: "fig-lineage-radial",
            headline: "Radial view: " + own + " separate codebases sit alone on the rim; one branch holds Bitcoin Core and everything forked from it.",
            caption: "Spokes from the centre are separate starting points. Arrows show stated derivation; the dashed arrow is Bitcoin Roots carrying Knots features.",
            measures: "The same lineage as the map above, drawn radially for comparison.",
            takeaway: "One branch has depth; the rest are single, separate projects.",
            title: "Radial lineage",
            desc: "Bitcoin Core branches to Bitcoin Knots and Bitcoin Roots; Knots branches to Knots Legacy and Bit-Block. Separate: " + rows.filter(function (r) { return r.lineage.cls === "own"; }).map(function (r) { return r.name; }).join(", ") + ".",
            chart: radialTree(tree, [{ from: "knots", to: "bitcoin-roots" }], { maxR: 200 }),
            table: { caption: "Radial lineage", columns: ["Implementation", "Parent"], rows: rows.map(function (r) { return [r.name, r.slug === "knots-legacy" || r.slug === "bit-block" ? "Bitcoin Knots" : r.slug === "bitcoin-roots" ? "Bitcoin Core (and Knots features)" : "none stated"]; }) }
        });
    }
};
