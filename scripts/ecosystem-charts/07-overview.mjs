// One graph of every implementation, above the cards. Satoshi lineage shows
// the stated derivation. Own codebases use the same boxes, tagged with
// primary language, and have no derivation arrow. Selecting a name opens
// that card.
import { figure } from "../charts.mjs";
import { lineageSpec } from "./10-lineage.mjs";

export default {
    slot: "chart-overview",
    build: function (ctx) {
        const line = lineageSpec(ctx);
        return figure({
            id: "fig-overview",
            cls: "ch-wide-fig eco-ov-fig",
            wide: 760,
            narrow: 360,
            headline: line.headline,
            caption: line.caption,
            measures: line.measures,
            takeaway: line.takeaway,
            notes: line.notes || [],
            sources: line.sources,
            title: line.title,
            desc: line.desc,
            chart: line.chart,
            table: line.table
        });
    }
};
