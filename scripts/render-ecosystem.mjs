#!/usr/bin/env node
// Pre-render ecosystem.html from data/implementations.json so every count is in
// the HTML (readable without JavaScript). The inline script on the page only adds
// sorting, filtering, and deep-link handling on top.
// Fills each <!--slot:NAME-->...<!--/slot:NAME--> region in place.
// Usage: node scripts/render-ecosystem.mjs   (run after the data file changes)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "ecosystem.html");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/implementations.json"), "utf8"));

function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
}
function englishList(names) {
    if (names.length < 2) return names.join("");
    if (names.length === 2) return names[0] + " or " + names[1];
    return names.slice(0, -1).join(", ") + ", or " + names[names.length - 1];
}
function metric(tree, id) { return tree.values && tree.values[id] ? tree.values[id] : null; }
function shareText(n) {
    var rounded = Math.round(n * 10) / 10;
    var text = rounded.toFixed(1);
    return (text.slice(-2) === ".0" ? String(Math.round(rounded)) : text) + "%";
}
function pct(v, scale) { return Math.max(0, Math.min(100, scale ? (v / scale) * 100 : 0)).toFixed(1); }

// Weekly-count tables: unchanged from the previous page.
function head(trees) {
    return "<tr><th scope=\"col\">Method</th>" + trees.map(function (t) {
        var pin = t.commit ? t.commit.slice(0, 9) : "";
        var shallow = t.shallow ? ", shallow" : "";
        var pinHtml = pin ? "<br><span class=\"eco-pin\">" + esc(pin + shallow) + "</span>" : "";
        return "<th scope=\"col\">" + esc(t.name) + "<small>" + esc(t.instrument) + pinHtml + "</small></th>";
    }).join("") + "</tr>";
}
function row(label, trees, textFor) {
    return "<tr><th scope=\"row\">" + esc(label) + "</th>" + trees.map(function (t) {
        var cls = t.side === "internal" ? " class=\"internal\"" : "";
        return "<td" + cls + ">" + esc(textFor(t)) + "</td>";
    }).join("") + "</tr>";
}
function cellText(tree, method) {
    var cell = tree.values && tree.values[method.id];
    return cell ? cell.text : "not measured";
}
function byInstrument(trees) {
    var order = [], map = {};
    trees.forEach(function (t) {
        var key = t.instrument || "unspecified";
        if (!map[key]) { map[key] = []; order.push(key); }
        map[key].push(t);
    });
    return order.map(function (key) { return { name: key, trees: map[key] }; });
}
function wideTable(trees, methods, caption) {
    return "<div class=\"eco-scroll\" tabindex=\"0\" role=\"region\" aria-label=\"" + esc(caption) + "\"><table><caption>" + esc(caption) + "</caption>" + head(trees) + methods.map(function (m) {
        return row(m.name, trees, function (t) { return cellText(t, m); });
    }).join("") + "</table></div>";
}
function notes(methods) {
    return "<details class=\"eco-notes\"><summary>What these rows count</summary><ul>" + methods.map(function (m) {
        return "<li>" + esc(m.name) + ". " + esc(m.why) + "</li>";
    }).join("") + "</ul></details>";
}

const slots = {};
const trees = data.trees || [];
const methods = data.tree_methods || [];
const internal = data.internal_slug;
const scan = data.scan || {};
const gov = data.governance || {};

function ranked(id) {
    return trees.map(function (tree) {
        var cell = metric(tree, id);
        return cell ? { name: tree.name, value: cell.value, text: cell.text, internal: tree.slug === internal, slug: tree.slug } : null;
    }).filter(Boolean).sort(function (a, b) { return b.value - a.value; });
}
const sizeRows = ranked("program_code");
const testRows = ranked("test_per_implementation");
const fileRows = ranked("share_lines_ge_1000");

slots.status = "Measured " + esc(data.measured_at) + ".";
slots.lead = esc(sizeRows[0].name + " has the largest program, at " + sizeRows[0].text + " lines. Implementation minus tooling.");

