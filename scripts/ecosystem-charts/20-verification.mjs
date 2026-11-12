// Verification matrix: every cell is a status in data/verification.json.
// Rows sort by count of "yes", then "partial", then name.
import { figure, heatmap } from "../charts.mjs";

const STATUS = {
    "yes": { cls: "st-yes", mark: "\u25CF", text: "yes" },
    "partial": { cls: "st-partial", mark: "\u25D0", text: "partial" },
    "not found": { cls: "st-nf", mark: "\u25CB", text: "not found" },
    "n/a": { cls: "st-na", mark: "\u2013", text: "n/a" }
};

export default {
    slot: "chart-verification",
    build: function (ctx) {
        const v = ctx.verification, internal = ctx.data.internal_slug;
        const cols = v.columns.map(function (c) { return { id: c.id, label: c.short || c.name, short: ({ formal_spec: "Spec", test_vectors: "Vec", property_tests: "Prop", fuzzing: "Fuzz", formal_verification: "Proof", differential: "Diff" })[c.id] || c.short }; });
        const rows = v.rows.map(function (r) {
            const cells = {}, count = { yes: 0, partial: 0 };
            v.columns.forEach(function (c) {
                const st = r.cells[c.id].status;
                if (!STATUS[st]) throw new Error("verification chart: unknown status " + st);
                cells[c.id] = st;
                if (st in count) count[st]++;
            });
            return { slug: r.slug, label: r.name, cls: r.slug === internal ? "hl" : "", cells: cells, yes: count.yes, partial: count.partial };
        }).sort(function (a, b) { return b.yes - a.yes || b.partial - a.partial || (a.label < b.label ? -1 : 1); });
        const top = rows[0];
        const full = rows.filter(function (r) { return r.yes === cols.length; }).length;
        return figure({
            id: "fig-verification",
            headline: top.label + " has the most evidence: " + top.yes + " of " + cols.length + " checks found" + (top.partial ? ", " + top.partial + " partial" : "") + ". " + (full ? full + " implementations have all six." : "No implementation has all six."),
            caption: "One row per implementation, sorted by checks found. Each cell is the status in the verification table below, as of " + v.as_of + ". \u201CNot found\u201D means no public source turned up, not that the project lacks it.",
            measures: "Which of six kinds of evidence each project shows, column by column; it matters because the rarest checks are where projects can disagree unnoticed.",
            takeaway: "Formal specs and proofs are the rare columns; test vectors and fuzzing are common.",
            title: "Verification evidence by implementation",
            desc: rows.map(function (r) { return r.label + ": " + r.yes + " yes, " + r.partial + " partial"; }).join("; ") + ".",
            chart: heatmap(rows, cols, STATUS),
            sources: [{ label: "data/verification.json" }, { label: "sources per cell in the table below", href: "#eco-glance" }],
            table: { caption: "Verification status by implementation", columns: ["Implementation"].concat(v.columns.map(function (c) { return c.name; })).concat(["Yes", "Partial"]), rows: rows.map(function (r) { return [r.label].concat(v.columns.map(function (c) { return r.cells[c.id]; })).concat([String(r.yes), String(r.partial)]); }) }
        });
    }
};
