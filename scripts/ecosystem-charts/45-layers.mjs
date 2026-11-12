// Repository layers and the governance-node quorum as k-of-n dots.
// Layers: data/implementations.json governance.layers (repository-layers.yml).
// Quorum: data/blvm-structure.json quorum, quoting GOVERNANCE.md; the render
// fails if the page's own quorum sentence no longer says two of three.
import { figure, kOfN } from "../charts.mjs";

export default {
    slot: "chart-layers",
    build: function (ctx) {
        const s = ctx.readJson("data/blvm-structure.json");
        const q = s.quorum;
        if (ctx.data.governance.quorum.indexOf("two of three governance nodes") < 0 || q.k !== 2 || q.n !== 3) throw new Error("layers chart: quorum text changed");
        const layers = ctx.data.governance.layers;
        const rows = layers.map(function (l, i) {
            return { label: "Layer " + (i + 1) + ": " + l.repositories.join(", "), sub: l.review_period_days + "-day review", k: l.signatures_required, n: l.signatures_total, cls: i < 2 ? "hl" : "" };
        });
        rows.push({ gap: true, label: q.label + " (enforcement)", sub: "once Phase 2 begins", k: q.k, n: q.n, cls: "b" });
        return figure({
            id: "fig-layers",
            headline: "Written signature rules run from " + layers[0].signatures_required + " of " + layers[0].signatures_total + " for the spec and consensus crates down to " + layers[layers.length - 1].signatures_required + " of " + layers[layers.length - 1].signatures_total + " for the SDK. A separate " + q.k + "-of-" + q.n + " quorum of governance nodes is meant to enforce them; enforcement is off today.",
            caption: "Each row is one repository layer: filled dots are the maintainer signatures a change needs, empty dots the rest of the roster. The blue row is not a maintainer signature but the governance-node quorum.",
            title: "Signature rule by repository layer, and the governance-node quorum",
            desc: rows.map(function (r) { return r.label + ": " + r.k + " of " + r.n + (r.sub ? ", " + r.sub : ""); }).join("; ") + ".",
            chart: kOfN(rows, { labelWidth: 360 }),
            sources: [{ label: "repository-layers.yml", href: s.layers_source.href }, q.source, { label: "data/implementations.json (governance)" }],
            table: { caption: "Signature rule by layer", columns: ["Layer", "Signatures", "Review"], rows: rows.map(function (r) { return [r.label, r.k + " of " + r.n, r.sub]; }) }
        });
    }
};