// Captions (the text of the old chart sections, now the column key).
const comp = trees.map(function (tree) {
    function n(id) { var cell = metric(tree, id); return cell ? cell.value : 0; }
    var impl = n("implementation_code"), vend = n("vendored_code"), loc = n("locale_code");
    return { slug: tree.slug, name: tree.name, impl: impl, vend: vend, loc: loc, total: impl + vend + loc, internal: tree.slug === internal };
}).sort(function (a, b) { return b.total - a.total; });
const compBySlug = {}; comp.forEach(function (c) { compBySlug[c.slug] = c; });
const compMax = comp[0].total;
const commonsComp = comp.filter(function (r) { return r.internal; })[0];
slots["size-caption"] = esc(sizeRows[0].name + " is the largest program, at " + sizeRows[0].text + " lines. Implementation minus tooling. " + sizeRows[sizeRows.length - 1].name + " is the smallest, at " + sizeRows[sizeRows.length - 1].text + ".");
slots["comp-caption"] = esc(comp[0].name + " is the largest checkout once vendored libraries and locale files are counted, at " + comp[0].total.toLocaleString("en-US") + " lines. " + (commonsComp && commonsComp.vend === 0 && commonsComp.loc === 0 ? "commons has neither vendored lines nor locale lines." : ""));
const halfOf = {}; trees.forEach(function (t) { var h = metric(t, "files_holding_half"); halfOf[t.slug] = h ? h.text : ""; });
const commonsFiles = fileRows.filter(function (r) { return r.internal; })[0];
const spread = fileRows.slice().sort(function (a, b) { return parseInt(halfOf[b.slug] || 0, 10) - parseInt(halfOf[a.slug] || 0, 10); })[0];
slots["files-caption"] = esc((commonsFiles ? commonsFiles.name + " keeps " + commonsFiles.text + " of its program in files of 1,000 lines or more, and half of that program sits in " + halfOf[commonsFiles.slug] + " files." : "") + (spread ? " " + spread.name + " spreads half of its program over " + halfOf[spread.slug] + " files." : ""));
slots["test-caption"] = esc(testRows[0].name + " has " + testRows[0].text + " test lines for each implementation line. " + testRows[testRows.length - 1].name + " has " + testRows[testRows.length - 1].text + ".");
slots["test-note"] = "A Rust file named *_test.rs or *_tests.rs counts as tests. Lines inside a #[cfg(test)] item count as tests.";

// Rules share: scale shared, cut order as first seen; sort groups by cut then value.
const ruleRows = trees.map(function (tree) {
    var cell = metric(tree, "rules_share");
    if (!cell || cell.text === "no cut") return null;
    return { slug: tree.slug, value: cell.value, instrument: tree.instrument };
}).filter(Boolean);
const ruleScale = Math.max.apply(null, ruleRows.map(function (r) { return r.value; }));
const cutOrder = [];
ruleRows.forEach(function (r) { if (cutOrder.indexOf(r.instrument) < 0) cutOrder.push(r.instrument); });

// One comparison table: one row per measured tree, every chart as a column.
const sizeScale = sizeRows[0].value, testScale = testRows[0].value;
const defaultOrder = sizeRows.map(function (r) { return r.slug; });
const treeBySlug = {}; trees.forEach(function (t) { treeBySlug[t.slug] = t; });
function bar(v, scale, cls) {
    return "<span class=\"mini\" aria-hidden=\"true\"><span class=\"mini-fill" + (cls ? " " + cls : "") + "\" style=\"width:" + pct(v, scale) + "%\"></span></span>";
}
slots.compare = defaultOrder.map(function (slug, i) {
    var t = treeBySlug[slug];
    var isInt = slug === internal ? " internal" : "";
    var prog = metric(t, "program_code"), test = metric(t, "test_per_implementation"), big = metric(t, "share_lines_ge_1000"), rules = metric(t, "rules_share");
    var c = compBySlug[slug];
    var hasCut = rules && rules.text !== "no cut";
    var cutIdx = hasCut ? cutOrder.indexOf(t.instrument) : cutOrder.length;
    var stack = "<span class=\"mini\" aria-hidden=\"true\"><span class=\"mini-fill seg impl" + isInt + "\" style=\"width:" + pct(c.impl, compMax) + "%\"></span><span class=\"mini-fill seg vend\" style=\"width:" + pct(c.vend, compMax) + "%\"></span><span class=\"mini-fill seg loc\" style=\"width:" + pct(c.loc, compMax) + "%\"></span></span>";
    return "<tr data-slug=\"" + esc(slug) + "\" data-order=\"" + i + "\" data-size=\"" + prog.value + "\" data-checkout=\"" + c.total + "\" data-files=\"" + big.value + "\" data-tests=\"" + test.value + "\" data-rules=\"" + (hasCut ? (cutIdx * 1000 - rules.value) : 99999) + "\">" +
        "<th scope=\"row\" class=\"cmp-name" + isInt + "\">" + esc(t.name) + "</th>" +
        "<td data-label=\"Program lines\"><span class=\"num\">" + esc(prog.text) + "</span>" + bar(prog.value, sizeScale, isInt.trim()) + "</td>" +
        "<td data-label=\"Checkout\"><span class=\"num\">" + c.total.toLocaleString("en-US") + "</span>" + stack + "</td>" +
        "<td data-label=\"Large files\"><span class=\"num\">" + esc(big.text) + "</span>" + bar(big.value, 100, isInt.trim()) + "<small>" + esc(halfOf[slug] + " files hold half") + "</small></td>" +
        "<td data-label=\"Tests\"><span class=\"num\">" + esc(test.text) + "</span>" + bar(test.value, testScale, isInt.trim()) + "</td>" +
        "<td data-label=\"Rules share\"><span class=\"num\">" + esc(hasCut ? rules.text : "no cut") + "</span>" + (hasCut ? bar(rules.value, ruleScale, isInt.trim()) : "") + "<small>" + esc(t.instrument) + "</small></td>" +
        "</tr>";
}).join("");

