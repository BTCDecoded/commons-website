// BLVM formal verification as separate counts. No shared bar: the lists
// are not shares of one score. Detail sits on each count and in a disclosure.
import { figure, esc } from "../charts.mjs";

const PATTERN = /Of ([\d,]+) Orange Paper sentences, ([\d,]+) (?:is|are) proved in Rust and Lean, ([\d,]+) in Lean only, ([\d,]+) not yet/;

function sentencesFrom(cell) {
    if (cell.sentences && cell.sentences.total) return cell.sentences;
    const m = PATTERN.exec(cell.text || "");
    if (!m) throw new Error("spec-proof chart: formal_verification text no longer states the sentence counts");
    const n = m.slice(1).map(function (s) { return parseInt(s.replace(/,/g, ""), 10); });
    return { total: n[0], both: n[1], lean: n[2], notYet: n[3], disputed: 0 };
}

function level(levels, id) {
    return levels.filter(function (row) { return row.id === id; })[0];
}

function ratio(row) {
    return row.denominator ? row.count + " of " + row.denominator : String(row.count);
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
        const levels = cell.levels || [];
        const attrs = level(levels, "spec_locked_attributes");
        const body = level(levels, "body_proof");
        if (!attrs || !body) throw new Error("spec-proof chart: missing spec-lock counts");
        const reasons = sentences.reasons || null;
        const leanProved = sentences.both + sentences.lean;
        const tool = level(levels, "tool_mutation_list");
        const written = level(levels, "written_mutation_list");
        const tiles = [
            { n: String(attrs.count), label: "spec-locked", cls: "", tip: "Functions marked spec_locked. The spec-lock prover and Z3 check this surface." },
            { n: String(body.count), label: "proved from the body", cls: "proof", tip: "This pass. The check passes on the written body, and two edits of that body make it fail." }
        ];
        const face = "<ul class=\"eco-fv\">" + tiles.map(function (t) {
            return "<li class=\"" + t.cls + "\" tabindex=\"0\" title=\"" + esc(t.tip) + "\"><b>" + esc(t.n) + "</b><span class=\"lbl\">" + esc(t.label) + "</span><span class=\"eco-fv-tip\" role=\"tooltip\">" + esc(t.tip) + "</span></li>";
        }).join("") + "</ul>";
        const lines = [
            attrs.count + " spec-locked annotations. " + attrs.note,
            body.count + " proved from the body. " + body.note.replace(" Not added to the lists below.", "")
        ];
        if (reasons) {
            lines.push(leanProved + " Lean sentence proofs (" + sentences.both + " also in Rust, " + sentences.lean + " Lean only). Lean checks those Orange Paper sentences. " + reasons.parse_failed + " of " + sentences.total + " inventory rows are prose, and " + reasons.model_unwritten + " have no Lean model yet.");
        } else {
            lines.push(leanProved + " Lean sentence proofs in an inventory of " + sentences.total + ". Lean checks those Orange Paper sentences.");
        }
        [tool, written].forEach(function (item) {
            if (item) lines.push(ratio(item) + ". " + item.label + ". " + item.note);
        });
        const more = "<details class=\"eco-notes\"><summary>How to read these numbers</summary><ul>" +
            lines.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ul></details>";
        const tableRows = [
            ["spec-locked", String(attrs.count), "annotation count"],
            ["proved from the body", String(body.count), "this pass"]
        ];
        if (tool) tableRows.push(["tool mutation list", ratio(tool), "different list"]);
        if (written) tableRows.push(["older written mutation list", ratio(written), "not this pass"]);
        tableRows.push(["Lean sentence proofs", String(leanProved), "separate inventory"]);
        return figure({
            id: "fig-spec-proof",
            headline: row.name + " formal verification",
            caption: "",
            html: face + more,
            sources: [{ label: "sentence inventory", href: cell.source }, { label: "data/verification-evidence.json" }],
            table: {
                caption: row.name + " formal verification counts",
                columns: ["List", "Count", "Role"],
                rows: tableRows
            }
        });
    }
};
