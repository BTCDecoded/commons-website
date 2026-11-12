// BLVM crate tree for the default blvm binary, banded by governance layer.
// Crates and edges: data/blvm-structure.json (each edge quotes its Cargo.toml
// line, pinned). Layers: data/implementations.json governance.layers, read
// from governance/config/repository-layers.yml. A crate whose repository is
// in no layer is drawn in a "No layer listed" band; nothing is inferred.
import { figure, layered } from "../charts.mjs";

const ORDER = ["layer_5_extension", "layer_4_application", "layer_3_implementation", "layer_2_constitutional", "none"];
// Rows inside a band, top to bottom, so every edge points down.
const ROWS = {
    layer_5_extension: [["blvm-sdk"]],
    layer_4_application: [["blvm"], ["blvm-node"], ["blvm-storage-fence"]],
    layer_3_implementation: [["blvm-protocol"]],
    layer_2_constitutional: [["blvm-consensus"], ["blvm-primitives", "blvm-secp256k1"]],
    none: [["blvm-muhash", "blvm-spec-lock"]]
};

export default {
    slot: "chart-crates",
    build: function (ctx) {
        const s = ctx.readJson("data/blvm-structure.json");
        const layers = ctx.data.governance.layers;
        const layerOf = {};
        layers.forEach(function (l, i) { l.repositories.forEach(function (r) { layerOf[r] = { layer: l, n: i + 1 }; }); });
        const crates = s.crates.rows, byId = {};
        crates.forEach(function (c) { byId[c.id] = c; });
        const nodes = {}, placed = {};
        crates.forEach(function (c) {
            const off = !c.in_default_binary;
            nodes[c.id] = { label: c.id, short: c.id.replace(/^blvm-/, ""), sub: c.role, cls: c.id === "blvm" ? "hl" : off ? "muted" : "" };
        });
        const bands = ORDER.map(function (key) {
            const rows = ROWS[key].map(function (r) { return r.filter(function (id) { return byId[id]; }); }).filter(function (r) { return r.length; });
            rows.forEach(function (r) { r.forEach(function (id) {
                const got = layerOf[byId[id].repo];
                if ((got ? got.layer.id : "none") !== key) throw new Error("crate tree: " + id + " is not in " + key);
                placed[id] = 1;
            }); });
            if (key === "none") return { label: "No layer listed", sub: "repository not in repository-layers.yml", rows: rows, cls: "none" };
            const l = layers.filter(function (x) { return x.id === key; })[0], n = layers.indexOf(l) + 1;
            return { label: "Layer " + n + ": " + l.name.replace(/ Layer$/, ""), sub: l.signatures_required + " of " + l.signatures_total + " signatures, " + l.review_period_days + "-day review", rows: rows, cls: key === "layer_2_constitutional" ? "core" : "" };
        });
        crates.forEach(function (c) { if (!placed[c.id]) throw new Error("crate tree: " + c.id + " not placed"); });
        // Draw the transitive reduction: an edge is left out of the drawing
        // (not the table) when another path already connects the same two
        // crates using edges at least as "on" as it is.
        const all = s.crates.edges;
        function reach(from, to, skip, solidOnly) {
            const seen = {}, stack = [from];
            while (stack.length) {
                const x = stack.pop();
                if (x === to) return true;
                if (seen[x]) continue; seen[x] = 1;
                all.forEach(function (e) { if (e !== skip && e.from === x && (!solidOnly || e["default"])) stack.push(e.to); });
            }
            return false;
        }
        const implied = all.filter(function (e) { return reach(e.from, e.to, e, e["default"]); });
        const edges = all.filter(function (e) { return implied.indexOf(e) < 0; }).map(function (e) { return { from: e.from, to: e.to, dashed: !e["default"] }; });
        const linked = crates.filter(function (c) { return c.in_default_binary; });
        const noLayer = linked.filter(function (c) { return !layerOf[c.repo]; }).map(function (c) { return c.id; });
        const cons = layerOf["blvm-consensus"].layer;
        return figure({
            id: "fig-crates",
            headline: "The default blvm binary is " + linked.length + " BLVM crates. The governance config writes " + cons.signatures_required + " of " + cons.signatures_total + " signatures for the consensus crates, but " + noLayer.join(" and ") + ", linked into every node, is in no layer.",
            caption: "Arrows point from a crate to a crate it depends on, read from each Cargo.toml (node pinned at " + s.crates.node_pin.slice(0, 7) + "). Dashed arrows and outlined boxes are off in the default build: blvm-spec-lock is proof tooling behind an optional feature, and blvm-sdk builds modules against the node. Bands are the repository layers in the governance config, with their written signature rule; enforcement is off.",
            measures: "What the default BLVM binary is built from and which governance layer covers each part; it matters because a crate outside every layer has no written signature rule.",
            takeaway: "The consensus crates carry the strictest written rule, but one crate in every node sits outside the layers.",
            title: "BLVM crate dependencies by governance layer",
            desc: bands.map(function (b) { return b.label + " (" + b.sub + "): " + [].concat.apply([], b.rows).join(", "); }).join(". ") + ". Edges: " + edges.map(function (e) { return e.from + " to " + e.to + (e.dashed ? " (optional, off by default)" : ""); }).join("; ") + ".",
            chart: layered(bands, nodes, edges, { labelWidth: 170, maxNodeW: 160, narrowPerRow: 2 }),
            notes: ["Arrows already implied by a longer path are left out of the drawing: " + implied.map(function (e) { return e.from + " also depends on " + e.to + (e["default"] ? "" : " (optional, off)"); }).join("; ") + ". The hidden table lists every edge.", "blvm-storage-fence lives in the blvm-node repository, so it takes that repository&rsquo;s layer."],
            sources: [{ label: "blvm Cargo.toml at " + s.crates.binary_commit.slice(0, 7), href: byId.blvm.cargo }, { label: "blvm-node Cargo.toml at " + s.crates.node_pin.slice(0, 7), href: byId["blvm-node"].cargo }, { label: "repository-layers.yml", href: s.layers_source.href }, { label: "data/blvm-structure.json" }],
            table: {
                caption: "BLVM crates, their layer, and what they depend on",
                columns: ["Crate", "In default binary", "Layer", "Depends on", "Source"],
                rows: crates.map(function (c) {
                    const l = layerOf[c.repo];
                    const deps = s.crates.edges.filter(function (e) { return e.from === c.id; }).map(function (e) { return e.to + (e["default"] ? "" : " (optional, off)"); });
                    return [c.id, c.in_default_binary ? "yes" : "no", l ? "Layer " + l.n + ", " + l.layer.signatures_required + " of " + l.layer.signatures_total : "No layer listed", deps.join(", ") || "no BLVM crates", c.cargo];
                })
            }
        });
    }
};
