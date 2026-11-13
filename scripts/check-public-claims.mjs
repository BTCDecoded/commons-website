#!/usr/bin/env node
// Fail when a public page uses a status phrase that has no evidence link
// on the allow list. Matching is case-insensitive.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deny = [
    { id: "hundred-z3", re: /100%\s*z3/i },
    { id: "hundred-verified", re: /100%\s*verified/i },
    { id: "governance-solved", re: /governance solved/i },
    { id: "zero-divergence", re: /zero divergence/i },
    { id: "six-x", re: /6x harder|harder to capture/i },
    { id: "nearly-two-years", re: /nearly two years/i }
];
const allowPath = path.join(root, "data/claims-allow.json");
const allow = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, "utf8")) : [];
const exts = new Set([".html", ".md", ".txt", ".svg", ".json"]);
const skip = new Set(["node_modules", ".git", "_site", "_blvm-spec", "_governance", "_blvm-spec-lock", "_blvm-consensus", "spec-viz", "spec-viz-project"]);

function allowed(rel, id) {
    return allow.some(function (row) {
        return row.file === rel && row.id === id && /^https:\/\//.test(row.evidence || "");
    });
}

const hits = [];
function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        if (skip.has(name)) continue;
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        if (st.isDirectory()) { walk(abs); continue; }
        if (!exts.has(path.extname(name))) continue;
        if (st.size > 2_000_000) continue;
        const rel = path.relative(root, abs);
        if (rel === "CLAIMS.md" || rel === "scripts/check-public-claims.mjs") continue;
        const lines = fs.readFileSync(abs, "utf8").split("\n");
        lines.forEach(function (line, i) {
            deny.forEach(function (phrase) {
                if (phrase.re.test(line) && !allowed(rel, phrase.id)) {
                    hits.push(rel + ":" + (i + 1) + " " + phrase.id);
                }
            });
        });
    }
}
walk(root);
if (hits.length) {
    console.error("public claims: denied phrase without an evidence allow-list entry");
    hits.forEach(function (hit) { console.error("  " + hit); });
    process.exit(1);
}
console.log("check-public-claims: ok");
