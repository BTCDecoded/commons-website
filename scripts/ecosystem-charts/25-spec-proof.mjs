// BLVM spec-proof progress: the Orange Paper sentence counts stated in
// data/verification.json (BLVM, formal_verification). The counts are parsed
// from that cell's text; the render fails if the text changes shape or the
// parts do not add up.
import { figure, progress } from "../charts.mjs";

const PATTERN = /Of ([\d,]+) Orange Paper sentences, ([\d,]+) (?:is|are) proved in Rust and Lean, ([\d,]+) in Lean only, ([\d,]+) not yet/;

export default {
    slot: "chart-spec-proof",
    build: function (ctx) {
        const internal = ctx.data.internal_slug;
        const row = ctx.verification.rows.filter(function (r) { return r.slug === internal; })[0];
        const cell = row && row.cells.formal_verification;
        const m = cell && PATTERN.exec(cell.text);
        if (!m) throw new Error("spec-proof chart: formal_verification text no longer states the sentence counts");
        const n = m.slice(1).map(function (s) { return parseInt(s.replace(/,/g, ""), 10); });
        const total = n[0], both = n[1], lean = n[2], notYet = n[3];
        if (both + lean + notYet !== total) throw new Error("spec-proof chart: parts do not add up to " + total);
        const z3 = /Z3 proves (\d+) functions/.exec(cell.text);
        const pct = function (k) { return (Math.round(1000 * k / total) / 10) + "%"; };
        const segs = [
            { label: "Proved in Rust and Lean", value: both, valueText: both + " (" + pct(both) + ")", cls: "hl" },
            { label: "Lean only", value: lean, valueText: lean + " (" + pct(lean) + ")", cls: "c" },
            { label: "Not yet", value: notYet, valueText: notYet + " (" + pct(notYet) + ")", cls: "muted" }
        ];
        return figure({
            id: "fig-spec-proof",
            headline: row.name + ": " + (both + lean) + " of " + total + " Orange Paper sentences are formalized so far (" + pct(both + lean) + ").",
            caption: "Each Orange Paper sentence by proof status: machine-checked in both the Rust code and Lean, in the Lean model only, or not yet." + (z3 ? " Separately, Z3 proves " + z3[1] + " functions." : ""),
            measures: "How much of the Orange Paper spec BLVM has machine-checked; it matters because a proof covers every input, a test only the ones tried.",
            takeaway: "Most of the spec is not proved yet; the proof work has started, not finished.",
            title: row.name + " Orange Paper sentences by proof status",
            desc: segs.map(function (s) { return s.label + ": " + s.valueText; }).join("; ") + ". Total " + total + ".",
            chart: progress(segs, { total: total }),
            sources: [{ label: "blvm-spec-lock README", href: cell.source }, { label: "data/verification.json" }],
            table: { caption: row.name + " Orange Paper sentences by proof status", columns: ["Status", "Sentences", "Share"], rows: segs.map(function (s) { return [s.label, String(s.value), pct(s.value)]; }).concat([["Total", String(total), "100%"]]) }
        });
    }
};
