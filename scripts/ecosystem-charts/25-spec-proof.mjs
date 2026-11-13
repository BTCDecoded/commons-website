// Orange Paper sentences, then the function evidence levels.
// The levels are separate lists. The chart does not add them.
import { figure, progress } from "../charts.mjs";

const PATTERN = /Of ([\d,]+) Orange Paper sentences, ([\d,]+) (?:is|are) proved in Rust and Lean, ([\d,]+) in Lean only, ([\d,]+) not yet/;

function sentencesFrom(cell) {
    if (cell.sentences && cell.sentences.total) return cell.sentences;
    const m = PATTERN.exec(cell.text || "");
    if (!m) throw new Error("spec-proof chart: formal_verification text no longer states the sentence counts");
    const n = m.slice(1).map(function (s) { return parseInt(s.replace(/,/g, ""), 10); });
    return { total: n[0], both: n[1], lean: n[2], notYet: n[3], disputed: 0 };
}

export default {
    slot: "chart-spec-proof",
    build: function (ctx) {
        const internal = ctx.data.internal_slug;
        const row = ctx.verification.rows.filter(function (r) { return r.slug === internal; })[0];
        const cell = row && row.cells.formal_verification;
        if (!cell) throw new Error("spec-proof chart: no formal_verification cell");
        const sentences = sentencesFrom(cell);
        if (sentences.both + sentences.lean + sentences.notYet !== sentences.total) {
            throw new Error("spec-proof chart: parts do not add up to " + sentences.total);
        }
        const pct = function (k) { return (Math.round(1000 * k / sentences.total) / 10) + "%"; };
        const levels = cell.levels || [];
        const body = levels.filter(function (level) { return level.id === "body_proof"; })[0];
        const leanProved = sentences.both + sentences.lean;
        const segs = [
            { label: "Proved in Rust and Lean", value: sentences.both, valueText: sentences.both + " (" + pct(sentences.both) + ")", cls: "hl" },
            { label: "Lean only", value: sentences.lean, valueText: sentences.lean + " (" + pct(sentences.lean) + ")", cls: "c" },
            { label: "Not yet", value: sentences.notYet, valueText: sentences.notYet + " (" + pct(sentences.notYet) + ")", cls: "muted" }
        ];
        const leanHead = "Lean has proved " + leanProved + " of " + sentences.total + " Orange Paper sentences (" + pct(leanProved) + ").";
        const sentenceFigure = figure({
            id: "fig-spec-proof",
            headline: body
                ? row.name + ": the spec-lock prover and Z3 have proved " + body.count + " Rust functions from the body. " + leanHead + " Those counts are separate lists."
                : row.name + ": " + leanHead + " This bar is the Lean sentence inventory.",
            caption: "This bar is the Lean sentence inventory. Lean does not check the Rust. Not yet includes sentences the inventory marks spec_disputed. The spec-lock prover and Z3 are the function table.",
            measures: "The bar counts Orange Paper sentences with a Lean proof. The function table counts spec-lock checks of the Rust.",
            takeaway: "Most Orange Paper sentences have no Lean proof yet. Rust proofs are the spec-lock table, not this percentage.",
            title: row.name + " Orange Paper sentences by Lean proof status",
            desc: segs.map(function (s) { return s.label + ": " + s.valueText; }).join("; ") + ". Total " + sentences.total + ".",
            chart: progress(segs, { total: sentences.total }),
            sources: [{ label: "sentence inventory", href: cell.source }, { label: "data/verification-evidence.json" }],
            table: { caption: row.name + " Orange Paper sentences by proof status", columns: ["Status", "Sentences", "Share"], rows: segs.map(function (s) { return [s.label, String(s.value), pct(s.value)]; }).concat([["Total", String(sentences.total), "100%"]]) }
        });
        if (!levels.length) return sentenceFigure;
        function shownLevel(level) {
            if (level.id === "body_proof") return "Proved from the body by the spec-lock prover and Z3";
            return level.label;
        }
        const levelFigure = figure({
            id: "fig-proof-levels",
            headline: "Spec-lock prover and Z3 function lists. They overlap, so they are not added to the Lean sentence count.",
            caption: "A passing spec-lock contract check is not in the proof count. The attribute count is not a count of passing checks.",
            measures: "Each list is the count its own file states. The denominator is that file's denominator.",
            takeaway: body.count + " Rust functions are proved from the body on this pass, by the spec-lock prover and Z3. The other lists are not that count.",
            title: row.name + " function evidence by level",
            desc: levels.map(function (level) {
                const ratio = level.denominator ? level.count + " of " + level.denominator : String(level.count);
                return shownLevel(level) + ": " + ratio + (level.counts_as_proof ? "" : ", not this proof count");
            }).join("; ") + ".",
            html: "<div class=\"eco-scroll\" tabindex=\"0\"><table><caption>Spec-lock prover and Z3 function lists. Lists are not added to the Lean count.</caption><thead><tr><th scope=\"col\">Level</th><th scope=\"col\">Count</th><th scope=\"col\">Counted as proof</th></tr></thead><tbody>" +
                levels.map(function (level) {
                    const ratio = level.denominator ? level.count + " of " + level.denominator : String(level.count);
                    return "<tr><th scope=\"row\">" + shownLevel(level) + "</th><td>" + ratio + "</td><td>" + (level.counts_as_proof ? "yes, this list" : "no") + "</td></tr>";
                }).join("") + "</tbody></table></div>",
            sources: [{ label: "data/verification-evidence.json" }, { label: "blvm-spec-lock README", href: cell.source }],
            table: {
                caption: "Function evidence by level",
                columns: ["Level", "Count", "Counted as proof"],
                rows: levels.map(function (level) {
                    const ratio = level.denominator ? level.count + " of " + level.denominator : String(level.count);
                    return [shownLevel(level), ratio, level.counts_as_proof ? "yes, this list" : "no"];
                })
            }
        });
        return sentenceFigure + levelFigure;
    }
};
