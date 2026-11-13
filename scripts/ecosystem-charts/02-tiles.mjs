// Three tiles, one per page axis. The number and the line come from the model.
// The axis definitions stay in the glossary.
import { esc, median } from "../charts.mjs";

export default {
    slot: "chart-tiles",
    build: function (ctx) {
        const rows = ctx.model.rows, n = rows.length;
        const own = rows.filter(function (r) { return r.lineage.cls === "own"; }).length;
        const med = median(rows.map(function (r) { return r.assurance.pct; }));
        const counts = {};
        rows.forEach(function (r) { counts[r.accountability.label] = (counts[r.accountability.label] || 0) + 1; });
        const order = ctx.model.accountRanks.map(function (a) { return a.label; }).concat(["Not classified"]);
        const accLine = order.filter(function (l) { return counts[l]; }).map(function (l) { return counts[l] + " " + l.toLowerCase(); }).join(", ");
        const single = counts["Single maintainer"] || 0;
        const tile = function (axis, big, line, href) {
            return "<a class=\"eco-tile\" href=\"" + href + "\"><span class=\"eco-tile-axis\">" + esc(axis) + "</span><span class=\"eco-tile-big\">" + esc(big) + "</span><span class=\"eco-tile-line\">" + esc(line) + "</span></a>";
        };
        return "<div class=\"eco-tiles\" role=\"list\">" +
            "<div role=\"listitem\">" + tile("Independence", own + " of " + n, "are their own codebase.", "#why") + "</div>" +
            "<div role=\"listitem\">" + tile("Assurance", "median " + med + "%", "of possible points across six kinds of evidence.", "#commons") + "</div>" +
            "<div role=\"listitem\">" + tile("Accountability", single + " of " + n, "rest on a single maintainer. In all: " + accLine + ".", "#institution") + "</div>" +
            "</div>";
    }
};
