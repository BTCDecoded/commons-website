// Field map: independence (columns) by assurance (up). Each dot and label is
// a link to that implementation's card. No script.
import { figure, fieldMap } from "../charts.mjs";

export default {
    slot: "chart-fieldmap",
    build: function (ctx) {
        const rows = ctx.model.rows;
        const cols = [{ id: "lineage", label: "Core lineage" }, { id: "own", label: "Own codebase" }];
        const pts = rows.map(function (r) {
            return { col: r.lineage.cls === "own" ? "own" : "lineage", y: r.assurance.pct, label: r.name, valueText: r.assurance.score + " of " + r.assurance.max + " (" + r.assurance.pct + "%)", href: "#card-" + r.slug, cls: r.internal ? "hl" : r.lineage.cls === "core" ? "core" : "", mark: r.lineage.cls === "core" ? "square" : "" };
        });
        const range = function (col) { const ys = pts.filter(function (p) { return p.col === col; }).map(function (p) { return p.y; }); return [Math.min.apply(null, ys), Math.max.apply(null, ys)]; };
        const own = range("own"), lin = range("lineage");
        const core = rows.filter(function (r) { return r.lineage.cls === "core"; })[0];
        const ownRows = rows.filter(function (r) { return r.lineage.cls === "own"; });
        const below = ownRows.filter(function (r) { return r.assurance.pct < core.assurance.pct; }).length;
        return figure({
            id: "fig-fieldmap",
            headline: "Own codebases range from " + own[0] + "% to " + own[1] + "% on assurance; the Core lineage sits between " + lin[0] + "% and " + lin[1] + "%.",
            caption: "Left column: Bitcoin Core and its forks. Right column: separate codebases. Height is the assurance score as a share of possible points. Select a name to open its card.",
            measures: "Independence against assurance; it matters because a separate codebase only adds safety if it can show it follows the same rules.",
            takeaway: below + " of " + ownRows.length + " own codebases show less evidence than Bitcoin Core: being independent and showing evidence are different things.",
            title: "Field map: independence by assurance",
            desc: pts.map(function (p) { return p.label + ", " + (p.col === "own" ? "own codebase" : "Core lineage") + ", assurance " + p.valueText; }).join("; ") + ".",
            chart: fieldMap(cols, pts, { yLabel: "Assurance, share of possible points" }),
            sources: [{ label: "data/verification.json" }, { label: "data/implementations.json (history)" }],
            table: { caption: "Field map", columns: ["Implementation", "Independence", "Assurance"], rows: pts.map(function (p) { return [p.label, p.col === "own" ? "Own codebase" : "Core lineage", p.valueText]; }) }
        });
    }
};
