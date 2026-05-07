/**
 * PROTOCOL display-math uses LaTeX tuned for GitHub / AMS; KaTeX needs small normalizations.
 */

function escapeUnderscoresInTextBraces(s: string): string {
  const parts = s.split("\\text{");
  let out = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i] ?? "";
    const close = seg.indexOf("}");
    if (close === -1) {
      out += "\\text{" + seg;
      continue;
    }
    let inner = seg.slice(0, close);
    const rest = seg.slice(close + 1);
    inner = inner.replace(/(?<!\\)_/g, "\\_");
    out += "\\text{" + inner + "}" + rest;
  }
  return out;
}

/** `stack[|stack|-k]` confuses KaTeX `|` / `[` parsing; use explicit cardinality. */
function fixStackCardinalityBrackets(s: string): string {
  return s.replace(
    /stack\[\|stack\|-(\d+)\]/g,
    (_, d) => "\\text{stack}\\bigl[\\lvert \\text{stack}\\rvert-" + d + "\\bigr]",
  );
}

/** `i'` as a primed variable in `\implies i' = …`. */
function fixVariablePrime(s: string): string {
  return s.replace(/\bi'/g, "i^{\\prime}");
}

/**
 * Collapse newlines / runs of whitespace so KaTeX never sees raw `\n` as a control sequence.
 * PROTOCOL `cases` rows already use `\\`; remaining whitespace is only for readability.
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function preprocessSpecMathLatex(raw: string): string {
  let s = escapeUnderscoresInTextBraces(raw);
  s = fixStackCardinalityBrackets(s);
  s = fixVariablePrime(s);
  s = normalizeWhitespace(s);
  return s;
}
