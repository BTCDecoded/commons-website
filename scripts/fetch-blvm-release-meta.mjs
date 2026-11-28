#!/usr/bin/env node
/**
 * Fetches the BTCDecoded/blvm release the homepage should show and writes:
 *   assets/blvm-release.json — public metadata for the homepage
 *   Updates the #release-banner-badge and #prerelease-banner-badge text in index.html
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

function patchSpan(html, id, text, hidden) {
  const re = new RegExp(
    `(<span[^>]*\\bid=["']${id}["'][^>]*)(>)([\\s\\S]*?)(</span>)`,
    "i",
  );
  if (!re.test(html)) {
    console.warn(`fetch-blvm-release-meta: id=${id} not found in index.html`);
    return html;
  }
  return html.replace(re, (_, open, _gt, _body, close) => {
    const attrs = open.replace(/\s+hidden(?:=(?:"[^"]*"|'[^']*'|[^\s>]*))?/i, "");
    return `${attrs}${hidden ? " hidden" : ""}>${escapeHtml(text)}${close}`;
  });
}

function tagName(release) {
  return typeof release?.tag_name === "string" ? release.tag_name.trim() : "";
}

function isLegacyPatchTrain(tag) {
  return /^v?0\.1\.\d+$/.test(tag);
}

function isProjectPreRelease(tag) {
  return /^v?\d+\.\d+\.\d+-(?:alpha|beta|rc)(?:\.|$)/i.test(tag);
}

function isRealProjectRelease(tag) {
  return /^v?\d+\.\d+\.\d+$/.test(tag) && !isLegacyPatchTrain(tag);
}

// Same rule as website/scripts/blvm-release-title.mjs selectDisplayedReleases.
// No real project release: newest beta or candidate is the only badge.
// After one exists: that tag is the main badge and the pre-release stays beside it.
function selectDisplayedReleases(releases) {
  const published = (Array.isArray(releases) ? releases : []).filter(
    (release) => release && release.draft !== true && tagName(release),
  );
  const real = published.find((release) => isRealProjectRelease(tagName(release))) ?? null;
  const pre = published.find((release) => isProjectPreRelease(tagName(release))) ?? null;
  if (real) {
    return {
      primary: real,
      secondary: pre && tagName(pre) !== tagName(real) ? pre : null,
    };
  }
  if (pre) return { primary: pre, secondary: null };
  const fallback = published.find((release) => release.prerelease !== true) ?? published[0] ?? null;
  return { primary: fallback, secondary: null };
}

function patchBadges(html, displayTag, prereleaseTag) {
  const withStable = patchSpan(html, "release-banner-badge", displayTag, false);
  return patchSpan(withStable, "prerelease-banner-badge", prereleaseTag || "", !prereleaseTag);
}

async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });

  if (args.has("--fallback")) {
    if (fs.existsSync(FALLBACK_JSON)) {
      fs.copyFileSync(FALLBACK_JSON, OUT_JSON);
      const meta = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
      const html = fs.readFileSync(INDEX_HTML, "utf8");
      fs.writeFileSync(
        INDEX_HTML,
        patchBadges(html, meta.displayTag, meta.prereleaseTag || ""),
        "utf8",
      );
      console.log("fetch-blvm-release-meta: fallback → assets/blvm-release.json + index badge");
    }
    return;
  }

  let displayTag = "Latest";
  let semver = "";
  let releasesLatestUrl = `https://github.com/${REPO}/releases/latest`;
  let releasesTagUrl = releasesLatestUrl;
  try {
    const releasesList = await ghFetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=30`,
    );
    const picked = selectDisplayedReleases(releasesList);
    const primary = picked.primary;
    if (!primary) throw new Error("No published GitHub release to display");
    const tag = tagName(primary);
    semver = tag.startsWith("v") ? tag.slice(1) : tag;
    displayTag = tag || (semver ? `v${semver}` : "Latest");
    releasesTagUrl =
      typeof primary.html_url === "string" && primary.html_url.trim()
        ? primary.html_url.trim()
        : `https://github.com/${REPO}/releases/tag/${tag}`;
    releasesLatestUrl = releasesTagUrl;
    const pre = picked.secondary;
    const prereleaseTag = pre ? tagName(pre) : "";
    const prereleaseUrl =
      pre && typeof pre.html_url === "string" ? pre.html_url.trim() : "";

    const meta = {
      displayTag,
      semver,
      releasesLatestUrl,
      releasesTagUrl,
      prereleaseTag,
      prereleaseUrl,
      generatedAt: new Date().toISOString(),
      source: `github://${REPO}`,
    };

    fs.writeFileSync(OUT_JSON, JSON.stringify(meta, null, 2) + "\n", "utf8");

    const html = fs.readFileSync(INDEX_HTML, "utf8");
    fs.writeFileSync(INDEX_HTML, patchBadges(html, displayTag, prereleaseTag), "utf8");

    console.log(
      `fetch-blvm-release-meta: wrote ${OUT_JSON}; index badge → ${displayTag}` +
        (prereleaseTag ? `; pre-release → ${prereleaseTag}` : ""),
    );
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
      fs.writeFileSync(INDEX_HTML, patchBadges(html, dt, meta.prereleaseTag || ""), "utf8");
      console.warn("fetch-blvm-release-meta: using blvm-release.fallback.json");
      return;
    }
    process.exit(1);
  }
}

main();
