// Own-team module counts. The words match the Modules and plugins table.
// A name list is drawn only when plugin_names has the same length as plugin_own.
import { figure, bars } from "../charts.mjs";

function list(names) {
    if (names.length < 2) return names.join("");
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}

export default {
    slot: "chart-modules",
    build: function (ctx) {
        const rows = ctx.model.rows.map(function (r) {
            const m = r.metrics;
            if (!m || !m.plugin_system || !m.plugin_own) throw new Error("module chart: missing plugin fields for " + r.slug);
            const sys = m.plugin_system;
            const own = m.plugin_own;
            if (sys.status !== "measured" || own.status !== "measured" || typeof own.value !== "number") {
                throw new Error("module chart: plugin fields are not measured for " + r.slug);
            }
            const names = Array.isArray(m.plugin_names) ? m.plugin_names : [];
            if (names.length && names.length !== own.value) throw new Error("module chart: names for " + r.slug + " do not match the count");
            const ind = m.plugin_independent || { text: "not found" };
            return {
                slug: r.slug,
                label: r.name,
                value: own.value,
                valueText: sys.text + " · " + own.text,
                cls: r.internal ? "hl" : "",
                names: names,
                independent: ind.text || "not found"
            };
        });
        const named = rows.filter(function (r) { return r.value > 0; });
        const headline = named.map(function (r) { return r.label + " names " + r.value; }).join(". ") + ".";
        const rest = rows.length - named.length;
        return figure({
            id: "fig-modules",
            headline: headline,
            caption: "Own-team modules named by each tree, " + (ctx.metrics.as_of || "") + ". The word before the count is the module-system reading on the table below: yes, partial, or no. " + rest + " trees name none.",
            measures: "How many own-team modules each tree's docs name; it matters because a count without the same names is not a list.",
            takeaway: headline + " Independent modules are not found for any tree on this page.",
            title: "Own-team modules by implementation",
            desc: rows.map(function (r) { return r.label + " " + r.valueText; }).join(", ") + ".",
            chart: bars(rows, { max: Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1, labelWidth: 148 }),
            notes: named.filter(function (r) { return r.names.length; }).map(function (r) {
                return escNote(r.label + " names " + list(r.names) + ".");
            }),
            sources: [{ label: "data/metrics.json" }],
            table: {
                caption: "Module system, own-team modules, and the names this page lists",
                columns: ["Implementation", "Module system", "Own-team modules", "Names", "Independent modules"],
                rows: rows.map(function (r) { return [r.label, r.valueText.split(" · ")[0], String(r.value), r.names.join(", ") || "none named", r.independent]; })
            }
        });
    }
};

function escNote(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
}