slots["rule-test"] = esc(scan.rule_test || "");
slots.jurisdiction = esc(scan.jurisdiction || "");

// Institution board: as before, one row per tree plus its record.
const landingOrder = ["bitcoin-core", "knots", "bitcoin-rs", "satd", "blvm", "libbitcoin", "hornet", "floresta", "rbitcoin", "btcd"];
const board = {
    "bitcoin-core": { operating: "Informal oligarchy", rule: "Norm. No written sanction.", href: "https://secsovereign.github.io/articles/bitcoin-has-governance/", link: "The long article" },
    "knots": { operating: "One maintainer and a merge script", rule: "The contributing file is Core's." },
    "bitcoin-rs": { operating: "One account", rule: "Not read as a consequence." },
    "satd": { operating: "One account", rule: "Not read." },
    "blvm": { operating: "One writer. The written rule is separate.", rule: "Designed, not running.", href: "compact.html", link: "The written rules" },
    "libbitcoin": { operating: "One maintainer", rule: "Not read as a consequence." },
    "hornet": { operating: "One account", rule: "No contributing file." },
    "floresta": { operating: "Largest share under half", rule: "Not read. Landing only." },
    "rbitcoin": { operating: "Largest share under half", rule: "Not read. Landing only." },
    "btcd": { operating: "Largest share under half", rule: "Not read. Landing only." }
};
const bySlug = {}; (gov.landing || []).forEach(function (r) { bySlug[r.slug] = r; });
const historyByName = {}; (gov.history || []).forEach(function (item) { historyByName[item.name] = item; });
function categoryBits(name) {
    var bits = [];
    (scan.categories || []).forEach(function (cat) {
        (cat.items || []).forEach(function (item) {
            if (item.name === name) bits.push("<p><span class=\"eco-meta\">" + esc(cat.title) + "</span><br>" + esc(item.text) + "</p>");
        });
    });
    return bits.join("");
}
function recordedProcess(slug) {
    return (data.process_methods || []).filter(function (m) {
        return (m.cells || []).some(function (cell) { return cell.slug === slug && cell.status === "recorded"; });
    }).map(function (m) {
        var cell = m.cells.filter(function (item) { return item.slug === slug; })[0];
        return "<li>" + esc(m.name) + ". " + esc(cell.text) + ". " + esc(m.window) + ".</li>";
    }).join("");
}
slots.institution = landingOrder.map(function (slug) {
    var r = bySlug[slug];
    var fact = board[slug] || { operating: "Not classified", rule: "Not read." };
    if (!r) return "";
    var lands = r.instrument === "merges" ? shareText(r.share) + " of merges since 2022. " + r.who : shareText(r.share) + " of commits. " + r.who;
    // The span repeats the tail of "who" for some rows; print it once.
    var span = r.span && r.who.slice(-r.span.length) !== r.span ? r.span : "";
    var past = historyByName[r.name];
    var proc = recordedProcess(slug);
    var link = fact.href ? "<p><a href=\"" + esc(fact.href) + "\">" + esc(fact.link) + "</a></p>" : "";
    var measured = treeBySlug[slug] ? "" : " <span class=\"tag\">landing only</span>";
    var open = "<details><summary>The record<span class=\"visually-hidden\"> for " + esc(r.name) + "</span></summary>" + (past ? "<p>" + esc(past.text) + "</p><p class=\"eco-meta\">" + esc(past.basis) + "</p>" : "") + categoryBits(r.name) + (proc ? "<ul>" + proc + "</ul>" : "") + link + "</details>";
    var nameCell = "<th scope=\"row\"" + (r.slug === internal ? " class=\"internal\"" : "") + ">" + esc(r.name) + measured + "</th>";
    return "<tr data-slug=\"" + esc(slug) + "\">" + nameCell + "<td data-label=\"Operating record\">" + esc(fact.operating) + "</td><td class=\"m-full\" data-label=\"Who lands the work\">" + esc(lands) + (span ? "<br><span class=\"eco-meta\">" + esc(span) + "</span>" : "") + "</td><td data-label=\"Written rule\">" + esc(fact.rule) + "</td></tr><tr data-slug=\"" + esc(slug) + "\" class=\"eco-open-row\"><td class=\"eco-open m-full\" colspan=\"4\">" + open + "</td></tr>";
}).join("");

