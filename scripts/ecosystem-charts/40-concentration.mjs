// Concentration: the top author's (or top merger's) share for each
// implementation, from data/implementations.json governance.landing. An
// implementation without a landing row is listed as "not measured", not drawn.
import { figure, bars } from "../charts.mjs";

export default {
    slot: "chart-concentration",
    build: function (ctx) {
        const internal = ctx.data.internal_slug;
        const land = {};
        ctx.data.governance.landing.forEach(function (l) { land[l.slug] = l; });
        const rows = ctx.stack.rows.map(function (r) {
            const l = land[r.slug];
            if (!l || typeof l.share !== "number") return { slug: r.slug, label: r.name, value: null, missingText: "not measured", cls: r.slug === internal ? "hl" : "" };
            return { slug: r.slug, label: r.name, value: l.share, valueText: l.share.toFixed(1).replace(/\.0$/, "") + "% of " + l.instrument, who: l.who, span: l.span, instrument: l.instrument, cls: r.slug === internal ? "hl" : "" };
        }).sort(function (a, b) { return (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value) || (a.label < b.label ? -1 : 1); });
        const measured = rows.filter(function (r) { return r.value !== null; });
        const over75 = measured.filter(function (r) { return r.value >= 75; });
        const merges = measured.filter(function (r) { return r.instrument !== "commits"; }).map(function (r) { return r.label; });
        return figure({
            id: "fig-concentration",
            headline: "In " + over75.length + " of " + measured.length + " implementations one account wrote three quarters or more of the measured work.",
            caption: "Share of each project\u2019s landing measure held by the account its history names: commits for most rows" + (merges.length ? ", merged pull requests for " + merges.join(", ") : "") + ". Windows differ by project and are listed in the table and on the institution board below.",
            title: "Lead account\u2019s share by implementation",
            desc: rows.map(function (r) { return r.label + ": " + (r.value === null ? "not measured" : r.valueText); }).join("; ") + ".",
            chart: bars(rows, { max: 100, labelWidth: 120 }),
            notes: ["Bitcoin Roots: the bar is jaromil&rsquo;s 248 of 4,293 commits since Core v32.1. Most of that history is carried from Knots and Core (3,315 committed by luke-jr, 506 by fanquake), so it is not a measure of the patch set alone."].filter(function () { return !!land["bitcoin-roots"]; }),
            sources: [{ label: "data/implementations.json (governance.landing)" }, { label: "institution board", href: "#chart-inst" }],
            table: { caption: "Lead account's share", columns: ["Implementation", "Share", "Who", "Window"], rows: rows.map(function (r) { return [r.label, r.value === null ? "not measured" : r.valueText, r.who || "", r.span || ""]; }) }
        });
    }
};
