// How the page's measures connect: lineage, then governance, then
// verification, then code health, each step linking to its section.
import { figure, flow } from "../charts.mjs";

const STEPS = [
    { label: "Lineage", sub: "Where the code comes from: Core, a fork, or its own codebase.", href: "#why" },
    { label: "Governance", sub: "Who can change that code, and who must agree.", href: "#institution" },
    { label: "Verification", sub: "What evidence shows the code follows Bitcoin's rules.", href: "#commons" },
    { label: "Code health", sub: "How the code is built, sized, tested and released.", href: "#compare" }
];

export default {
    slot: "chart-relationships",
    build: function () {
        return figure({
            id: "fig-relationships",
            headline: "Read the measures in order: lineage, then governance, then verification, then code health.",
            caption: "Each step narrows the next question. Select a step to jump to its section.",
            measures: "How the page's sections relate; it matters because a count in one section only makes sense with the step before it.",
            takeaway: "Shared lineage means shared bugs; governance decides who fixes them; verification shows how they would be caught; code health shows the work behind it.",
            title: "How the measures connect",
            desc: STEPS.map(function (s, i) { return (i + 1) + ". " + s.label + ": " + s.sub; }).join(" "),
            chart: flow(STEPS),
            table: { caption: "How the measures connect", columns: ["Step", "Question", "Section"], rows: STEPS.map(function (s, i) { return [(i + 1) + ". " + s.label, s.sub, s.href]; }) }
        });
    }
};
