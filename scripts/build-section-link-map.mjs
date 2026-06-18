#!/usr/bin/env node
/**
 * Build section-link-map.json from blvm-spec PROTOCOL.md + ARCHITECTURE.md headings.
 * GFM heading ids match marked-gfm-heading-id (github-slugger-style slugs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PROTOCOL = path.join(ROOT, 'blvm-spec/PROTOCOL.md');
const ARCHITECTURE = path.join(ROOT, 'blvm-spec/ARCHITECTURE.md');
const OUT = path.join(__dirname, '../section-link-map.json');

/** Same slug rules as marked-gfm-heading-id (github-slugger, lowercase, strip punctuation). */
function headingSlug(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function parseHeadings(filePath) {
    const base = path.basename(filePath);
    const map = new Map();
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
        const m = line.match(/^(#{1,6})\s+(.+)$/);
        if (!m) continue;
        const text = m[2].trim();
        const sm = text.match(/^(\d+(?:\.\d+)*)\b/);
        if (!sm) continue;
        const section = sm[1];
        map.set(section, {
            file: base,
            id: headingSlug(text),
            text,
        });
    }
    return map;
}

function mergeMaps(protocol, architecture) {
    const merged = Object.create(null);
    for (const [k, v] of protocol) {
        merged[k] = v;
    }
    for (const [k, v] of architecture) {
        if (!merged[k]) {
            merged[k] = v;
        }
    }
    return merged;
}

const protocol = parseHeadings(PROTOCOL);
const architecture = parseHeadings(ARCHITECTURE);
const sections = mergeMaps(protocol, architecture);

const payload = {
    generatedFrom: ['PROTOCOL.md', 'ARCHITECTURE.md'],
    viewerPages: {
        'PROTOCOL.md': 'protocol.html',
        'ARCHITECTURE.md': 'architecture.html',
        'THE_ORANGE_PAPER.md': 'orange-paper.html',
    },
    sections,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${OUT} (${Object.keys(sections).length} sections)`);
