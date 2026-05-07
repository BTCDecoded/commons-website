#!/usr/bin/env node
/**
 * Fetches BTCDecoded/blvm latest GitHub Release and writes:
 *   assets/blvm-release.json — public metadata for the homepage
 *   Updates the #release-banner-badge text in index.html
 *
 * Use GITHUB_TOKEN in CI when available (public repo API ok without auth).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const OUT_JSON = path.join(ASSETS, "blvm-release.json");
const FALLBACK_JSON = path.join(ASSETS, "blvm-release.fallback.json");
const INDEX_HTML = path.join(ROOT, "index.html");
const REPO = "BTCDecoded/blvm";

const args = new Set(process.argv.slice(2));

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function patchBadgeHtml(html, displayTag) {
  const escaped = escapeHtml(displayTag);
  const re = /(<span[^>]*\bid=["']release-banner-badge["'][^>]*>)([\s\S]*?)(<\/span>)/i;
  if (!re.test(html)) {
    console.warn("fetch-blvm-release-meta: id=release-banner-badge not found in index.html");
    return html;
  }
  return html.replace(re, `$1${escaped}$3`);
}

async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });

  if (args.has("--fallback")) {
    if (fs.existsSync(FALLBACK_JSON)) {
      fs.copyFileSync(FALLBACK_JSON, OUT_JSON);
      const meta = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
      const html = fs.readFileSync(INDEX_HTML, "utf8");
      fs.writeFileSync(INDEX_HTML, patchBadgeHtml(html, meta.displayTag), "utf8");
      console.log("fetch-blvm-release-meta: fallback → assets/blvm-release.json + index badge");
    }
    return;
  }

  let displayTag = "Latest";
  let semver = "";
  let releasesLatestUrl = `https://github.com/${REPO}/releases/latest`;
  let releasesTagUrl = releasesLatestUrl;
  try {
    const latest = await ghFetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    const tag = latest.tag_name ?? "";
    semver =
      typeof latest.tag_name === "string"
        ? (latest.tag_name.startsWith("v") ? latest.tag_name.slice(1) : latest.tag_name)
        : "";
    displayTag =
      typeof latest.tag_name === "string" && latest.tag_name.trim()
        ? latest.tag_name.trim()
        : semver
          ? `v${semver}`
          : "Latest";
    releasesLatestUrl = `https://github.com/${REPO}/releases/latest`;
    releasesTagUrl =
      typeof latest.html_url === "string" && latest.html_url.trim()
        ? latest.html_url.trim()
        : `https://github.com/${REPO}/releases/tag/${tag}`;

    const meta = {
      displayTag,
      semver,
      releasesLatestUrl,
      releasesTagUrl,
      generatedAt: new Date().toISOString(),
      source: `github://${REPO}`,
    };

    fs.writeFileSync(OUT_JSON, JSON.stringify(meta, null, 2) + "\n", "utf8");

    const html = fs.readFileSync(INDEX_HTML, "utf8");
    fs.writeFileSync(INDEX_HTML, patchBadgeHtml(html, displayTag), "utf8");

    console.log(`fetch-blvm-release-meta: wrote ${OUT_JSON}; index badge → ${displayTag}`);
  } catch (e) {
    console.error("fetch-blvm-release-meta:", e.message ?? e);
    if (process.env.CI === "true" || args.has("--strict")) {
      process.exit(1);
    }
    if (fs.existsSync(FALLBACK_JSON)) {
      fs.copyFileSync(FALLBACK_JSON, OUT_JSON);
      const meta = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
      const dt = meta.displayTag || "Latest";
      const html = fs.readFileSync(INDEX_HTML, "utf8");
      fs.writeFileSync(INDEX_HTML, patchBadgeHtml(html, dt), "utf8");
      console.warn("fetch-blvm-release-meta: using blvm-release.fallback.json");
      return;
    }
    process.exit(1);
  }
}

main();
