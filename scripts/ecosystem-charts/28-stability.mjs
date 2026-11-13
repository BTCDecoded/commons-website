// Release-stability matrix. Each cell is one scored criterion in
// data/stability.json. The upstream-tracking tag is not a column: the file
// says it is descriptive and not part of the score. Rows with no checklist
// are left out.
import { figure, heatmap } from "../charts.mjs";

const STATUS = {
    "met": { cls: "st-yes", mark: "\u25CF", text: "met" },
    "not_met": { cls: "st-nf", mark: "\u25CB", text: "not met" },
    "not_measured": { cls: "st-na", mark: "?", text: "not measured" }
};

const SHORT = {
    has_stable_release: "Tag",
    docs_not_pre_release: "Docs",
    stable_release_in_12m: "Year",
    version_or_lts_policy: "1.0",
    vulnerability_disclosure: "Vuln",
    release_notes: "Notes",
    signed_or_reproducible: "Sign"
};

function list(names) {
    if (names.length < 2) return names.join("");
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

export default {
    slot: "chart-stability",
    build: function (ctx) {
        const checks = ctx.model.stability.definition.filter(function (c) { return c.type === "check"; });
        const cols = checks.map(function (c) { return { id: c.id, label: SHORT[c.id] || c.label, full: c.label }; });
        const rows = ctx.model.rows.map(function (r) {
            const cells = {};
            r.stability.cells.forEach(function (c) {
                if (!STATUS[c.status]) throw new Error("stability chart: unknown status " + c.status);
                cells[c.id] = c.status;
            });
            return { slug: r.slug, label: r.name, cls: r.internal ? "hl" : "", cells: cells, met: r.stability.met, lineage: r.lineage.cls };
        }).sort(function (a, b) { return b.met - a.met || (a.label < b.label ? -1 : 1); });
        const n = rows.length;
        const full = rows.filter(function (r) { return r.met === checks.length; });
        const missed = cols.map(function (c) {
            return { label: c.full, n: rows.filter(function (r) { return r.cells[c.id] === "not_met"; }).length };
        }).sort(function (a, b) { return b.n - a.n; });
        const versionId = "version_or_lts_policy";
        const line = rows.filter(function (r) { return r.lineage !== "own"; });
        const own = rows.filter(function (r) { return r.lineage === "own"; });
        const lineMet = line.filter(function (r) { return r.cells[versionId] === "met"; }).length;
        const ownMet = own.filter(function (r) { return r.cells[versionId] === "met"; }).length;
        const missName = missed[0].label.charAt(0).toUpperCase() + missed[0].label.slice(1);
        const headline = (full.length === 1 ? full[0].label + " is the only tree that meets all seven checks." : (full.length ? list(full.map(function (r) { return r.label; })) + " meet all seven checks." : "No tree meets all seven checks.")) + " " + missName + " is missed by " + missed[0].n + " of " + n + ".";
        return figure({
            id: "fig-stability",
            headline: headline,
            caption: "Filled means the check holds. Empty means it was checked and does not hold. Rows are sorted by how many checks hold. Columns: " + cols.map(function (c) { return c.label + " is " + c.full; }).join("; ") + ". A version of 1.0 or an LTS line holds for " + lineMet + " of " + line.length + " Core-line trees and " + ownMet + " of " + own.length + " own-code trees. That column follows the version number. The Sign column is a signature or a reproducible build. Tracks-an-upstream-line is not in this grid.",
            measures: "Which of the seven release checks each tree meets. The count on a card is the number of filled cells in that row.",
            takeaway: "A row that misses one check is not almost the full row. The missing check is the thing to read.",
            title: "Release stability by implementation",
            desc: rows.map(function (r) { return r.label + ": " + r.met + " of " + checks.length + " met"; }).join("; ") + ".",
            chart: heatmap(rows, cols, STATUS),
            sources: [{ label: "data/stability.json" }, { label: "evidence links in the verification table", href: "#eco-glance" }],
            table: {
                caption: "Release stability by implementation, as of " + ctx.stability.as_of,
                columns: ["Implementation"].concat(cols.map(function (c) { return c.full; })).concat(["Met"]),
                rows: rows.map(function (r) { return [r.label].concat(cols.map(function (c) { return STATUS[r.cells[c.id]].text; })).concat([String(r.met)]); })
            }
        });
    }
};
