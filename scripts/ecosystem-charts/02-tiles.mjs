// Three plain-language tiles, one per page axis, each linking to its section.
// The figure and its line come from the model; the explainer is Research's
// tile copy, verbatim from data/glossary.json.
import { esc, median } from "../charts.mjs";

export default {
    slot: "chart-tiles",
    build: function (ctx) {
        const rows = ctx.model.rows, n = rows.length;
        const own = rows.filter(function (r) { return r.lineage.cls === "own"; }).length;
        const med = median(rows.map(function (r) { return r.assurance.pct; }));
        const top = rows.slice().sort(function (a, b) { return b.assurance.pct - a.assurance.pct; })[0];
        const counts = {};
        rows.forEach(function (r) { counts[r.accountability.label] = (counts[r.accountability.label] || 0) + 1; });
        const order = ctx.model.accountRanks.map(function (a) { return a.label; }).concat(["Not classified"]);
        const accLine = order.filter(function (l) { return counts[l]; }).map(function (l) { return counts[l] + " " + l.toLowerCase(); }).join(", ");
        const single = counts["Single maintainer"] || 0;
        const T = ctx.readJson("data/glossary.json").tiles;
        const tile = function (axis, big, line, q, href) {
            return "<a class=\"eco-tile\" href=\"" + href + "\"><span class=\"eco-tile-axis\">" + esc(axis) + "</span><span class=\"eco-tile-big\">" + esc(big) + "</span><span class=\"eco-tile-line\">" + esc(line) + "</span><span class=\"eco-tile-q\">" + esc(q) + "</span></a>";
        };
        return "<div class=\"eco-tiles\" role=\"list\">" +
            "<div role=\"listitem\">" + tile("Independence", own + " of " + n, "are their own codebase. The other " + (n - own) + " are Bitcoin Core and clients forked from it.", T.independence, "#why") + "</div>" +
            "<div role=\"listitem\">" + tile("Assurance", "median " + med + "%", "of possible points across six kinds of evidence. Top: " + top.name + ", " + top.assurance.score + " of " + top.assurance.max + ".", T.assurance, "#commons") + "</div>" +
            "<div role=\"listitem\">" + tile("Accountability", single + " of " + n, "rest on a single maintainer. In all: " + accLine + ".", T.accountability, "#institution") + "</div>" +
            "</div>";
    }
};
