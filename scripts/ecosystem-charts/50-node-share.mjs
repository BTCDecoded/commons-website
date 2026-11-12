// One lineage: reachable-node share by advertised client, from
// data/node-share.json (the figures the Why section quotes, with its sources).
// The render fails if the page's sentence and the data file disagree.
import fs from "node:fs";
import path from "node:path";
import { figure, stacked } from "../charts.mjs";

export default {
    slot: "chart-node-share",
    build: function (ctx) {
        const d = ctx.readJson("data/node-share.json");
        const page = fs.readFileSync(path.join(ctx.root, "ecosystem.html"), "utf8");
        const byId = {};
        d.rows.forEach(function (r) { byId[r.id] = r; });
        const sentence = "about " + byId.core.share + "% of reachable nodes advertised Bitcoin Core and about " + byId.knots.share + "% advertised Bitcoin Knots";
        if (page.indexOf(sentence) < 0) throw new Error("node-share chart: Why section no longer says: " + sentence);
        const sum = d.rows.reduce(function (s, r) { return s + r.share; }, 0);
        if (Math.abs(sum - 100) > 0.001) throw new Error("node-share chart: rows sum to " + sum);
        const cls = { core: "a", knots: "b", other: "muted" };
        const lineage = byId.core.share + byId.knots.share;
        return figure({
            id: "fig-node-share",
            headline: "Bitcoin Core and the Knots family together account for about " + lineage + "% of reachable nodes.",
            caption: "Reachable nodes by advertised client, " + d.as_of + ". The Knots family is one user-agent count that mixes releases from before and after the split.",
            measures: "Which client software reachable nodes advertise; it matters because one bug in a client most nodes run can reach most of the network.",
            takeaway: "Almost every reachable node runs Bitcoin Core or Bitcoin Knots, which shares Core's code.",
            title: "Reachable nodes by client, " + d.as_of,
            desc: d.rows.map(function (r) { return r.label + " " + r.text; }).join(", ") + ".",
            chart: stacked(d.rows.map(function (r) { return { label: r.label, value: r.share, valueText: r.text, cls: cls[r.id] || "a" }; }), { total: 100 }),
            notes: ["&ldquo;Other&rdquo; is the remainder of 100% (" + byId.other.derived + "); neither crawler publishes it as a figure."],
            sources: d.sources.concat([{ label: "data/node-share.json" }]),
            table: { caption: "Reachable nodes by client, " + d.as_of, columns: ["Client", "Share", "Basis"], rows: d.rows.map(function (r) { return [r.label, r.text, r.derived ? "remainder: " + r.derived : d.sources.map(function (s) { return s.label; }).join(", ")]; }) }
        });
    }
};
