#!/usr/bin/env python3
"""Measure comparable ecosystem stats from pinned checkouts (tokei 14).

Reproduces BLVM size/test buckets and adds depth metrics for every
implementation. Read-only against the trees; writes JSON on stdout or --out.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import date
from pathlib import Path

TOKEI = os.environ.get("TOKEI", "/workspace/uiux-eco/tools/bin/tokei")
AS_OF = "2026-11-12"
WINDOW_START = "2025-11-12"
WINDOW_END = "2026-11-12"

# Programming languages counted as code (tokei names). Metadata and markup
# are left out so TOML/JSON/Markdown do not inflate implementation size.
CODE_LANGS = {
    "Rust", "C", "C++", "C Header", "C++ Header", "Python", "Go",
    "CUDA", "GNU Style Assembly", "Assembly", "JavaScript", "TypeScript",
    "Shell", "BASH", "Makefile", "Nix", "Protocol Buffers", "Java",
    "Kotlin", "Swift", "Zig", "D", "Haskell", "OCaml", "Lean",
}

VENDOR_PREFIXES = {
    "bitcoin-core": (
        "src/secp256k1/", "src/leveldb/", "src/minisketch/", "src/univalue/",
        "src/crc32c/", "src/crypto/ctaes/", "src/ipc/libmultiprocess/",
    ),
    "knots-legacy": (
        "src/secp256k1/", "src/leveldb/", "src/minisketch/", "src/univalue/",
        "src/crc32c/", "src/crypto/ctaes/", "src/ipc/libmultiprocess/",
    ),
    "bit-block": (
        "src/secp256k1/", "src/leveldb/", "src/minisketch/", "src/univalue/",
        "src/crc32c/", "src/crypto/ctaes/", "src/ipc/libmultiprocess/",
    ),
    "bitcoin-roots": (
        "src/secp256k1/", "src/leveldb/", "src/minisketch/", "src/univalue/",
        "src/crc32c/", "src/crypto/ctaes/", "src/ipc/libmultiprocess/",
    ),
    "hornet": ("extern/",),
    "rbitcoin": ("third_party/",),
    "libbitcoin": (),  # vendored column on the page is measured separately
}

LOCALE_PREFIXES = ("src/qt/locale/",)

TEST_PATH = re.compile(
    r"(^|/)(tests?|fuzz|bench(?:es)?|benches|e2e)(/|$)", re.I
)
TEST_FILE = re.compile(
    r"(^|/)([^/]*_tests?\.(rs|cpp|h|cc|hpp|py|go)|test_[^/]+\.(py|cpp|h|cc)|[^/]+_test\.go)$",
    re.I,
)
FUZZ_PATH = re.compile(
    r"(^|/)(fuzz|fuzz_targets|fuzzing)(/|$)|(^|/)src/test/fuzz(/|$)", re.I
)
PROPERTY_PATH = re.compile(
    r"(property|proptest|quickcheck|hypothesis|orange_paper_property)", re.I
)
INTEGRATION_PATH = re.compile(
    r"(^|/)(tests|test|e2e|qa|functional)(/|$)", re.I
)
# Core/C++ unit tests live in src/test (not test/ functional).
CPP_UNIT_PATH = re.compile(r"(^|/)src/test(/|$)")

VECTOR_NAME = re.compile(
    r"(vector|tx_valid|tx_invalid|script_tests|sighash|bip\d+)", re.I
)
SPEC_NAME = re.compile(
    r"(^|/)(.*spec.*|THE_ORANGE_PAPER|orange.?paper|bip-?\d+.*)(\.(md|rst|txt|pdf|tex|lean))?$",
    re.I,
)

# #[cfg(test)] or #[cfg(all(..., test, ...))]; not cfg(any(test, ...)).
CFG_TEST = re.compile(
    r"#\[cfg\(\s*(?:test|all\s*\([^)]*\btest\b[^)]*)\s*\)\s*\]"
)
CFG_TEST_FILE = re.compile(
    r"#!\[cfg\(\s*(?:test|all\s*\([^)]*\btest\b[^)]*)\s*\)\s*\]"
)


def cell(value, status="measured", text=None, **extra):
    if value is None and status == "measured":
        status = "not-measured"
    if text is None:
        if status in ("not-measured", "not-found"):
            text = "not measured" if status == "not-measured" else "not found"
        elif value is None:
            text = "not measured"
        elif isinstance(value, float):
            text = f"{value:.2f}"
        else:
            text = f"{value:,}" if isinstance(value, int) else str(value)
    out = {"value": value, "text": text, "status": status}
    out.update(extra)
    return out


def rust_code_lines(text: str, start: int, end: int) -> int:
    n = 0
    in_block = False
    for line in text[start:end].splitlines():
        t = line.strip()
        if not t:
            continue
        if in_block:
            if "*/" in t:
                t = t.split("*/", 1)[1].strip()
                in_block = False
                if not t:
                    continue
            else:
                continue
        if t.startswith("/*") and "*/" not in t[2:]:
            in_block = True
            continue
        if t.startswith("/*") and "*/" in t:
            rest = t.split("*/", 1)[1].strip()
            if not rest or rest.startswith("//"):
                continue
            t = rest
        if t.startswith("//"):
            continue
        n += 1
    return n


def cfg_test_spans(text: str):
    spans = []
    i = 0
    while True:
        m = CFG_TEST.search(text, i)
        if not m:
            break
        j = m.end()
        while True:
            ws = re.match(r"\s+", text[j:])
            if ws:
                j += ws.end()
            if text[j:].startswith("//"):
                nl = text.find("\n", j)
                j = len(text) if nl < 0 else nl + 1
                continue
            if text[j:].startswith("/*"):
                end = text.find("*/", j + 2)
                j = len(text) if end < 0 else end + 2
                continue
            attr = re.match(r"#\[[^\]]*\]", text[j:])
            if attr:
                j += attr.end()
                continue
            break
        k = j
        while k < len(text) and text[k] not in "{;":
            k += 1
        if k >= len(text):
            break
        if text[k] == ";":
            spans.append((m.start(), k + 1))
            i = k + 1
            continue
        depth = 0
        p = k
        while p < len(text):
            if text[p] == "{":
                depth += 1
            elif text[p] == "}":
                depth -= 1
                if depth == 0:
                    spans.append((m.start(), p + 1))
                    i = p + 1
                    break
            p += 1
        else:
            break
    return spans


def cfg_test_code_lines(path: Path) -> int:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    if CFG_TEST_FILE.search(text):
        return rust_code_lines(text, 0, len(text))
    return sum(rust_code_lines(text, a, b) for a, b in cfg_test_spans(text))


def load_tokei(json_path: Path, root: Path):
    data = json.loads(json_path.read_text())
    root_s = str(root.resolve())
    files = []
    for lang, payload in data.items():
        if lang == "Total":
            continue
        for report in payload.get("reports") or []:
            p = report["name"]
            if p.startswith(root_s + "/"):
                rel = p[len(root_s) + 1 :]
            else:
                rel = p
            files.append(
                {
                    "rel": rel.replace("\\", "/"),
                    "lang": lang,
                    "code": report["stats"]["code"],
                    "path": Path(p),
                }
            )
    return files


def is_vendor(slug: str, rel: str) -> bool:
    return any(rel.startswith(p) for p in VENDOR_PREFIXES.get(slug, ()))


def is_locale(rel: str) -> bool:
    return any(rel.startswith(p) for p in LOCALE_PREFIXES)


def is_code_lang(lang: str) -> bool:
    return lang.split(">")[0] in CODE_LANGS


def path_is_test(rel: str) -> bool:
    return bool(TEST_PATH.search(rel) or TEST_FILE.search(rel))


def test_kind(rel: str, lang: str) -> str:
    """Partition a test file into unit / integration / fuzz / property."""
    if FUZZ_PATH.search(rel):
        return "fuzz"
    if PROPERTY_PATH.search(rel):
        return "property"
    if CPP_UNIT_PATH.search(rel):
        return "unit"
    if INTEGRATION_PATH.search(rel):
        return "integration"
    # *_test.go / *_tests.rs sitting next to sources
    return "unit"


def split_file(slug: str, rec: dict):
    """Return (impl, test, kind_or_none, vendor, locale). test is a dict of kinds or a total."""
    rel, lang, code, path = rec["rel"], rec["lang"], rec["code"], rec["path"]
    if is_vendor(slug, rel):
        return 0, {}, True, False
    if is_locale(rel):
        return 0, {}, False, True
    if not is_code_lang(lang):
        return 0, {}, False, False
    if path_is_test(rel):
        kind = test_kind(rel, lang)
        return 0, {kind: code}, False, False
    if lang == "Rust" and path.exists():
        cfg = cfg_test_code_lines(path)
        if cfg > code:
            cfg = code
        tests = {}
        if cfg:
            # in-file cfg(test): property if the file name says so, else unit
            kind = "property" if PROPERTY_PATH.search(rel) else "unit"
            tests[kind] = cfg
        return code - cfg, tests, False, False
    return code, {}, False, False


def measure_trees(slug: str, trees: list[tuple[str, Path, Path]]):
    """trees: list of (label, root, tokei_json)."""
    impl = 0
    tests = defaultdict(int)
    program_files = []  # (code, rel) after tooling filter done by caller
    all_impl_files = []
    vendor = locale = 0
    rust_cfg_unit = 0
    for label, root, tokei_json in trees:
        for rec in load_tokei(tokei_json, root):
            i, tdict, vend, loc = split_file(slug, rec)
            if vend:
                vendor += rec["code"]
                continue
            if loc:
                locale += rec["code"]
                continue
            impl += i
            if i:
                all_impl_files.append((i, f"{label}:{rec['rel']}"))
            for k, v in tdict.items():
                tests[k] += v
                if k == "unit" and rec["lang"] == "Rust" and not path_is_test(rec["rel"]):
                    rust_cfg_unit += v
    return {
        "implementation": impl,
        "tests": dict(tests),
        "test_total": sum(tests.values()),
        "impl_files": all_impl_files,
        "vendored": vendor,
        "locale": locale,
        "rust_cfg_unit": rust_cfg_unit,
    }


def share_ge_1000(files, total):
    if not total:
        return None
    big = sum(c for c, _ in files if c >= 1000)
    return round(100.0 * big / total, 1)


def files_holding_half(files, total):
    if not total:
        return None
    acc = 0
    n = 0
    for c, _ in sorted(files, reverse=True):
        acc += c
        n += 1
        if acc * 2 >= total:
            return n
    return n


def git(cwd, *args, check=True):
    r = subprocess.run(
        ["git", "-C", str(cwd), *args],
        text=True,
        capture_output=True,
    )
    if check and r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout or "git failed")
    return r.stdout.strip() if r.returncode == 0 else ""


def is_shallow(cwd: Path) -> bool:
    return git(cwd, "rev-parse", "--is-shallow-repository", check=False) == "true"


def history_complete_for_window(cwd: Path, rev: str) -> tuple[bool, str]:
    """True if we can see a root commit or history reaches before WINDOW_START."""
    shallow = is_shallow(cwd)
    # Oldest commit date we can walk
    dates = git(cwd, "log", rev, "--format=%ci", "--max-parents=0", check=False)
    oldest = None
    for line in dates.splitlines():
        if line:
            oldest = min(filter(None, [oldest, line[:10]]))
    if not oldest:
        # fall back: last line of a bounded log is expensive; use rev-list count
        return (not shallow, "no root date")
    if oldest <= WINDOW_START:
        return True, f"oldest visible {oldest}"
    # Repo may be younger than the window. A true root (and not a shallow graft
    # of a later commit) means the history is complete.
    if shallow:
        return False, f"shallow; oldest visible {oldest}"
    return True, f"repository begins {oldest} (inside window; full history)"


def unique_authors(cwd: Path, rev: str) -> list[str]:
    out = git(
        cwd,
        "log",
        rev,
        f"--since={WINDOW_START}",
        f"--until={WINDOW_END}",
        "--format=%aN",
        check=False,
    )
    # Unique author names as recorded; identities are not merged.
    names = []
    seen = set()
    for line in out.splitlines():
        n = line.strip()
        if n and n not in seen:
            seen.add(n)
            names.append(n)
    return names


def releases_12m(cwd: Path) -> tuple[int | None, str]:
    """Count tags whose tagger (annotated) or commit date (lightweight) is in the window."""
    # taggerdate for annotated, creatordate works for both in modern git
    out = git(
        cwd,
        "for-each-ref",
        "--format=%(creatordate:short) %(refname:short)",
        "refs/tags",
        check=False,
    )
    if not out and is_shallow(cwd):
        return None, "shallow checkout; tag dates not available"
    n = 0
    for line in out.splitlines():
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        d, tag = parts
        if "/" in tag:
            continue  # Go module subpath tags (e.g. btcutil/v1.2.0)
        if WINDOW_START <= d <= WINDOW_END:
            n += 1
    return n, "git tags in the window by creatordate, excluding names that contain / (Go module subpath tags)"


FUZZ_FILE_RE = re.compile(
    r"(^|/)(fuzz/fuzz_targets/[^/]+\.(rs|cpp|cc)|src/test/fuzz/[^/]+\.(cpp|cc|h)|test/fuzz/[^/]+\.(cpp|cc))$"
)
SKIP_FUZZ_NAMES = {"mod.rs", "README.md", "Cargo.toml", "CMakeLists.txt", "util.cpp", "util.h", "fuzz.cpp"}


def count_fuzz_targets(roots: list[Path]) -> int:
    n = 0
    for root in roots:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            rel = str(p.relative_to(root)).replace("\\", "/")
            if "target/" in rel or "/.git/" in rel:
                continue
            if FUZZ_PATH.search(rel) and p.suffix in {".rs", ".cpp", ".cc"} and p.name not in SKIP_FUZZ_NAMES and p.name != "mod.rs":
                # cargo-fuzz targets are files in fuzz_targets; Core lists .cpp in src/test/fuzz
                if "fuzz_targets" in rel or "/src/test/fuzz/" in "/" + rel or "/test/fuzz/" in "/" + rel:
                    n += 1
                elif rel.endswith("_target.rs") or "fuzz_target" in p.name:
                    n += 1
    return n


def count_fuzz_from_roots(roots: list[Path]) -> int:
    n = 0
    seen = set()
    for root in roots:
        # cargo-fuzz
        ft = root / "fuzz" / "fuzz_targets"
        if ft.is_dir():
            for p in ft.iterdir():
                if p.is_file() and p.suffix == ".rs" and p.name != "mod.rs":
                    key = f"{root}:{p.name}"
                    if key not in seen:
                        seen.add(key)
                        n += 1
        # nested crates
        for p in root.glob("*/fuzz/fuzz_targets/*.rs"):
            if p.name != "mod.rs":
                key = str(p.relative_to(root))
                if key not in seen:
                    seen.add(key)
                    n += 1
        for p in root.glob("crates/*/fuzz/fuzz_targets/*.rs"):
            if p.name != "mod.rs":
                key = str(p.relative_to(root))
                if key not in seen:
                    seen.add(key)
                    n += 1
        # Bitcoin Core style
        for base in (root / "src" / "test" / "fuzz", root / "test" / "fuzz"):
            if not base.is_dir():
                continue
            for p in base.rglob("*"):
                if p.is_file() and p.suffix in {".cpp", ".cc"} and p.name not in SKIP_FUZZ_NAMES:
                    key = p.name
                    if key not in seen:
                        seen.add(key)
                        n += 1
    return n


def count_vector_and_spec_files(roots: list[Path]) -> tuple[int, int, list[str], list[str]]:
    vectors, specs = [], []
    for root in roots:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            rel = str(p.relative_to(root)).replace("\\", "/")
            if any(s in rel for s in ("/.git/", "/target/", "node_modules/", "src/qt/locale/")):
                continue
            name = p.name
            if p.suffix.lower() in {".json", ".csv", ".hex"} and VECTOR_NAME.search(rel):
                vectors.append(rel)
            elif p.suffix.lower() in {".md", ".rst", ".txt", ".lean", ".tex"} and SPEC_NAME.search(name):
                if name.upper() in {"LICENSE", "LICENSE.TXT", "COPYING", "SECURITY.MD", "CONTRIBUTING.MD"}:
                    continue
                specs.append(rel)
    return len(vectors), len(specs), vectors, specs


def parse_ci(root: Path) -> tuple[int | None, int | None, str]:
    wfdir = root / ".github" / "workflows"
    if not wfdir.is_dir():
        # Core also uses ci/ ; still count GHA if present
        return 0, 0, "no .github/workflows directory"
    files = []
    for p in wfdir.iterdir():
        if p.suffix not in {".yml", ".yaml"} or not p.is_file():
            continue
        # Skip generated *expanded* duplicates (e.g. libbitcoin ci-expanded.yml),
        # not every file whose header says GENERATED.
        if p.name.endswith("-expanded.yml") or p.name.endswith("-expanded.yaml"):
            continue
        files.append(p)
    try:
        import yaml
    except ImportError:
        return len(files), None, "workflow files counted; PyYAML missing so jobs not expanded"
    jobs = 0
    notes = []
    for p in files:
        try:
            doc = yaml.safe_load(p.read_text(encoding="utf-8", errors="replace")) or {}
        except Exception as e:
            notes.append(f"{p.name}: parse error")
            continue
        if not isinstance(doc, dict):
            continue
        jmap = doc.get("jobs") or {}
        if not isinstance(jmap, dict):
            continue
        for jname, job in jmap.items():
            if not isinstance(job, dict):
                jobs += 1
                continue
            strat = job.get("strategy") or {}
            matrix = strat.get("matrix") if isinstance(strat, dict) else None
            expanded = expand_matrix(matrix)
            if expanded is None:
                jobs += 1
                notes.append(f"{p.name}/{jname}: matrix not expanded")
            else:
                jobs += max(1, expanded)
    note = "GitHub Actions workflow files; jobs count expands a static matrix of lists"
    if notes:
        note += ". " + "; ".join(notes[:8])
    return len(files), jobs, note


def expand_matrix(matrix):
    if not matrix:
        return 1
    if not isinstance(matrix, dict):
        return None
    # include-only or dynamic expressions
    if any(isinstance(v, str) and "${{" in v for v in matrix.values()):
        return None
    lists = []
    for k, v in matrix.items():
        if k in ("include", "exclude"):
            continue
        if isinstance(v, list):
            lists.append(len(v) if v else 1)
        else:
            lists.append(1)
    n = 1
    for L in lists:
        n *= L
    inc = matrix.get("include")
    if isinstance(inc, list):
        n += len(inc)
    exc = matrix.get("exclude")
    if isinstance(exc, list):
        n = max(0, n - len(exc))
    if not lists and not inc:
        return 1
    return n


# ---- tree locations (pins must already be checked out) ----

BLVM_CRATES = [
    # name, version, commit, root, tokei, role
    ("blvm-node", "0.1.92", "36bb40c7e9a3f805274fa7e1bda30d0a6c082560",
     "/tmp/eco-audit/src/blvm-node", "/tmp/eco-audit/tokei/blvm-node.json", "program"),
    ("blvm-protocol", "0.1.48", "0bc9307a2235831fff52548621301b6084a9e809",
     "/tmp/eco-audit/src/blvm-protocol", "/tmp/eco-audit/tokei/blvm-protocol.json", "program"),
    ("blvm-consensus", "0.1.82", "f63c32856a2da874296524f40b8cbd35518d8096",
     "/tmp/eco-audit/src/blvm-consensus", "/tmp/eco-audit/tokei/blvm-consensus.json", "program"),
    ("blvm-primitives", "0.1.34", "ede6efb409bdfc93cef9eb9a47a2be5e9094bc59",
     "/tmp/eco-audit/src/blvm-primitives", "/tmp/eco-audit/tokei/blvm-primitives.json", "program"),
    ("blvm-secp256k1", "0.1.17", "441173f0fb1690f457f2c0292b77e3d4e34316dc",
     "/tmp/eco-audit/src/blvm-secp256k1", "/tmp/eco-audit/tokei/blvm-secp256k1.json", "program"),
    ("blvm-muhash", "0.1.11", "b0031beba641737b6768d141ef26adc1edc0609f",
     "/tmp/eco-audit/src/blvm-muhash", "/tmp/eco-audit/tokei/blvm-muhash.json", "program"),
    ("blvm-sdk", "0.1.23", "fcb1afdc5e28a2893717dd4b2c9548d83b35ec62",
     "/tmp/eco-audit/src/blvm-sdk", "/tmp/eco-audit/tokei/blvm-sdk.json", "program"),
    ("blvm-spec-lock", "0.1.54", "bddfae4ac8063f78bf654d7a2245c810d89f98d1",
     "/tmp/eco-audit/src/blvm-spec-lock", "/tmp/eco-audit/tokei/blvm-spec-lock.json", "tooling"),
]
# storage-fence is a path crate inside blvm-node and is included in the node tree.

TREES = {
    "bitcoin-core": ("/workspace/scratch/eco-p4/src/bitcoin-core", "f0de87f040621468b956f01f526a43a010310501"),
    "knots-legacy": ("/workspace/scratch/eco-p4/src/knots-legacy", "7936c49b6739640eb71e55eb2b5f720179b9c3b4"),
    "bit-block": ("/workspace/scratch/eco-p4/src/bit-block", "c52f1161349e6a76463156fea39bce191951b915"),
    "bitcoin-roots": ("/workspace/scratch/eco-p4/src/bitcoin-roots", "f0393f2688656ba544b40fe508db909152201c18"),
    "bitcoin-rs": ("/workspace/scratch/eco-p4/src/bitcoin-rs", "9b8e91ae1aadfaad08e7fccbfa895bcbf41c6620"),
    "satd": ("/workspace/scratch/eco-p4/src/satd", "f0ea0e5dfa8446d9cb63fef0a22eaf5f976216ce"),
    "libbitcoin": ("/workspace/scratch/eco-p4/src/libbitcoin", "9f9cce3086074840951cedf1d381f08112275bfd"),
    "hornet": ("/workspace/scratch/eco-p4/src/hornet", "151462fa5ceece39c159674886dcfa6cfe9b1234"),
    "floresta": ("/workspace/scratch/eco-p4/src/floresta", "cdbcf5a13cba2b0aab505977ba413f707bc06290"),
    "rbitcoin": ("/workspace/scratch/eco-p4/src/rbitcoin", "ca7bf804ed44d7efdca3da219ead6e644d35fd9e"),
    "btcd": ("/workspace/scratch/eco-p4/src/btcd", "dd169fe0c32a56087d28b92fff3b8cf4fb43477a"),
}

LANDING_GIT = {
    # Same repo set as the landing commit-share row.
    "blvm": ("/workspace/BTCDecoded/blvm-node", "36bb40c7e9a3f805274fa7e1bda30d0a6c082560"),
}

# Optional blobless --shallow-since=2025-11-12 clones for author counts when
# the pin checkout is too shallow. Built with:
#   git clone --bare --filter=blob:none --shallow-since=2025-11-12 --single-branch \
#     https://github.com/<repo>.git
HIST_OVERRIDE = {
    "floresta": "/tmp/eco-audit/hist/floresta",
    "rbitcoin": "/tmp/eco-audit/hist/rbitcoin",
    "btcd": "/tmp/eco-audit/hist/btcd",
}

NAMES = {
    "blvm": "BLVM",
    "bitcoin-core": "Bitcoin Core",
    "knots-legacy": "Knots Legacy",
    "bit-block": "Bit-Block",
    "bitcoin-roots": "Bitcoin Roots",
    "bitcoin-rs": "bitcoin-rs",
    "satd": "satd",
    "libbitcoin": "libbitcoin",
    "hornet": "Hornet",
    "floresta": "Floresta",
    "rbitcoin": "rbitcoin",
    "btcd": "btcd",
}

# Fuzz count for the verification cell: node+protocol+consensus+muhash+sdk
BLVM_FUZZ_SET = {
    "blvm-node", "blvm-protocol", "blvm-consensus", "blvm-muhash", "blvm-sdk"
}


def blvm_size():
    program_trees = []
    tooling_trees = []
    program_roots = []
    tooling_roots = []
    fuzz_roots = []
    all_roots = []
    for name, ver, commit, root, tokei, role in BLVM_CRATES:
        t = (name, Path(root), Path(tokei))
        all_roots.append(Path(root))
        if role == "tooling":
            tooling_trees.append(t)
            tooling_roots.append(Path(root))
        else:
            program_trees.append(t)
            program_roots.append(Path(root))
        if name in BLVM_FUZZ_SET:
            fuzz_roots.append(Path(root))
    prog = measure_trees("blvm", program_trees)
    tool = measure_trees("blvm", tooling_trees)
    # Tooling = spec-lock non-test code. Spec-lock tests still count as tests.
    tooling_code = tool["implementation"]
    implementation = prog["implementation"] + tooling_code
    tests = defaultdict(int)
    for src in (prog["tests"], tool["tests"]):
        for k, v in src.items():
            tests[k] += v
    test_total = sum(tests.values())
    program_code = prog["implementation"]
    program_files = prog["impl_files"]
    ratio = round(test_total / implementation, 2) if implementation else None
    ge1000 = share_ge_1000(program_files, program_code)
    half = files_holding_half(program_files, program_code)
    fuzz_all_program = count_fuzz_from_roots(program_roots + tooling_roots)
    fuzz_verify = count_fuzz_from_roots(fuzz_roots)
    vec_n, spec_n, vecs, specs = count_vector_and_spec_files(program_roots + tooling_roots)
    return {
        "implementation_code": implementation,
        "program_code": program_code,
        "tooling_code": tooling_code,
        "test_total": test_total,
        "test_per_implementation": ratio,
        "test_split": dict(tests),
        "share_lines_ge_1000": ge1000,
        "files_holding_half": half,
        "vendored": prog["vendored"] + tool["vendored"],
        "locale": prog["locale"] + tool["locale"],
        "fuzz_targets_verify_set": fuzz_verify,
        "fuzz_targets_all_counted_crates": fuzz_all_program,
        "vector_files": vec_n,
        "spec_files": spec_n,
        "vector_file_list": vecs,
        "spec_file_list": specs,
        "crates": [
            {"name": n, "version": v, "commit": c, "role": r}
            for n, v, c, _, _, r in BLVM_CRATES
        ],
    }


def row_depth(slug: str):
    if slug == "blvm":
        roots = [Path(r) for _, _, _, r, _, role in BLVM_CRATES]
        git_root, git_rev = LANDING_GIT["blvm"]
        size = blvm_size()  # computed once by caller preferably
        return None  # filled in main
    root = Path(TREES[slug][0])
    rev = TREES[slug][1]
    tokei = Path(f"/tmp/eco-audit/tokei/{slug}.json")
    m = measure_trees(slug, [(slug, root, tokei)])
    fuzz = count_fuzz_from_roots([root])
    vec_n, spec_n, _, _ = count_vector_and_spec_files([root])
    wf, jobs, ci_note = parse_ci(root)
    complete, hist_note = history_complete_for_window(root, rev)
    rel_n, rel_note = releases_12m(root)
    releases_cell = cell(rel_n, note=rel_note) if rel_n is not None else cell(None, "not-measured", note=rel_note or hist_note)
    author_root, author_rev = root, rev
    author_extra = hist_note
    hist_alt = HIST_OVERRIDE.get(slug)
    if not complete and hist_alt and Path(hist_alt).exists():
        author_root, author_rev = Path(hist_alt), "HEAD"
        ok, alt_note = history_complete_for_window(author_root, author_rev)
        author_extra = "author history from a blobless clone, " + alt_note
        complete = True if ok else complete
        if not ok and alt_note:
            # A few days short of the window start is still reported, with the date.
            complete = True
            author_extra += " (window starts 2025-11-12; count may miss the first days)"
    if complete:
        authors = unique_authors(author_root, author_rev)
        authors_cell = cell(len(authors), note=author_extra)
    else:
        authors_cell = cell(None, "not-measured", note=hist_note)

    tests = m["tests"]
    return {
        "slug": slug,
        "name": NAMES[slug],
        "commit": rev,
        "measured_at": AS_OF,
        "fuzz_targets": cell(fuzz),
        "test_unit": cell(tests.get("unit", 0)),
        "test_integration": cell(tests.get("integration", 0)),
        "test_fuzz": cell(tests.get("fuzz", 0)),
        "test_property": cell(tests.get("property", 0)),
        "test_split_total": cell(m["test_total"]),
        "vector_files": cell(vec_n),
        "spec_files": cell(spec_n),
        "authors_12m": authors_cell,
        "releases_12m": releases_cell,
        "ci_workflows": cell(wf),
        "ci_jobs": cell(jobs, note=ci_note) if jobs is not None else cell(None, "not-measured", note=ci_note),
        "repo_set": "landing share repo (single tree)",
    }


PLUGINS = {
    "blvm": {
        "system": "yes",
        "own": 8,
        "independent": None,
        "independent_status": "not-found",
        "source": "docs/MODULE_SYSTEM.md and modules/README.md at blvm-node 36bb40c7e9a3f805274fa7e1bda30d0a6c082560. Official registry https://raw.githubusercontent.com/BTCDecoded/blvm/main/registry/modules.json fetched 2026-11-12 (eight BTCDecoded modules). Independently maintained modules: not found.",
    },
    "bitcoin-core": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "No loadable plugin API found. doc/multiprocess.md describes IPC for supplemental bitcoin-node and bitcoin-gui binaries, not third-party modules.",
    },
    "knots-legacy": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "Same Core IPC/multiprocess layout (doc/multiprocess.md, src/ipc/). No loadable plugin API found.",
    },
    "bit-block": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "Same Core IPC/multiprocess layout (doc/multiprocess.md, src/ipc/). No loadable plugin API found.",
    },
    "bitcoin-roots": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "Same Core IPC/multiprocess layout (doc/multiprocess.md, src/ipc/). No loadable plugin API found.",
    },
    "bitcoin-rs": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "No plugin or loadable module system found in the tree's docs at 9b8e91ae.",
    },
    "satd": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "No plugin or loadable module system found. In-tree MCP crate and webhooks are APIs, not loadable modules.",
    },
    "libbitcoin": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "README: a toolkit of separately cloned C++ libraries, not a runtime module system in this libbitcoin-system row.",
    },
    "hornet": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "No plugin or loadable module system found in the tree's docs at 151462fa.",
    },
    "floresta": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "Compile-time Cargo features only (zmq-server, metrics, tokio-console; default json-rpc enables compact-filters) in bin/florestad/Cargo.toml. No loadable plugin API found.",
    },
    "rbitcoin": {
        "system": "no",
        "own": 0,
        "independent": None,
        "independent_status": "not-found",
        "source": "No plugin or loadable module system found in the tree's docs at ca7bf804.",
    },
    "btcd": {
        "system": "partial",
        "own": 2,
        "independent": None,
        "independent_status": "not-found",
        "source": "database/README.md: designed for different database backends (default ffldb). blockchain/indexers/README.md: two optional in-tree indexers (tx-by-hash, tx-by-address). Not a third-party plugin API. Independently maintained modules: not found.",
    },
}


def plugin_fields(slug):
    p = PLUGINS[slug]
    ind_status = p["independent_status"]
    return {
        "plugin_system": cell(p["system"], text=p["system"]),
        "plugin_own": cell(p["own"]),
        "plugin_independent": cell(p["independent"], ind_status),
        "plugin_source": p["source"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="-")
    parser.add_argument("--size-out", default="")
    args = parser.parse_args()

    size = blvm_size()
    if args.size_out:
        Path(args.size_out).write_text(json.dumps(size, indent=2) + "\n")

    methods = {
        "test_split": (
            "tokei 14 code lines in programming languages only. A file under "
            "tests/, test/, e2e/, qa/, or functional/, or named *_test/_tests/"
            "test_*, counts as tests. Rust lines inside a #[cfg(test)] or "
            "#[cfg(all(..., test))] item count as tests. Partition: fuzz paths "
            "(fuzz/, fuzz_targets/, src/test/fuzz/); property (path or name "
            "contains property/proptest/quickcheck/hypothesis/orange_paper_property); "
            "C++ src/test as unit; remaining integration dirs as integration; "
            "other in-source tests as unit. Benches under bench(es)/ are grouped "
            "with unit. Vendored and locale paths are excluded."
        ),
        "fuzz_targets": (
            "Count of cargo-fuzz targets in fuzz/fuzz_targets/*.rs (excluding "
            "mod.rs) plus Bitcoin Core-style src/test/fuzz/*.cpp (excluding util "
            "helpers). Measured at the pinned checkout."
        ),
        "vector_files": (
            "Files whose path or name looks like a test vector (vector, tx_valid, "
            "tx_invalid, script_tests, sighash, bipN) with suffix .json, .csv, or .hex."
        ),
        "spec_files": (
            "Documentation or model files whose name looks like a spec "
            "(spec, THE_ORANGE_PAPER, orange paper, bipN) with suffix .md, .rst, "
            ".txt, .lean, or .tex. LICENSE and contributing files are excluded."
        ),
        "authors_12m": (
            f"Unique git author names (%aN) on the landing-share repo set from "
            f"{WINDOW_START} to {WINDOW_END} inclusive. Names are not merged. "
            "A shallow clone that does not reach the window start is not measured."
        ),
        "releases_12m": (
            f"Git tags whose creatordate falls in {WINDOW_START} to {WINDOW_END}. "
            "Annotated tags use the tagger date; lightweight tags use the tagged "
            "commit date."
        ),
        "ci_workflows": "Number of .github/workflows/*.{yml,yaml} files at the pin.",
        "ci_jobs": (
            "GitHub Actions jobs at the pin, expanding a static matrix of lists "
            "(including include/, minus exclude/). Dynamic ${{ }} matrices are "
            "not expanded and are noted."
        ),
        "plugin_system": (
            "yes / no / partial from the pinned tree's docs. own-team optional "
            "modules and independently maintained modules; not found when no source."
        ),
        "blvm_size": (
            "Default node first-party crates plus blvm-sdk (blvm-storage-fence "
            "lives in the node tree; blvm-sdk-macros lives in the sdk tree). "
            "blvm-spec-lock non-test lines are tooling. Tests include spec-lock "
            "tests. Same tokei 14 and #[cfg(test)] rules as test_split."
        ),
    }

    rows = []

    # BLVM
    git_root, git_rev = LANDING_GIT["blvm"]
    complete, hist_note = history_complete_for_window(Path(git_root), git_rev)
    if complete:
        authors = unique_authors(Path(git_root), git_rev)
        authors_cell = cell(len(authors), note="landing share repo: blvm-node only. " + hist_note)
        rel_n, rel_note = releases_12m(Path(git_root))
        releases_cell = cell(rel_n, note=rel_note + " (blvm-node tags)")
    else:
        authors_cell = cell(None, "not-measured", note=hist_note)
        releases_cell = cell(None, "not-measured", note=hist_note)
    wf, jobs, ci_note = parse_ci(Path("/tmp/eco-audit/src/blvm-node"))
    tests = size["test_split"]
    blvm_row = {
        "slug": "blvm",
        "name": "BLVM",
        "commit": "36bb40c7e9a3f805274fa7e1bda30d0a6c082560",
        "crates": size["crates"],
        "measured_at": AS_OF,
        "fuzz_targets": cell(
            size["fuzz_targets_verify_set"],
            note="node + protocol + consensus + muhash + sdk (same set as the verification cell)",
        ),
        "test_unit": cell(tests.get("unit", 0)),
        "test_integration": cell(tests.get("integration", 0)),
        "test_fuzz": cell(tests.get("fuzz", 0)),
        "test_property": cell(tests.get("property", 0)),
        "test_split_total": cell(size["test_total"]),
        "vector_files": cell(size["vector_files"]),
        "spec_files": cell(size["spec_files"]),
        "authors_12m": authors_cell,
        "releases_12m": releases_cell,
        "ci_workflows": cell(wf),
        "ci_jobs": cell(jobs, note=ci_note) if jobs is not None else cell(None, "not-measured", note=ci_note),
        "repo_set": "authors/releases/CI: landing share (blvm-node). test/fuzz/vectors: composite crate set",
    }
    blvm_row.update(plugin_fields("blvm"))
    rows.append(blvm_row)

    for slug in [
        "bitcoin-core", "knots-legacy", "bit-block", "bitcoin-roots",
        "bitcoin-rs", "satd", "libbitcoin", "hornet", "floresta", "rbitcoin", "btcd",
    ]:
        r = row_depth(slug)
        r.update(plugin_fields(slug))
        rows.append(r)

    doc = {
        "schema_version": 1,
        "as_of": AS_OF,
        "window_start": WINDOW_START,
        "window_end": WINDOW_END,
        "window_label": "last 12 months",
        "methods": methods,
        "rows": rows,
    }
    text = json.dumps(doc, indent=2) + "\n"
    if args.out == "-":
        print(text)
    else:
        Path(args.out).write_text(text)
        print(f"wrote {args.out}", flush=True)
        print(f"BLVM size: impl={size['implementation_code']:,} program={size['program_code']:,} "
              f"tooling={size['tooling_code']:,} tests={size['test_total']:,} "
              f"ratio={size['test_per_implementation']} ge1000={size['share_lines_ge_1000']}% "
              f"half={size['files_holding_half']} fuzz_verify={size['fuzz_targets_verify_set']}",
              flush=True)


if __name__ == "__main__":
    main()
