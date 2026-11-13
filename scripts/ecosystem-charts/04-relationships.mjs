// How the page's measures connect: lineage, then governance, then
// verification, then code health, each step linking to its section.
import { figure, flow } from "../charts.mjs";

const STEPS = [
    { label: "Lineage", sub: "Where the code comes from. Select a name to open its card.", href: "#overview" },
    { label: "The card", sub: "Assurance, code health, and the five comparisons.", href: "#overview" },
    { label: "Who decides", sub: "Who can change that code, and who must agree.", href: "#institution" },
    { label: "The tables", sub: "The same cells, with the source for each one.", href: "#tables" }
];

export default {
    slot: "chart-relationships",
    build: function () {
        return figure({
            id: "fig-relationships",
            headline: "Start with the graph. The card is one implementation. Institution names who can change the code. The tables are the sources.",
            caption: "Select a step to jump there. The card holds assurance, code health, and the five comparisons. Institution, forms, and the directory name who can change the code.",
            measures: "How the page fits together: the graph, the card, who decides, and the source tables.",
            takeaway: "Shared lineage means shared bugs. The card shows the evidence and the code. Institution names who can change it.",
            title: "How the measures connect",
            desc: STEPS.map(function (s, i) { return (i + 1) + ". " + s.label + ": " + s.sub; }).join(" "),
            chart: flow(STEPS),
            table: { caption: "How the measures connect", columns: ["Step", "Question", "Section"], rows: STEPS.map(function (s, i) { return [(i + 1) + ". " + s.label, s.sub, s.href]; }) }
        });
    }
};
