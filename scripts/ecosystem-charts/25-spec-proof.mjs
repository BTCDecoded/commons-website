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
        const attrs = levels.filter(function (level) { return level.id === "spec_locked_attributes"; })[0];
        const leanProved = sentences.both + sentences.lean;
        const reasons = sentences.reasons || null;
        let segs;
        if (reasons) {
            const other = reasons.emitter_shape_missing + reasons.out_of_scope + reasons.spec_disputed;
            segs = [
                { label: "Proved in Rust and Lean", value: sentences.both, valueText: sentences.both + " (" + pct(sentences.both) + ")", cls: "hl" },
                { label: "Lean only", value: sentences.lean, valueText: sentences.lean + " (" + pct(sentences.lean) + ")", cls: "c" },
                { label: "Prose the inventory cannot check", value: reasons.parse_failed, valueText: reasons.parse_failed + " (" + pct(reasons.parse_failed) + ")", cls: "muted" },
                { label: "No Lean model yet", value: reasons.model_unwritten, valueText: reasons.model_unwritten + " (" + pct(reasons.model_unwritten) + ")", cls: "muted" },
                { label: "Not a Lean proof", value: other, valueText: other + " (" + pct(other) + ")", cls: "muted" }
            ].filter(function (s) { return s.value > 0; });
            const sum = segs.reduce(function (n, s) { return n + s.value; }, 0);
            if (sum !== sentences.total) throw new Error("spec-proof chart: reason parts do not add up to " + sentences.total);
        } else {
            segs = [
                { label: "Proved in Rust and Lean", value: sentences.both, valueText: sentences.both + " (" + pct(sentences.both) + ")", cls: "hl" },
                { label: "Lean only", value: sentences.lean, valueText: sentences.lean + " (" + pct(sentences.lean) + ")", cls: "c" },
                { label: "Not yet", value: sentences.notYet, valueText: sentences.notYet + " (" + pct(sentences.notYet) + ")", cls: "muted" }
            ];
        }
        const headline = (attrs && body)
            ? row.name + ": " + attrs.count + " consensus functions carry a spec_locked annotation. The spec-lock prover and Z3 check that surface. " + body.count + " functions are proved from the body on this pass."
            : row.name + ": Lean sentence inventory, " + leanProved + " of " + sentences.total + ". This is not the spec-lock coverage figure.";
        const caption = (attrs ? attrs.count + " is the number of spec_locked attributes. It is not a proof count. A body proof passes on the written body and fails after two edits of that body. " : "") +
            (reasons
                ? "The bar is a different list, the Lean sentence inventory. " + reasons.parse_failed + " of " + sentences.total + " rows are prose that inventory cannot turn into a check, and " + reasons.model_unwritten + " have no Lean model yet. " + leanProved + " Lean proofs are not a coverage score for the spec-locked functions. Lean does not check the Rust."
                : "The bar is the Lean sentence inventory. Lean does not check the Rust.");
        const sentenceFigure = figure({
            id: "fig-spec-proof",
            headline: headline,
            caption: caption,
            measures: "The headline is the spec-lock surface. The bar is only the Lean inventory, and most of that inventory is prose it cannot check.",
            takeaway: "Spec-lock coverage is the annotation count. The Lean percentage is not that coverage.",
            title: row.name + " Lean sentence inventory, not spec-lock coverage",
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
