#!/usr/bin/env node
// Pre-render ecosystem.html from data/implementations.json so every count is in
// the HTML (readable without JavaScript). The inline script on the page only adds
// sorting, filtering, and deep-link handling on top.
// Fills each <!--slot:NAME-->...<!--/slot:NAME--> region in place.
// Usage: node scripts/render-ecosystem.mjs   (run after the data file changes)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "ecosystem.html");
const data = JSON.parse(fs.readFileSync(path.join(root, "data/implementations.json"), "utf8"));
const verification = JSON.parse(fs.readFileSync(path.join(root, "data/verification.json"), "utf8"));
const stack = JSON.parse(fs.readFileSync(path.join(root, "data/stack.json"), "utf8"));
const stability = JSON.parse(fs.readFileSync(path.join(root, "data/stability.json"), "utf8"));
const metrics = JSON.parse(fs.readFileSync(path.join(root, "data/metrics.json"), "utf8"));

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
    return "<p class=\"eco-scroll-hint\" aria-hidden=\"true\">Scroll sideways for every column.</p><div class=\"eco-scroll\" tabindex=\"0\" role=\"region\" aria-label=\"" + esc(caption) + "\"><table><caption>" + esc(caption) + "</caption>" + head(trees) + methods.map(function (m) {
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
slots.lead = "Bitcoin node implementations: who governs each one, how far each has got in showing it follows Bitcoin's rules, and what its code looks like. Bitcoin Core is the reference.";

// Captions (the text of the old chart sections, now the column key).
const comp = trees.map(function (tree) {
    function n(id) { var cell = metric(tree, id); return cell ? cell.value : 0; }
    var impl = n("implementation_code"), vend = n("vendored_code"), loc = n("locale_code");
    return { slug: tree.slug, name: tree.name, impl: impl, vend: vend, loc: loc, total: impl + vend + loc, internal: tree.slug === internal };
}).sort(function (a, b) { return b.total - a.total; });
const compBySlug = {}; comp.forEach(function (c) { compBySlug[c.slug] = c; });
const compMax = comp[0].total;
const blvmComp = comp.filter(function (r) { return r.internal; })[0];
// Column captions state facts only. Rankings are left to the sortable table.
slots["size-caption"] = esc("BLVM program, implementation, and test counts cover blvm-node, blvm-protocol, blvm-consensus, blvm-primitives, blvm-secp256k1, blvm-muhash, blvm-storage-fence (in the node tree), and blvm-sdk including blvm-sdk-macros. blvm-spec-lock is counted as tooling. libbitcoin is one repo: libbitcoin-system.");
slots["comp-caption"] = esc(blvmComp && blvmComp.vend === 0 && blvmComp.loc === 0 ? blvmComp.name + " has neither vendored lines nor locale lines." : "");
const halfOf = {}; trees.forEach(function (t) { var h = metric(t, "files_holding_half"); halfOf[t.slug] = h ? h.text : ""; });
slots["files-caption"] = "";
slots["test-caption"] = "";
slots["rules-asof"] = esc(data.measured_at);
slots["test-note"] = "A Rust file named *_test.rs or *_tests.rs counts as tests. Lines inside a #[cfg(test)] item count as tests.";

// Rules share: scale shared, cut order as first seen; sort groups by cut then value.
const ruleRows = trees.map(function (tree) {
    var cell = metric(tree, "rules_share");
    if (!cell || cell.status !== "measured") return null;
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
    var hasCut = rules && rules.status === "measured";
    var rulesText = hasCut ? rules.text : (rules && rules.status === "not-measured" ? "not measured" : "no cut");
    var cutIdx = hasCut ? cutOrder.indexOf(t.instrument) : cutOrder.length;
    var stack = "<span class=\"mini\" aria-hidden=\"true\"><span class=\"mini-fill seg impl" + isInt + "\" style=\"width:" + pct(c.impl, compMax) + "%\"></span><span class=\"mini-fill seg vend\" style=\"width:" + pct(c.vend, compMax) + "%\"></span><span class=\"mini-fill seg loc\" style=\"width:" + pct(c.loc, compMax) + "%\"></span></span>";
    return "<tr data-slug=\"" + esc(slug) + "\" data-order=\"" + i + "\" data-size=\"" + prog.value + "\" data-checkout=\"" + c.total + "\" data-files=\"" + big.value + "\" data-tests=\"" + test.value + "\" data-rules=\"" + (hasCut ? (cutIdx * 1000 - rules.value) : 99999) + "\">" +
        "<th scope=\"row\" class=\"cmp-name" + isInt + "\">" + esc(t.name) + "</th>" +
        "<td data-label=\"Program lines\"><span class=\"num\">" + esc(prog.text) + "</span>" + bar(prog.value, sizeScale, isInt.trim()) + "</td>" +
        "<td data-label=\"Checkout\"><span class=\"num\">" + c.total.toLocaleString("en-US") + "</span>" + stack + "</td>" +
        "<td data-label=\"Large files\"><span class=\"num\">" + esc(big.text) + "</span>" + bar(big.value, 100, isInt.trim()) + "<small>" + esc(halfOf[slug] + " files hold half") + "</small></td>" +
        "<td data-label=\"Tests\"><span class=\"num\">" + esc(test.text) + "</span>" + bar(test.value, testScale, isInt.trim()) + "</td>" +
        "<td data-label=\"Rules share\"><span class=\"num\">" + esc(rulesText) + "</span>" + (hasCut ? bar(rules.value, ruleScale, isInt.trim()) : "") + "<small>" + esc(t.instrument) + "</small></td>" +
        "</tr>";
}).join("");

// Governance and verification at a glance: one row per implementation.
const govModel = data.governance_model || { labels: [] };
const govBySlug = {}; govModel.labels.forEach(function (g) { govBySlug[g.slug] = g; });
const vCols = verification.columns || [];
const statusClass = { "yes": "st-yes", "partial": "st-partial", "not found": "st-nf", "n/a": "st-na" };
const glanceOrder = [internal].concat(["bitcoin-core", "knots-legacy", "bit-block", "bitcoin-roots", "bitcoin-rs", "satd", "libbitcoin", "hornet", "floresta", "rbitcoin", "btcd"].filter(function (s) { return s !== internal; }));
const vBySlug = {}; (verification.rows || []).forEach(function (r) { vBySlug[r.slug] = r; });
// Stability column: the checklist count, hatched while not measured.
function stabCell(slug) {
    const st = stabilityFor(slug);
    const nm = st.measured === 0;
    return "<td data-label=\"Stability\" class=\"stab" + (nm ? " stab-nm" : "") + "\"><span class=\"stab-mark\" aria-hidden=\"true\"></span>" + esc(nm ? "not measured" : st.met + " of " + st.total + " met, " + st.notMeasured + " not measured") + "</td>";
}
slots.glance = glanceOrder.map(function (slug) {
    var v = vBySlug[slug], g = govBySlug[slug];
    if (!v || !g) throw new Error("glance row missing for " + slug);
    var isInt = slug === internal;
    var cells = vCols.map(function (col) {
        var cell = v.cells[col.id];
        if (!cell || !statusClass[cell.status]) throw new Error("bad verification cell " + slug + "/" + col.id);
        return "<td data-label=\"" + esc(col.short || col.name) + "\" class=\"st " + statusClass[cell.status] + "\"><span class=\"st-mark\" aria-hidden=\"true\"></span>" + esc(cell.status) + (cell.status === "n/a" ? "<small>" + esc(cell.text || verification.statuses["n/a"]) + "</small>" : "") + "</td>";
    }).join("");
    var notes = vCols.map(function (col) {
        var cell = v.cells[col.id];
        if (!cell.text && !cell.source) return "";
        var src = cell.source ? " <a href=\"" + esc(cell.source) + "\">Source<span class=\"visually-hidden\">: " + esc(v.name + ", " + col.name) + "</span></a>" : "";
        return "<li><span class=\"eco-meta\">" + esc(col.name) + ", " + esc(cell.status) + ".</span> " + esc(cell.text || "") + (cell.text ? "." : "") + src + "</li>";
    }).join("");
    var open = "<details><summary>Sources<span class=\"visually-hidden\"> for " + esc(v.name) + "</span></summary><ul>" + notes + "</ul><p class=\"eco-meta\">" + esc(v.repo) + " at " + esc(v.commit) + ".</p></details>";
    return "<tr data-slug=\"" + esc(slug) + "\"><th scope=\"row\"" + (isInt ? " class=\"internal\"" : "") + ">" + esc(v.name) + "</th>" +
        "<td class=\"gov m-full\" data-label=\"Governance model\"><span class=\"gov-label" + (isInt ? " internal" : "") + "\">" + esc(g.label) + "</span><small>" + esc(g.detail) + "</small></td>" + cells + stabCell(slug) + "</tr>" +
        "<tr data-slug=\"" + esc(slug) + "\" class=\"eco-open-row\"><td class=\"eco-open m-full\" colspan=\"" + (vCols.length + 3) + "\">" + open + "</td></tr>";
}).join("");
slots["glance-caption"] = esc("Governance labels as of " + govModel.as_of + ". " + govModel.note + " Verification statuses as of " + verification.as_of + ". Each row's sources open under it.");
slots["verify-note"] = esc(verification.note);
slots["verify-key"] = vCols.map(function (col) {
    return "<div><dt>" + esc(col.name) + "</dt><dd>" + esc(col.what) + "</dd></div>";
}).join("") + Object.keys(verification.statuses).map(function (k) {
    return "<div><dt>" + esc(k) + "</dt><dd>" + esc(verification.statuses[k]) + ".</dd></div>";
}).join("");

// Stack and dependencies: one row per implementation, same order as the glance table.
const stackBySlug = {}; (stack.rows || []).forEach(function (r) { stackBySlug[r.slug] = r; });
function srcLink(href, label, name) {
    return href ? " <a href=\"" + esc(href) + "\">Source<span class=\"visually-hidden\">: " + esc(name + ", " + label) + "</span></a>" : "";
}
slots.stack = glanceOrder.map(function (slug) {
    var r = stackBySlug[slug];
    if (!r) throw new Error("stack row missing for " + slug);
    var isInt = slug === internal;
    var deps = r.direct_deps === null || r.direct_deps === undefined ? "not found" : String(r.direct_deps);
    var notes = "<li><span class=\"eco-meta\">License.</span> " + esc(r.license) + "." + srcLink(r.license_source, "license", r.name) + "</li>" +
        "<li><span class=\"eco-meta\">Languages.</span> " + esc(r.languages) + "." + srcLink(r.languages_source, "languages", r.name) + "</li>" +
        "<li><span class=\"eco-meta\">Direct dependencies, " + esc(deps) + ".</span> " + esc(r.deps_names) + "." + srcLink(r.deps_source, "dependencies", r.name) + "</li>" +
        "<li><span class=\"eco-meta\">Vendored.</span> " + esc(r.vendored) + "." + srcLink(r.vendored_source, "vendored code", r.name) + "</li>";
    var open = "<details><summary>Sources<span class=\"visually-hidden\"> for " + esc(r.name) + " stack</span></summary><ul>" + notes + "</ul><p class=\"eco-meta\">" + esc(r.repo) + " at " + esc(r.commit.slice(0, 10)) + ".</p></details>";
    return "<tr data-slug=\"" + esc(slug) + "\"><th scope=\"row\"" + (isInt ? " class=\"internal\"" : "") + ">" + esc(r.name) + "</th>" +
        "<td data-label=\"License\">" + esc(r.license) + "</td>" +
        "<td data-label=\"Languages\">" + esc(r.languages) + "</td>" +
        "<td data-label=\"Direct deps\">" + esc(deps) + "</td>" +
        "<td class=\"m-full\" data-label=\"Vendored\">" + esc(r.vendored) + "</td></tr>" +
        "<tr data-slug=\"" + esc(slug) + "\" class=\"eco-open-row\"><td class=\"eco-open m-full\" colspan=\"5\">" + open + "</td></tr>";
}).join("");
slots["stack-note"] = esc(stack.method);

slots["rule-test"] = esc(scan.rule_test || "");
slots.jurisdiction = esc(scan.jurisdiction || "");

// Institution board: as before, one row per tree plus its record.
const landingOrder = ["bitcoin-core", "knots-legacy", "bit-block", "bitcoin-roots", "bitcoin-rs", "satd", "blvm", "libbitcoin", "hornet", "floresta", "rbitcoin", "btcd"];
const board = {
    "bitcoin-core": { operating: "Informal oligarchy", rule: "Norm. No written sanction.", href: "https://secsovereign.github.io/articles/bitcoin-has-governance/", link: "The long article" },
    "knots-legacy": { operating: "One maintainer", rule: "Core's contributing template, renamed." },
    "bit-block": { operating: "One maintainer", rule: "Core's contributing template, renamed." },
    "bitcoin-roots": { operating: "Foundation, one signing key", rule: "Written: every new commit is signed with one key." },
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

const blvmLand = bySlug[internal];
const written = data.written_rule;
slots["inst-lead"] = esc((blvmLand ? blvmLand.name + ": " + blvmLand.who + ". " : "") + (written ? "The written rule is " + written.text + ". " : "") + (gov.status || ""));
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

const metricRows = metrics.rows || [];
const metricBySlug = {};
metricRows.forEach(function (r) { metricBySlug[r.slug] = r; });
function metricCell(row, id) {
    var c = row && row[id];
    if (!c) return { text: "not measured", status: "not-measured", value: null };
    return c;
}
function metricText(c) { return c && c.text ? c.text : "not measured"; }
function metricVal(c, rankMap) {
    if (!c || c.status !== "measured" || c.value === null || c.value === undefined) return "";
    if (rankMap) return rankMap[c.value] !== undefined ? String(rankMap[c.value]) : "";
    if (typeof c.value === "number") return String(c.value);
    return "";
}
const pluginRank = { yes: 2, partial: 1, no: 0 };
function pluginRow(slug) {
    var r = metricBySlug[slug];
    if (!r) throw new Error("metrics row missing for " + slug);
    var sys = metricCell(r, "plugin_system");
    var own = metricCell(r, "plugin_own");
    var ind = metricCell(r, "plugin_independent");
    var isInt = slug === internal;
    var open = "<details><summary>Source<span class=\"visually-hidden\"> for " + esc(r.name) + " modules</span></summary><p>" + esc(r.plugin_source || "") + "</p></details>";
    return "<tr data-slug=\"" + esc(slug) + "\" data-system=\"" + metricVal(sys, pluginRank) + "\" data-own=\"" + metricVal(own) + "\" data-independent=\"" + metricVal(ind) + "\"><th scope=\"row\"" + (isInt ? " class=\"internal\"" : "") + ">" + esc(r.name) + "</th>" +
        "<td data-label=\"Module system\">" + esc(metricText(sys)) + "</td>" +
        "<td data-label=\"Own-team modules\">" + esc(metricText(own)) + "</td>" +
        "<td data-label=\"Independent modules\">" + esc(metricText(ind)) + "</td></tr>" +
        "<tr data-slug=\"" + esc(slug) + "\" class=\"eco-open-row\"><td class=\"eco-open m-full\" colspan=\"4\">" + open + "</td></tr>";
}
slots.plugins = glanceOrder.map(pluginRow).join("");
slots["plugins-caption"] = esc("Module or plugin system, own-team optional modules, and independently maintained modules. Statuses as of " + (metrics.as_of || data.measured_at) + ". Each row's source opens under it.");
slots["plugins-note"] = esc(metrics.methods && metrics.methods.plugin_system ? metrics.methods.plugin_system : "");

const depthCols = [
    { id: "fuzz_targets", key: "fuzz", label: "Fuzz targets" },
    { id: "test_unit", key: "unit", label: "Unit test lines" },
    { id: "test_integration", key: "integration", label: "Integration test lines" },
    { id: "test_fuzz", key: "fuzzlines", label: "Fuzz test lines" },
    { id: "test_property", key: "property", label: "Property test lines" },
    { id: "vector_files", key: "vectors", label: "Test-vector files" },
    { id: "spec_files", key: "specs", label: "Spec files" },
    { id: "authors_12m", key: "authors", label: "Authors, 12 months" },
    { id: "releases_12m", key: "releases", label: "Tagged releases, 12 months" },
    { id: "ci_workflows", key: "workflows", label: "CI workflows" },
    { id: "ci_jobs", key: "jobs", label: "CI jobs" }
];
function depthRow(slug) {
    var r = metricBySlug[slug];
    if (!r) throw new Error("metrics row missing for " + slug);
    var isInt = slug === internal;
    var dataAttrs = depthCols.map(function (col) {
        return "data-" + col.key + "=\"" + metricVal(metricCell(r, col.id)) + "\"";
    }).join(" ");
    var tds = depthCols.map(function (col) {
        return "<td data-label=\"" + esc(col.label) + "\">" + esc(metricText(metricCell(r, col.id))) + "</td>";
    }).join("");
    var notes = depthCols.map(function (col) {
        var c = metricCell(r, col.id);
        if (!c.note) return "";
        return "<li><span class=\"eco-meta\">" + esc(col.label) + ".</span> " + esc(c.note) + "</li>";
    }).filter(Boolean).join("");
    var open = notes ? "<details><summary>Notes<span class=\"visually-hidden\"> for " + esc(r.name) + " depth stats</span></summary><ul>" + notes + "</ul></details>" : "";
    return "<tr data-slug=\"" + esc(slug) + "\" " + dataAttrs + "><th scope=\"row\"" + (isInt ? " class=\"internal\"" : "") + ">" + esc(r.name) + "</th>" + tds + "</tr>" +
        (open ? "<tr data-slug=\"" + esc(slug) + "\" class=\"eco-open-row\"><td class=\"eco-open m-full\" colspan=\"" + (depthCols.length + 1) + "\">" + open + "</td></tr>" : "");
}
slots.depth = glanceOrder.map(depthRow).join("");
slots["depth-caption"] = esc("Fuzz targets, test-line split, test-vector and spec file counts, unique commit authors and tagged releases in the 12 months from " + (metrics.window_start || "2025-11-12") + " to " + (metrics.window_end || "2026-11-12") + ", and GitHub Actions workflow and job counts. Measured " + (metrics.as_of || data.measured_at) + ". Sort buttons need JavaScript; the figures are in the table without it.");
slots["depth-note"] = Object.keys(metrics.methods || {}).filter(function (k) { return k !== "plugin_system" && k !== "blvm_size"; }).map(function (k) {
    return "<li>" + esc(k) + ". " + esc(metrics.methods[k]) + "</li>";
}).join("");

slots.omitted = esc(data.omitted || "");

// Summary charts: one definition file per chart in scripts/ecosystem-charts/,
// each exporting { slot, build(ctx) }. Removing a file drops its chart; its
// slot then renders empty.
const chartDir = path.join(root, "scripts/ecosystem-charts");
// The three page axes, computed once from the data files so every chart and
// card reads the same classification.
//   Independence: Core, a fork of Core or Knots (stated in governance.history),
//     or its own codebase (no derivation stated).
//   Assurance: the six verification checks, yes = 2, partial = 1,
//     not found = 0; n/a is left out of both score and maximum.
//   Accountability: governance_model labels, ranked single maintainer (1),
//     maintainer group (2), foundation key (3), written rules (4).
// PENDING lists metrics a separate PR is correcting; charts mark them
// "pending fix" and never draw their values as final.
const PENDING = {
    fuzz_targets: "fuzz target counts", authors_12m: "authors in 12 months", ci_workflows: "CI workflows",
    ci_jobs: "CI jobs", rules_share: "rules share"
};
const POINTS = { "yes": 2, "partial": 1, "not found": 0 };
const FORKS = {
    "knots-legacy": "Knots Legacy continues Bitcoin Knots",
    "bit-block": "Bit-Block is a fork of Bitcoin Knots",
    "bitcoin-roots": "Bitcoin Roots is a patch series on Bitcoin Core"
};
const ACCOUNT = [
    { rank: 1, match: "Single maintainer", label: "Single maintainer" },
    { rank: 2, match: "Maintainer group", label: "Maintainer group" },
    { rank: 3, match: "Foundation, one signing key", label: "Foundation key" },
    { rank: 4, match: "Commons governance", label: "Written rules" }
];
// Stability: a checklist written by Research and scored by the metrics
// script. A criterion a row does not carry is not measured. Met and not met
// need an evidence link; anything else fails the render.
function stabilityFor(slug) {
    const STAB_STATUS = { met: 1, not_met: 1, not_measured: 1 };
    const def = stability.definition || [];
    const row = (stability.rows || {})[slug];
    if (!row) throw new Error("stability: no row for " + slug);
    Object.keys(row.criteria || {}).forEach(function (k) {
        if (!def.some(function (c) { return c.id === k; })) throw new Error("stability: " + slug + " has unknown criterion " + k);
    });
    const all = def.map(function (c) {
        const v = (row.criteria || {})[c.id] || { status: "not_measured" };
        if (c.type === "tag") {
            // Descriptive, not scored: a short tag with evidence, or not measured.
            if (v.status !== "not_measured" && !(v.tag && /^https:\/\//.test(v.evidence_url || ""))) throw new Error("stability: tag " + slug + "/" + c.id + " needs tag and evidence_url");
            return { id: c.id, label: c.label, why: c.why, type: "tag", status: v.status === "not_measured" ? "not_measured" : "tag", tag: v.tag || null, evidence_url: v.evidence_url || null };
        }
        if (!STAB_STATUS[v.status]) throw new Error("stability: bad status " + slug + "/" + c.id);
        if (v.status !== "not_measured" && !/^https:\/\//.test(v.evidence_url || "")) throw new Error("stability: " + slug + "/" + c.id + " needs an evidence_url");
        return { id: c.id, label: c.label, why: c.why, type: "check", status: v.status, evidence_url: v.evidence_url || null };
    });
    const cells = all.filter(function (c) { return c.type === "check"; });
    const tags = all.filter(function (c) { return c.type === "tag"; });
    const met = cells.filter(function (c) { return c.status === "met"; }).length;
    const nm = cells.filter(function (c) { return c.status === "not_measured"; }).length;
    const measured = cells.length - nm;
    const text = cells.length ? met + " of " + cells.length + " met, " + nm + " not measured" : "not measured: the checklist is not written yet";
    return { cells: cells, tags: tags, met: met, measured: measured, notMeasured: nm, total: cells.length, text: text };
}

function buildModel() {
    const hist = {}, gov = {}, ver = {}, trees = {}, met = {};
    data.governance.history.forEach(function (h) { hist[h.slug] = h.text; });
    data.governance_model.labels.forEach(function (l) { gov[l.slug] = l; });
    verification.rows.forEach(function (r) { ver[r.slug] = r; });
    data.trees.forEach(function (t) { trees[t.slug] = t; });
    metricRows.forEach(function (r) { met[r.slug] = r; });
    const rows = stack.rows.map(function (r) {
        let lineage;
        if (r.slug === "bitcoin-core") lineage = { cls: "core", label: "Bitcoin Core", text: "The reference implementation." };
        else if (FORKS[r.slug]) {
            if ((hist[r.slug] || "").indexOf(FORKS[r.slug]) < 0) throw new Error("model: history no longer states " + FORKS[r.slug]);
            lineage = { cls: "fork", label: "Core lineage", text: FORKS[r.slug] + "." };
        } else lineage = { cls: "own", label: "Own codebase", text: "No derivation from Core or Knots is stated in the data." };
        const g = gov[r.slug];
        const acc = ACCOUNT.filter(function (a) { return g && g.label.indexOf(a.match) === 0; })[0];
        const v = ver[r.slug];
        if (!v) throw new Error("model: no verification row for " + r.slug);
        const cells = verification.columns.map(function (c) {
            const cell = v.cells[c.id];
            const pts = cell.status in POINTS ? POINTS[cell.status] : null;
            if (pts === null && cell.status !== "n/a") throw new Error("model: unknown status " + cell.status);
            return { id: c.id, name: c.name, short: c.short, what: c.what, status: cell.status, points: pts, text: cell.text, source: cell.source };
        });
        const scored = cells.filter(function (c) { return c.points !== null; });
        const score = scored.reduce(function (a, c) { return a + c.points; }, 0), max = 2 * scored.length;
        const t = trees[r.slug];
        return {
            slug: r.slug, name: r.name, internal: r.slug === data.internal_slug,
            lineage: lineage,
            accountability: acc ? { rank: acc.rank, label: acc.label, full: g.label, detail: g.detail } : { rank: null, label: "Not classified", full: g ? g.label : "Not classified", detail: g ? g.detail : "" },
            assurance: { cells: cells, score: score, max: max, pct: Math.round(100 * score / max) },
            size: t ? t.values.implementation_code : { value: null, text: "not measured", status: "not-measured" },
            shallow: t ? !!t.shallow : null,
            deps: { value: r.direct_deps, text: String(r.direct_deps) },
            stack: r, metrics: met[r.slug] || null,
            stability: stabilityFor(r.slug)
        };
    });
    const extra = Object.keys(stability.rows).filter(function (k) { return !rows.some(function (r) { return r.slug === k; }); }).map(function (k) {
        const x = stability.rows[k];
        if (x.on_page !== false) throw new Error("stability: row " + k + " has no implementation on the page; mark it on_page false");
        return { slug: k, name: x.name, note: x.note, stability: stabilityFor(k) };
    });
    return { rows: rows, pending: PENDING, points: POINTS, accountRanks: ACCOUNT, stability: { note: stability.note, rule: stability.score_rule, definition: stability.definition, status: stability.status, extra: extra } };
}
const chartCtx = { root: root, data: data, verification: verification, stack: stack, metrics: metrics, stability: stability, model: buildModel(), readJson: function (rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } };
for (const file of fs.existsSync(chartDir) ? fs.readdirSync(chartDir).filter(function (f) { return f.endsWith(".mjs"); }).sort() : []) {
    const def = (await import(pathToFileURL(path.join(chartDir, file)).href)).default;
    if (slots[def.slot] !== undefined) throw new Error("two charts fill slot " + def.slot);
    slots[def.slot] = def.build(chartCtx);
}

let html = fs.readFileSync(pagePath, "utf8");
const seen = new Set();
html = html.replace(/<!--slot:([a-z-]+)-->[\s\S]*?<!--\/slot:\1-->/g, function (all, name) {
    if (!(name in slots) && name.indexOf("chart-") === 0) slots[name] = "";
    if (!(name in slots)) throw new Error("no renderer for slot " + name);
    seen.add(name);
    return "<!--slot:" + name + "-->" + slots[name] + "<!--/slot:" + name + "-->";
});
const missing = Object.keys(slots).filter(function (k) { return !seen.has(k); });
if (missing.length) throw new Error("slots missing from ecosystem.html: " + missing.join(", "));
// Cell guard: no table cell may be empty or a bare dash (a missing value is
// "not measured"), and a bare "n/a" must say why in a title.
(function () {
    const bad = [];
    html.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/g, function (all, attrs, inner) {
        const text = inner.replace(/<details[\s\S]*?<\/details>/g, " x ").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
        const line = html.slice(0, html.indexOf(all)).split("\n").length;
        if (!text) bad.push("empty cell at line " + line);
        else if (/^[\u2014\u2013\u2212-]+$/.test(text) || /^&mdash;$|^&ndash;$/.test(text)) bad.push("dash cell at line " + line);
        else if (/^n\/a\.?$/i.test(text) && !/\btitle="[^"]+"/.test(attrs)) bad.push("n/a without a reason at line " + line);
        return all;
    });
    if (bad.length) throw new Error("table cells: " + bad.slice(0, 10).join("; ") + (bad.length > 10 ? "; and " + (bad.length - 10) + " more" : ""));
})();
fs.writeFileSync(pagePath, html);
console.log("ecosystem.html rendered from data measured " + data.measured_at);
