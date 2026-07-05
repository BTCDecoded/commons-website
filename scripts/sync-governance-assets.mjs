#!/usr/bin/env node
/**
 * Copy governance repo assets into assets/governance/ for same-origin viewers.
 * CI: checkout governance to _governance and set GOVERNANCE_DIR=_governance
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "governance");
const REPO = "BTCDecoded/governance";
const REF = "main";

const FILES = ["COMPACT.md", "fork-registry.yml"];

function resolveSourceDir() {
  const candidates = [
    process.env.GOVERNANCE_DIR,
    path.resolve(ROOT, "../governance"),
    path.resolve(ROOT, "_governance"),
  ].filter(Boolean);

  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    const probe = path.join(resolved, "fork-registry.yml");
    if (fs.existsSync(probe)) {
      return resolved;
    }
  }
  return null;
}

async function ghFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${url}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function fetchFileFromGitHub(name) {
  const url =
    "https://api.github.com/repos/" +
    REPO +
    "/contents/" +
    encodeURIComponent(name) +
    "?ref=" +
    encodeURIComponent(REF);
  const data = await ghFetch(url);
  if (!data || data.encoding !== "base64" || !data.content) {
    throw new Error("Unexpected GitHub contents payload for " + name);
  }
  return {
    body: Buffer.from(data.content, "base64").toString("utf8"),
    sha: data.sha || "",
  };
}

function writeManifest(copied) {
  const hash = crypto.createHash("sha256");
  for (const name of FILES) {
    hash.update(name);
    hash.update("\0");
    hash.update(copied[name].body);
    hash.update("\0");
  }
  const rev = hash.digest("hex").slice(0, 16);
  const manifest = {
    rev,
    ref: REF,
    source: `github://${REPO}`,
    files: Object.fromEntries(
      FILES.map((name) => [name, { sha: copied[name].sha || null }])
    ),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  return rev;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sourceDir = resolveSourceDir();
  const copied = {};

  if (sourceDir) {
    console.log("sync-governance-assets: copying from", sourceDir);
    for (const name of FILES) {
      const src = path.join(sourceDir, name);
      if (!fs.existsSync(src)) {
        throw new Error("Missing " + src);
      }
      const body = fs.readFileSync(src, "utf8");
      fs.writeFileSync(path.join(OUT_DIR, name), body, "utf8");
      copied[name] = { body, sha: "" };
    }
  } else {
    console.log("sync-governance-assets: fetching from GitHub API (" + REPO + ")");
    for (const name of FILES) {
      const file = await fetchFileFromGitHub(name);
      fs.writeFileSync(path.join(OUT_DIR, name), file.body, "utf8");
      copied[name] = file;
    }
  }

  const rev = writeManifest(copied);
  console.log(
    "sync-governance-assets: wrote assets/governance/ (" +
      FILES.length +
      " files, rev " +
      rev +
      ")"
  );
}

main().catch((err) => {
  console.error("sync-governance-assets:", err.message ?? err);
  process.exit(1);
});
