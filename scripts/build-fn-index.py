#!/usr/bin/env python3
"""Map CONSENSUS_SPEC paths such as block::header::validate_block_header to a source line.

The consensus commit is the one checked out when this runs. Links use that commit,
so a later edit does not move the line under an old URL.
"""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONSENSUS = ROOT.parent / "blvm-consensus"
SRC = CONSENSUS / "src"
OUT = ROOT / "fn-index.json"

FN = re.compile(r"^(?:pub(?:\([^)]*\))? )?fn ([a-z_][a-z0-9_]*)\b")
USE_BRACE = re.compile(r"^pub use ([A-Za-z0-9_:]+)::\{([^}]+)\}")
USE_ONE = re.compile(r"^pub use ([A-Za-z0-9_:]+)::([a-z_][a-z0-9_]*)\s*;")


def module_of(rel: str) -> str:
    if rel.endswith("/mod.rs"):
        rel = rel[: -len("/mod.rs")]
    elif rel.endswith(".rs"):
        rel = rel[:-3]
    return rel.replace("/", "::")


def resolve_use(current: str, path: str) -> str:
    if path.startswith("crate::"):
        return path[len("crate::") :]
    if path.startswith("self::"):
        rest = path[len("self::") :]
        return f"{current}::{rest}" if current else rest
    return f"{current}::{path}" if current else path


def main() -> None:
    index = {}
    for path in sorted(SRC.rglob("*.rs")):
        rel = path.relative_to(SRC).as_posix()
        if rel.endswith("_tests.rs"):
            continue
        module = module_of(rel)
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        for number, line in enumerate(lines, 1):
            match = FN.match(line)
            if not match:
                continue
            key = f"{module}::{match.group(1)}"
            index.setdefault(key, [f"src/{rel}", number])

        for line in lines:
            brace = USE_BRACE.match(line.strip())
            one = USE_ONE.match(line.strip())
            if brace:
                target = resolve_use(module, brace.group(1))
                names = [part.strip() for part in brace.group(2).split(",")]
            elif one:
                target = resolve_use(module, one.group(1))
                names = [one.group(2)]
            else:
                continue
            for name in names:
                if not name or not name.replace("_", "").isalnum() or name[0].isupper():
                    continue
                defined = index.get(f"{target}::{name}")
                alias = f"{module}::{name}"
                if defined and alias not in index:
                    index[alias] = defined

    rev = subprocess.check_output(
        ["git", "-C", str(CONSENSUS), "rev-parse", "HEAD"], text=True
    ).strip()
    payload = {
        "repo": "BTCDecoded/blvm-consensus",
        "rev": rev,
        "fns": dict(sorted(index.items())),
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(index)} functions at {rev[:12]} -> {OUT}")


if __name__ == "__main__":
    main()
