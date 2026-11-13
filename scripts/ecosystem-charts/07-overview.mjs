// The assurance field map and the lineage chart, one figure, placed above the
// implementation cards. Selecting a name opens that card.
import { figure } from "../charts.mjs";
import { fieldmapSpec } from "./05-fieldmap.mjs";
import { lineageSpec } from "./10-lineage.mjs";

export default {
    slot: "chart-overview",
    build: function (ctx) {
        const field = fieldmapSpec(ctx);
        const line = lineageSpec(ctx);
        const seen = {};
        const sources = field.sources.concat(line.sources).filter(function (s) {
            if (seen[s.label]) return false;
            seen[s.label] = 1;
            return true;
        });
        return figure({
            id: "fig-overview",
            cls: "ch-wide-fig eco-ov-fig",
            split: true,
            wide: 700,
            narrow: 360,
            headline: field.headline + " " + line.headline,
            lead: "Select an implementation to open its card.",
            caption: field.caption + " " + line.caption,
            measures: field.measures + " " + line.measures,
            takeaway: field.takeaway + " " + line.takeaway,
            notes: (field.notes || []).concat(line.notes || []),
            sources: sources,
            parts: [
                { id: "fig-fieldmap", kicker: "Assurance", title: field.title, desc: field.desc, chart: field.chart },
                { id: "fig-lineage", kicker: "Lineage", title: line.title, desc: line.desc, chart: line.chart }
            ],
            tables: [field.table, line.table]
        });
    }
};
