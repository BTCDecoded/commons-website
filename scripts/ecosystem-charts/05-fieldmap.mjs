// Field map: independence (columns) by assurance (up). Each dot and label is
// a link to that implementation's card, including BLVM.
import { fieldMap, median } from "../charts.mjs";

export function fieldmapSpec(ctx) {
        const rows = ctx.model.rows;
        const cols = [{ id: "lineage", label: "Satoshi lineage" }, { id: "own", label: "Own codebase" }];
        const med = median(rows.map(function (r) { return r.assurance.pct; }));
        const pts = rows.map(function (r) {
            return { col: r.lineage.cls === "own" ? "own" : "lineage", y: r.assurance.pct, label: r.name, valueText: r.assurance.score + " of " + r.assurance.max + " (" + r.assurance.pct + "%)", href: "#card-" + r.slug, cls: r.internal ? "hl" : r.lineage.cls === "core" ? "core" : "", mark: r.lineage.cls === "core" ? "square" : "" };
        });
        const range = function (col) { const ys = pts.filter(function (p) { return p.col === col; }).map(function (p) { return p.y; }); return [Math.min.apply(null, ys), Math.max.apply(null, ys)]; };
        const lin = range("lineage");
        const core = rows.filter(function (r) { return r.lineage.cls === "core"; })[0];
        const ownRows = rows.filter(function (r) { return r.lineage.cls === "own"; });
        const below = ownRows.filter(function (r) { return r.assurance.pct < core.assurance.pct; }).length;
        const medText = Number.isInteger(med) ? String(med) : String(med);
        return {
            id: "fig-fieldmap",
            headline: (function () { const above = ownRows.filter(function (r) { return r.assurance.pct > med; }).length; return "The median assurance score is " + medText + "%. The Satoshi lineage sits between " + lin[0] + "% and " + lin[1] + "%; " + above + " of " + ownRows.length + " own codebases score above the median."; })(),
            caption: "Left column: Bitcoin Core and its forks. Right column: separate codebases, including BLVM. Height is the assurance score as a share of possible points. Select a name to open its card.",
            measures: "Independence against assurance; it matters because a separate codebase only adds safety if it can show it follows the same rules.",
            takeaway: (function () {
                const fam = rows.filter(function (r) { return r.lineage.cls !== "own"; }), forks = rows.filter(function (r) { return r.lineage.cls === "fork"; });
                const stOf = function (r, id) { return r.assurance.cells.filter(function (c) { return c.id === id; })[0].status; };
                const all = function (id, s) { return forks.every(function (r) { return stOf(r, id) === s; }); };
                const carry = ["test_vectors", "fuzzing"].filter(function (id) { return all(id, "yes"); });
                const none = [["formal_spec", "formal spec"], ["property_tests", "property tests"], ["formal_verification", "formal verification"], ["differential", "differential cell"]].filter(function (x) { return all(x[0], "not found"); }).map(function (x) { return x[1]; });
                const lst = function (a, j) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + ", " + j + " " + a[a.length - 1]; };
                return fam.length + " of the " + rows.length + " implementations are Bitcoin Core or are stated as built from Core or Knots, and the other " + (rows.length - fam.length) + " are separate codebases" +
                    (forks.length && (carry.length || none.length) ? "; the Core-derived forks " + (carry.length === 2 ? "carry Core\u2019s test vectors and fuzz harnesses" : carry.length ? "carry Core\u2019s " + (carry[0] === "fuzzing" ? "fuzz harnesses" : "test vectors") : "") + (carry.length && none.length ? " and " : "") + (none.length ? "have no found " + lst(none, "or") : "") : "") + ". " +
                    below + " of " + ownRows.length + " own codebases show less evidence than Bitcoin Core.";
            })(),
            title: "Field map: independence by assurance",
            desc: pts.map(function (p) { return p.label + ", " + (p.col === "own" ? "own codebase" : "Satoshi lineage") + ", assurance " + p.valueText; }).join("; ") + ". Median of all " + rows.length + ": " + medText + "%.",
            chart: fieldMap(cols, pts, { yLabel: "Assurance, share of possible points", median: med }),
            sources: [{ label: "data/verification.json" }, { label: "data/implementations.json (history)" }],
            table: { caption: "Field map", columns: ["Implementation", "Independence", "Assurance"], rows: pts.map(function (p) { return [p.label, p.col === "own" ? "Own codebase" : "Satoshi lineage", p.valueText]; }) }
        };
}

export default {
    slot: "chart-fieldmap",
    build: function () { return ""; }
};
