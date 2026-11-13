#!/usr/bin/env node
/**
 * Fill BLVM's formal-verification cell from the spec-lock and consensus trees.
 * A passing contract check is not written as a proof. Overlapping lists are
 * not added together.
 *
 *   BLVM_SPEC_LOCK_DIR   default: ../blvm-spec-lock
 *   BLVM_CONSENSUS_DIR   default: ../blvm-consensus
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specLock = path.resolve(process.env.BLVM_SPEC_LOCK_DIR || path.join(root, "../blvm-spec-lock"));
const consensus = path.resolve(process.env.BLVM_CONSENSUS_DIR || path.join(root, "../blvm-consensus"));

function read(dir, rel) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) throw new Error("missing " + file);
    return fs.readFileSync(file, "utf8");
}

function commit(dir) {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function countSentences(tsv) {
    const lines = tsv.split(/\n/).filter(function (line) { return line && !line.startsWith("id\t"); });
    const tally = { both: 0, lean: 0, disputed: 0, unsupported: 0 };
    for (const line of lines) {
        const parts = line.split("\t");
        const cls = parts[3] || "";
        const reason = parts[4] || "";
        if (cls === "both") tally.both += 1;
        else if (cls === "lean_statement" && reason === "spec_disputed") tally.disputed += 1;
        else if (cls === "lean_statement") tally.lean += 1;
        else if (cls === "unsupported") tally.unsupported += 1;
        else throw new Error("sentence inventory: unknown class " + cls + " on " + parts[0]);
    }
    const total = tally.both + tally.lean + tally.disputed + tally.unsupported;
    if (total !== lines.length) throw new Error("sentence inventory: tally " + total + " != rows " + lines.length);
    const notYet = tally.disputed + tally.unsupported;
    if (tally.both + tally.lean + notYet !== total) throw new Error("sentence parts do not add up");
    return { total, both: tally.both, lean: tally.lean, disputed: tally.disputed, unsupported: tally.unsupported, notYet };
}

const readme = read(specLock, "README.md");
const body = /This pass proves (\d+) functions from the function body:/.exec(readme);
if (!body) throw new Error("spec-lock README: body-proof sentence missing");
const names = /The functions are (.+?)\. Older counts:/.exec(readme);
if (!names) throw new Error("spec-lock README: function list missing");
const provedNames = names[1].split(", ").map(function (s) { return s.replace(/`/g, "").trim(); });
const provedCount = Number(body[1]);
if (provedNames.length !== provedCount) {
    throw new Error("body-proof count " + provedCount + " != list " + provedNames.length);
}

const mutation = read(specLock, "docs/MUTATION_COVERAGE.md");
const tool = /locked \/ \(locked \+ unlocked\) = (\d+) \/ (\d+)/.exec(mutation);
if (!tool) throw new Error("MUTATION_COVERAGE.md: coverage line missing");

const verificationDoc = read(consensus, "docs/VERIFICATION.md");
const written = /\*\*(\d+) \/ (\d+)\.\*\*/.exec(verificationDoc);
if (!written) throw new Error("VERIFICATION.md: 93 / 224 line missing");

const coverageDoc = read(specLock, "SPEC_LOCK_COVERAGE.md");
const attrs = /attribute count is (\d+)/.exec(coverageDoc);
if (!attrs) throw new Error("SPEC_LOCK_COVERAGE.md: attribute count missing");

const sentences = countSentences(read(specLock, "docs/sentence-inventory.tsv"));
const specLockCommit = commit(specLock);
const consensusCommit = commit(consensus);

const levels = [
    {
        id: "body_proof",
        label: "Proved from the function body",
        count: provedCount,
        denominator: null,
        counts_as_proof: true,
        note: "The check passes on the code as written, and two edits of the body make it fail. Not added to the lists below."
    },
    {
        id: "tool_mutation_list",
        label: "Tool mutation list",
        count: Number(tool[1]),
        denominator: Number(tool[2]),
        counts_as_proof: true,
        note: "docs/MUTATION_COVERAGE.md. A different list from the body-proof pass. Every row on that list is locked."
    },
    {
        id: "written_mutation_list",
        label: "Older written mutation list",
        count: Number(written[1]),
        denominator: Number(written[2]),
        counts_as_proof: false,
        note: "blvm-consensus docs/VERIFICATION.md. That file says this is not the current body-proof pass."
    },
    {
        id: "spec_locked_attributes",
        label: "spec_locked attributes",
        count: Number(attrs[1]),
        denominator: null,
        counts_as_proof: false,
        note: "Attribute count. Not a count of passing contract checks. A passing contract check is not a proof."
    }
];

const sentenceText = "Of " + sentences.total + " Orange Paper sentences, " + sentences.both +
    " is proved in Rust and Lean, " + sentences.lean + " in Lean only, " + sentences.notYet + " not yet";
const text = [
    "Body proofs: " + provedCount + " functions. The check passes, and two edits of the body make it fail.",
    "Tool mutation list: " + tool[1] + " of " + tool[2] + ", a different list.",
    "Older written mutation list: " + written[1] + " of " + written[2] + ", not this pass.",
    "spec_locked attributes: " + attrs[1] + ". That is not a passing-check count and not a proof.",
    sentenceText + ".",
    sentences.disputed + " of the not-yet sentences is spec_disputed (theorem 6.2.3 real series) and is not a Lean proof.",
    "These lists overlap. They are not a sum."
].join(" ");

const evidence = {
    schema_version: 1,
    generated_at: new Date().toISOString().slice(0, 10),
    sources: {
        spec_lock: { commit: specLockCommit, readme: "README.md", mutation: "docs/MUTATION_COVERAGE.md", sentences: "docs/sentence-inventory.tsv", attributes: "SPEC_LOCK_COVERAGE.md" },
        consensus: { commit: consensusCommit, verification: "docs/VERIFICATION.md" }
    },
    levels: levels,
    sentences: sentences,
    body_proof_functions: provedNames,
    text: text,
    passing_contract_check: {
        counts_as_proof: false,
        measured: false,
        note: "No verify JSON (report_format 2) was supplied. The attribute count is not that measurement."
    }
};

const out = path.join(root, "data/verification-evidence.json");
fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");

const verificationPath = path.join(root, "data/verification.json");
const verification = JSON.parse(fs.readFileSync(verificationPath, "utf8"));
const row = verification.rows.find(function (r) { return r.slug === "blvm"; });
if (!row) throw new Error("verification.json: no blvm row");
const cell = row.cells.formal_verification;
cell.status = "partial";
cell.text = text.replace(/\.$/, "");
cell.levels = levels;
cell.sentences = sentences;
cell.source = "https://github.com/BTCDecoded/blvm-spec-lock/blob/" + specLockCommit + "/README.md";
cell.evidence = "data/verification-evidence.json";
fs.writeFileSync(verificationPath, JSON.stringify(verification, null, 2) + "\n");
console.log("build-verification-evidence: " + sentences.total + " sentences, " + provedCount + " body proofs, tool " + tool[1] + "/" + tool[2]);