const commonsLand = bySlug[internal];
const written = data.written_rule;
slots["inst-lead"] = esc((commonsLand ? commonsLand.who + ". " : "") + (written ? "The written rule is " + written.text + ". " : "") + (gov.status || ""));
slots["gov-quorum"] = esc(gov.quorum || "");
slots["layer-note"] = esc(gov.layer_note || "");
slots.layers = (gov.layers || []).map(function (layer) {
    var review = layer.review_period_days + "-day review";
    if (layer.consensus_review_period_days) review += ", " + layer.consensus_review_period_days + "-day consensus review";
    return "<tr><th scope=\"row\">" + esc((layer.repositories || []).join(", ")) + "</th><td data-label=\"Signatures\">" + esc(layer.signatures_required + " of " + layer.signatures_total) + ".</td><td data-label=\"Review\">" + esc(review) + ".</td><td class=\"m-full\" data-label=\"Layer\">" + esc(layer.name) + ". " + esc(layer.purpose || "") + "</td></tr>";
}).join("");
slots["history-note"] = esc(gov.history_note || "");

const sizeMethods = methods.filter(function (m) { return m.compare === "same-counter"; });
const cutMethods = methods.filter(function (m) { return m.compare === "same-profile"; });
slots["weekly-size"] = wideTable(trees, sizeMethods, "One counter on every tree. A line count, a ratio, and a file count are different rows.") + notes(sizeMethods);
slots["weekly-cuts"] = byInstrument(trees).map(function (g) {
    var shallow = g.trees.filter(function (t) { return t.shallow; }).map(function (t) { return t.name; });
    var shallowNote = shallow.length ? "<p>" + esc(englishList(shallow)) + (shallow.length === 1 ? " is a shallow checkout. The line counter still reads the files present." : " are shallow checkouts. The line counter still reads the files present.") + "</p>" : "";
    return "<section><h3>" + esc(g.name) + "</h3>" + shallowNote + wideTable(g.trees, cutMethods, "Rows in " + g.name + " only.") + "</section>";
}).join("") + notes(cutMethods);
slots.omitted = esc(data.omitted || "");

let html = fs.readFileSync(pagePath, "utf8");
const seen = new Set();
html = html.replace(/<!--slot:([a-z-]+)-->[\s\S]*?<!--\/slot:\1-->/g, function (all, name) {
    if (!(name in slots)) throw new Error("no renderer for slot " + name);
    seen.add(name);
    return "<!--slot:" + name + "-->" + slots[name] + "<!--/slot:" + name + "-->";
});
const missing = Object.keys(slots).filter(function (k) { return !seen.has(k); });
if (missing.length) throw new Error("slots missing from ecosystem.html: " + missing.join(", "));
fs.writeFileSync(pagePath, html);
console.log("ecosystem.html rendered from data measured " + data.measured_at);
