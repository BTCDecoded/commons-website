// Module ecosystem map: BLVM's module registry next to what every other
// implementation offers for add-on code. Modules: registry/modules.json in
// the blvm repository (pinned), copied to data/blvm-structure.json with a
// short capability label beside the registry's own description. Other
// implementations: data/blvm-structure.json plugin_support, each class with
// its source; "not found" means a search of README, docs and tree found none.
import { figure, layered } from "../charts.mjs";

export default {
    slot: "chart-modules",
    build: function (ctx) {
        const s = ctx.readJson("data/blvm-structure.json");
        const names = {};
        ctx.stack.rows.forEach(function (r) { names[r.slug] = r.name; });
        const mods = s.modules.rows;
        const nodes = {}, bands = [];
        mods.forEach(function (m) { nodes[m.name] = { label: m.name, short: m.name.replace(/^blvm-/, ""), sub: m.capability }; });
        const half = Math.ceil(mods.length / 2);
        bands.push({ label: "BLVM", sub: mods.length + " modules in its registry, run by " + s.modules.host, rows: [mods.slice(0, half).map(function (m) { return m.name; }), mods.slice(half).map(function (m) { return m.name; })], cls: "core" });
        const covered = {};
        s.plugin_support.rows.forEach(function (c) {
            c.slugs.forEach(function (slug) { if (!names[slug]) throw new Error("modules: unknown slug " + slug); covered[slug] = c; });
            if (c.status === "yes") return;
            c.slugs.forEach(function (slug) { nodes["impl-" + slug] = { label: names[slug], cls: c.status === "not-found" ? "muted" : "" }; });
            bands.push({ label: { ipc: "IPC only", embed: "Embedding only", "not-found": "Not found" }[c.status] || c.label, sub: c.status === "ipc" ? "between Core's own processes; not a plug-in system" : c.status === "embed" ? "a library API, not a runtime loader" : "no plug-in or module loader in README, docs or tree", rows: [c.slugs.map(function (x) { return "impl-" + x; })], cls: c.status === "not-found" ? "none" : "" });
        });
        ctx.stack.rows.forEach(function (r) { if (!covered[r.slug]) throw new Error("modules: no plug-in class for " + r.slug); });
        const others = s.plugin_support.rows.filter(function (c) { return c.status !== "yes"; });
        const nf = others.filter(function (c) { return c.status === "not-found"; })[0];
        return figure({
            id: "fig-modules",
            headline: "BLVM is the only implementation here with a module registry: " + mods.length + " add-on modules. Core and its forks use IPC only between their own processes, bitcoin-rs takes extensions in-process as a library, and the other " + nf.slugs.length + " show no plug-in system.",
            caption: "Each box in the top band is one module from the BLVM registry with what it does. The bands below sort the other " + (ctx.stack.rows.length - 1) + " implementations by what they offer for add-on code, read at the commits in the stack table.",
            title: "BLVM modules and plug-in support across implementations",
            desc: "BLVM registry modules: " + mods.map(function (m) { return m.name + " (" + m.capability + ")"; }).join(", ") + ". " + others.map(function (c) { return c.label + ": " + c.slugs.map(function (x) { return names[x]; }).join(", "); }).join(". ") + ".",
            chart: layered(bands, nodes, [], { labelWidth: 170, maxNodeW: 150, narrowPerRow: 2 }),
            notes: ["&ldquo;Not found&rdquo; is a search of each project&rsquo;s README, docs and file tree for plug-in, extension or module loading; it is not proof of absence."],
            sources: [{ label: "registry/modules.json at " + s.modules.source_commit.slice(0, 7), href: s.modules.source }]
                .concat(others.filter(function (c) { return c.source; }).map(function (c) { return { label: c.status === "ipc" ? "Core doc/multiprocess.md" : names[c.slugs[0]] + " README", href: c.source }; }))
                .concat([{ label: "data/blvm-structure.json" }]),
            table: {
                caption: "BLVM registry modules, then plug-in support by implementation",
                columns: ["Name", "What it is", "Source"],
                rows: mods.map(function (m) { return [m.name, "BLVM module. " + m.description, s.modules.source]; })
                    .concat(others.map(function (c) { return [c.slugs.map(function (x) { return names[x]; }).join(", "), c.label + ". " + c.text, c.source ? [c.source].concat(c.also || []).join(" ") : "search at the pinned commits"]; }))
            }
        });
    }
};
