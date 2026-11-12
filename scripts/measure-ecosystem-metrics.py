#!/usr/bin/env python3
"""Measure comparable ecosystem stats from pinned checkouts (tokei 14).

Reproduces BLVM size/test buckets and adds depth metrics for every
implementation. Also scores the seven stability checks into data/stability.json.
Read-only against the trees; writes metrics JSON on stdout or --out.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

TOKEI = os.environ.get("TOKEI", "/workspace/uiux-eco/tools/bin/tokei")
REPO_ROOT = Path(__file__).resolve().parent.parent
# Local private mailmap, not shipped in this repository. Override with AUTHOR_MAILMAP.
DEFAULT_MAILMAP = Path("/home/box/agent-data/ui-ux/private/author-mailmap")
MAILMAP = Path(os.environ.get("AUTHOR_MAILMAP", DEFAULT_MAILMAP))
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
    # Hornet's extern/ holds test-only git submodules (googletest, benchmark).
    # They are excluded from first-party counts; the published vendored cell is
    # 0 when those directories are empty gitlinks, as they are at the pin.
    "hornet": ("extern/",),
    "rbitcoin": ("third_party/",),
    # libbitcoin has no vendor/ or third-party library subtree. src/crypto/secp256k1
    # is first-party libbitcoin code, not a bundled copy of libsecp256k1.
    "libbitcoin": (),
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


def is_bot_or_agent(name: str, email: str) -> bool:
    """Exclude bots and obvious agent identities from the human-author count."""
    n = name.lower().strip()
    e = email.lower().strip()
    if "[bot]" in n or "[bot]" in e:
        return True
    exact = {
        "merge-script",
        "github-actions",
        "github-actions[bot]",
        "dependabot[bot]",
        "cursor agent",
        "cursor[bot]",
        "claude",
        "grok bot engineer",
        "devin ai",
        "openai",
        "tau agent",
        "grok agent operator",
        "agent",
        "rearden-bitcoin-agent",
        "rbitcoin-grok",
        "rbitcoin-bot",
        "rbitcoin-auto",
        "rearden-grok[bot]",
        "rbitcoin-grok[bot]",
        "node refactor",
        "qodo-code-review[bot]",
        "gormes-agent[bot]",
        "coderabbitai[bot]",
        "copilot-swe-agent[bot]",
    }
    if n in exact:
        return True
    if n.startswith("rearden-grok") or n.startswith("rbitcoin-grok") or n.startswith("rbitcoin-bot"):
        return True
    if e in {
        "noreply@anthropic.com",
        "cursoragent@cursor.com",
        "engineer@grokbot.invalid",
        "noreply@openai.com",
    }:
        return True
    if e.startswith("bot@") or e.startswith("auto@") or e.startswith("agent@"):
        return True
    if "github-actions" in e or "dependabot" in e or "dependabot" in n:
        return True
    # Machine-local or job-runner mailboxes (bitcoin-rs: alpha@localhost,
    # omp@localhost, omp-worker@local, pr-repairs-11@omp).
    host = e.rsplit("@", 1)[-1] if "@" in e else ""
    if host in {"localhost", "local", "omp"}:
        return True
    if n in {"alpha", "omp", "omp-worker", "pr-repairs-11"}:
        return True
    return False


def unique_authors(cwd: Path, rev: str) -> tuple[list[str], int]:
    """Human authors after mailmap, bots and agents excluded.

    Returns (canonical names in first-seen order, raw unique %aN count before filter).
    """
    args = [
        "log",
        rev,
        f"--since={WINDOW_START}",
        f"--until={WINDOW_END}",
        "--format=%aN%x09%aE",
    ]
    # Apply a local private mailmap without writing into the source repo.
    # If the file is missing, do not fall back to unmerged names (that would
    # silently change the published counts).
    if not MAILMAP.is_file():
        raise FileNotFoundError(
            f"author mailmap not found at {MAILMAP}. "
            "Set AUTHOR_MAILMAP to a local mailmap file. "
            "Author counts are not measured because aliases would otherwise change silently."
        )
    out = git(cwd, "-c", f"mailmap.file={MAILMAP}", *args, "--use-mailmap", check=False)
    raw = git(cwd, "log", rev, f"--since={WINDOW_START}", f"--until={WINDOW_END}",
              "--format=%aN", check=False)
    raw_names = []
    raw_seen = set()
    for line in raw.splitlines():
        n = line.strip()
        if n and n not in raw_seen:
            raw_seen.add(n)
            raw_names.append(n)
    names = []
    seen = set()  # casefold
    for line in out.splitlines():
        if not line.strip():
            continue
        if "\t" in line:
            name, email = line.split("\t", 1)
        else:
            name, email = line, ""
        name, email = name.strip(), email.strip()
        if not name or is_bot_or_agent(name, email):
            continue
        key = name.casefold()
        if key not in seen:
            seen.add(key)
            names.append(name)
    return names, len(raw_names)


def measure_authors(cwd: Path, rev: str, extra_note: str = ""):
    """Human-author cell, or not-measured if the local mailmap is missing."""
    missing_note = (
        f"author mailmap not found at {MAILMAP}. Set AUTHOR_MAILMAP to a local "
        "mailmap file. Aliases were not merged, so this cell is not measured."
    )
    if extra_note:
        missing_note += " " + extra_note
    try:
        authors, raw_n = unique_authors(cwd, rev)
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        return cell(None, "not-measured", note=missing_note)
    note = (
        "human authors (known aliases merged, bots and agents excluded). "
        f"Raw unique %aN names before the filter: {raw_n}."
    )
    if extra_note:
        note += " " + extra_note
    return cell(len(authors), note=note)


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


def _skip_fuzz_path(rel: str) -> bool:
    return any(s in rel for s in ("/.git/", "/target/", "node_modules/"))


def _iter_text_files(root: Path, suffixes: set[str]):
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix not in suffixes:
            continue
        rel = str(p.relative_to(root)).replace("\\", "/")
        if _skip_fuzz_path("/" + rel):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        yield p, rel, text


# Declared C++ fuzz targets: FUZZ_TARGET( and wrappers such as
# FUZZ_TARGET_DESERIALIZE(. Skip #define lines and lines that continue a
# macro body (the previous line ends with a backslash), so the FUZZ_TARGET(
# that appears inside the DESERIALIZE wrapper definition is not counted.
FUZZ_TARGET_CALL = re.compile(r"\bFUZZ_TARGET(?:_\w+)?\s*\(")


def count_cpp_fuzz_invocations(text: str) -> int:
    n = 0
    continued = False
    for line in text.splitlines():
        is_define = bool(re.match(r"^\s*#\s*define\b", line))
        if not is_define and not continued:
            n += len(FUZZ_TARGET_CALL.findall(line))
        continued = line.rstrip().endswith("\\")
    return n
FUZZ_TARGET_MACRO = re.compile(r"\bfuzz_target!\s*[\(\{]")
GO_FUZZ_FUNC = re.compile(r"^func\s+(Fuzz\w+)\s*\(\s*f\s+\*testing\.F\s*\)", re.M)


def count_cargo_fuzz_bins(root: Path) -> list[str]:
    """Names of [[bin]] targets in cargo-fuzz Cargo.toml files under root."""
    names = []
    for p in root.rglob("Cargo.toml"):
        rel = str(p.relative_to(root)).replace("\\", "/")
        if _skip_fuzz_path("/" + rel):
            continue
        if "fuzz" not in rel.split("/"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        name = None
        in_bin = False
        for line in text.splitlines():
            if line.strip() == "[[bin]]":
                if name:
                    names.append(name)
                name = None
                in_bin = True
                continue
            if in_bin and line.startswith("[") and not line.startswith("[[bin]]"):
                if name:
                    names.append(name)
                in_bin = False
                name = None
                continue
            if in_bin:
                m = re.match(r'name\s*=\s*"([^"]+)"', line.strip())
                if m:
                    name = m.group(1)
        if in_bin and name:
            names.append(name)
    return names


def count_fuzz_from_roots(roots: list[Path]) -> tuple[int, str]:
    """Count declared fuzz targets, not merely files in a fuzz directory.

    C++: FUZZ_TARGET( macro invocations (exclude #define in fuzz.h).
    Go: func FuzzXxx(f *testing.F).
    Rust: cargo-fuzz [[bin]] entries when a fuzz Cargo.toml exists, otherwise
    fuzz_target! uses. The two Rust counts match on every tree measured here.
    """
    total = 0
    parts = []
    for root in roots:
        cpp = 0
        for _, rel, text in _iter_text_files(root, {".cpp", ".cc", ".h", ".hpp", ".c"}):
            cpp += count_cpp_fuzz_invocations(text)
        go = 0
        for _, rel, text in _iter_text_files(root, {".go"}):
            go += len(GO_FUZZ_FUNC.findall(text))
        bins = count_cargo_fuzz_bins(root)
        rust_bang = 0
        for _, rel, text in _iter_text_files(root, {".rs"}):
            rust_bang += len(FUZZ_TARGET_MACRO.findall(text))
        rust = len(bins) if bins else rust_bang
        n = cpp + go + rust
        total += n
        if n:
            bits = []
            if cpp:
                bits.append(f"{cpp} FUZZ_TARGET(")
            if go:
                bits.append(f"{go} FuzzXxx")
            if rust:
                how = "cargo-fuzz [[bin]]" if bins else "fuzz_target!"
                bits.append(f"{rust} {how}")
            parts.append(f"{root.name}: " + ", ".join(bits))
    note = "Declared fuzz targets at the pin. " + ("; ".join(parts) if parts else "none found")
    return total, note


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


def repair_workflow_yaml(text: str) -> str:
    """Quote unquoted run: scalars that contain ':' (invalid YAML, seen in bitcoin-rs main.yml)."""
    out = []
    for line in text.splitlines(True):
        m = re.match(r'^(\s+(?:-\s+)?run:\s+)([^\'"\n][^\n]*)$', line)
        if m and ":" in m.group(2):
            val = m.group(2).rstrip("\n")
            out.append(m.group(1) + json.dumps(val) + ("\n" if line.endswith("\n") else ""))
        else:
            out.append(line)
    return "".join(out)


def load_workflow(path: Path):
    raw = path.read_text(encoding="utf-8", errors="replace")
    try:
        import yaml
    except ImportError:
        return None, raw, "pyyaml-missing"
    try:
        return yaml.safe_load(raw) or {}, raw, None
    except Exception:
        try:
            return yaml.safe_load(repair_workflow_yaml(raw)) or {}, raw, "repaired-yaml"
        except Exception:
            return None, raw, "parse-error"


def _fromjson_ref(expr: str):
    """Return (job, output) for ${{ fromJSON(needs.JOB.outputs.KEY) }}, else None."""
    m = re.search(
        r"fromJSON\(\s*needs\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)\s*\)",
        expr or "",
    )
    if not m:
        return None
    return m.group(1), m.group(2)


def _json_literals(text: str):
    """Best-effort JSON object/array literals in a workflow script."""
    found = []
    for m in re.finditer(r"(\{[^{}]*\}|\[[^\[\]]*\])", text):
        s = m.group(1)
        try:
            found.append(json.loads(s))
        except Exception:
            continue
    return found


def resolve_dynamic_matrix(matrix, doc, raw, root: Path, wf_name: str, job_name: str):
    """Expand a fromJSON(needs.X.outputs.Y) matrix from in-file defaults or known sources.

    Uses the workflow's default non-PR event (schedule/push): the `all` or `*)`
    branch of an inlined case statement, PARTS env for shard lists, or
    cargo-fuzz [[bin]] names when the producer reads fuzz/Cargo.toml.
    Returns (count_or_None, note).
    """
    if isinstance(matrix, dict):
        # values may themselves be expressions
        if any(isinstance(v, str) and "${{" in v for v in matrix.values()):
            # product of resolved axes
            axes = []
            notes = []
            for k, v in matrix.items():
                if k in ("include", "exclude"):
                    continue
                if isinstance(v, str) and "${{" in v:
                    ref = _fromjson_ref(v)
                    n, note = _resolve_output(ref, doc, raw, root, wf_name) if ref else (None, "unresolved")
                    if n is None:
                        return None, note
                    axes.append(n)
                    notes.append(f"{k}:{note}")
                elif isinstance(v, list):
                    axes.append(len(v) if v else 1)
            n = 1
            for a in axes:
                n *= a
            inc = matrix.get("include")
            if isinstance(inc, list):
                n += len(inc)
            return n, "; ".join(notes) if notes else "axes expanded"
        return expand_matrix(matrix), "static matrix"
    if isinstance(matrix, str) and "${{" in matrix:
        ref = _fromjson_ref(matrix)
        if not ref:
            return None, "dynamic matrix expression not parsed"
        n, note = _resolve_output(ref, doc, raw, root, wf_name)
        return n, note
    return expand_matrix(matrix) if isinstance(matrix, dict) or not matrix else None, ""


def _resolve_output(ref, doc, raw, root: Path, wf_name: str):
    job_name, output = ref
    jobs = (doc or {}).get("jobs") or {}
    job = jobs.get(job_name) if isinstance(jobs, dict) else None
    job_raw = raw
    # Prefer explicit default-branch JSON in the same file.
    # satd mutants: env PARTS: '4' and default all parts [0,1,...,PARTS-1]
    m_parts = re.search(r"(?m)^\s+PARTS:\s*'(\d+)'", raw)
    if output in {"parts", "part"} and m_parts:
        n = int(m_parts.group(1))
        return n, f"{wf_name}: default {n} mutant parts from PARTS"

    # Default (non-PR) JSON arrays assigned in case *) or all) branches.
    # Capture `list='[...]'` / `arches='[...]'` / `all='{...}'` following a *) or all) arm.
    default_arrays = []
    for m in re.finditer(
        r"(?:\*\)|\ball\))\s*[^\n]*\n(?:[^\n]*\n){0,8}?.*?((?:list|arches|value|all|sanitizers|sanitizer_value)='(\{.*?\}|\[.*?\])')",
        raw,
        re.S,
    ):
        try:
            default_arrays.append(json.loads(m.group(2)))
        except Exception:
            pass

    # Named assignments near the output: all='{"include":[...]}' used for suite=all
    named = {}
    for m in re.finditer(
        r"\b(all|sanitizers|sanitizer_value|value|list|arches|parts)\s*=\s*'(\{.*?\}|\[.*?\])'",
        raw,
    ):
        try:
            named[m.group(1)] = json.loads(m.group(2))
        except Exception:
            continue

    # Roots nightly: linux-matrix <- all, sanitizer-matrix <- sanitizers, suite default all
    if output in {"linux-matrix", "value"} and "all" in named:
        return expand_matrix(named["all"]), f"{wf_name}: default suite=all linux matrix"
    if output in {"sanitizer-matrix", "sanitizers"} and "sanitizers" in named:
        return expand_matrix(named["sanitizers"]), f"{wf_name}: default suite=all sanitizer matrix"
    if output in {"flavors", "list"} and "list" in named:
        # last 'list=' in a *) branch is the non-PR default if we parsed several
        val = named["list"]
        if isinstance(val, list):
            return len(val), f"{wf_name}: default flavors {val}"
    if output == "arches" and "arches" in named:
        val = named["arches"]
        if isinstance(val, list):
            return len(val), f"{wf_name}: default arches {val}"

    # Producer reads cargo-fuzz bins (bitcoin-rs daily-fuzz.yml)
    if "fuzz/Cargo.toml" in raw and "tomllib" in raw:
        bins = count_cargo_fuzz_bins(root)
        if bins:
            return len(bins), f"{wf_name}: matrix from fuzz/Cargo.toml [[bin]] ({len(bins)})"

    return None, f"{wf_name}: could not resolve needs.{job_name}.outputs.{output}"


def parse_ci(root: Path) -> tuple[int | None, int | None, str, bool]:
    wfdir = root / ".github" / "workflows"
    if not wfdir.is_dir():
        return 0, 0, "no .github/workflows directory", False
    files = []
    for p in wfdir.iterdir():
        if p.suffix not in {".yml", ".yaml"} or not p.is_file():
            continue
        if p.name.endswith("-expanded.yml") or p.name.endswith("-expanded.yaml"):
            continue
        files.append(p)
    try:
        import yaml  # noqa: F401
    except ImportError:
        return len(files), None, "workflow files counted; PyYAML missing so jobs not expanded", True
    jobs = 0
    notes = []
    partial = False
    for p in files:
        doc, raw, err = load_workflow(p)
        if doc is None:
            notes.append(f"{p.name}: parse error")
            partial = True
            continue
        if err == "repaired-yaml":
            notes.append(f"{p.name}: parsed after quoting unquoted run: scalars")
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
            if not matrix:
                jobs += 1
                continue
            expanded, how = resolve_dynamic_matrix(matrix, doc, raw, root, p.name, jname)
            if expanded is None:
                jobs += 1
                partial = True
                notes.append(f"{p.name}/{jname}: matrix not expanded ({how}); counted as 1, lower bound")
            else:
                jobs += max(1, expanded)
                if how and how not in ("static matrix", "axes expanded"):
                    notes.append(f"{p.name}/{jname}: {how}")
    note = (
        "GitHub Actions workflow files at the pin. Jobs expand a static matrix "
        "of lists, and a fromJSON matrix when the default non-PR value is in "
        "the same file or is the tree's cargo-fuzz [[bin]] list."
    )
    if notes:
        # unique, short
        uniq = []
        for n in notes:
            if n not in uniq:
                uniq.append(n)
        note += " " + "; ".join(uniq[:12])
    if partial:
        note += " Status: partial (lower bound) because at least one matrix could not be fully expanded or a workflow failed to parse."
    return len(files), jobs, note, partial


def expand_matrix(matrix):
    if not matrix:
        return 1
    if not isinstance(matrix, dict):
        return None
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
    inc = matrix.get("include")
    exc = matrix.get("exclude")
    if lists:
        n = 1
        for L in lists:
            n *= L
        if isinstance(inc, list):
            n += len(inc)
    elif isinstance(inc, list):
        # include-only: each include entry is one job (no implicit default combo)
        n = len(inc)
    else:
        n = 1
    if isinstance(exc, list):
        n = max(0, n - len(exc))
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
#   git clone --bare --filter=blob:none --shallow-since=2025-10-01 --single-branch \
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
    fuzz_all_program, _fuzz_all_note = count_fuzz_from_roots(program_roots + tooling_roots)
    fuzz_verify, fuzz_verify_note = count_fuzz_from_roots(fuzz_roots)
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
        "fuzz_targets_verify_note": fuzz_verify_note,
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
    fuzz, fuzz_note = count_fuzz_from_roots([root])
    vec_n, spec_n, _, _ = count_vector_and_spec_files([root])
    wf, jobs, ci_note, ci_partial = parse_ci(root)
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
        complete = ok
    if complete:
        authors_cell = measure_authors(author_root, author_rev, author_extra)
    else:
        authors_cell = cell(None, "not-measured", note=hist_note)

    tests = m["tests"]
    insource = tests.get("unit", 0)
    folder = tests.get("integration", 0)
    split_note = (
        "Folder split, not a unit-vs-integration classification: in-source tests "
        "are tests next to program sources (including in-file #[cfg(test)] and "
        "C++ src/test); test-folder tests are files under tests/, test/, e2e/, "
        "qa/, or functional/."
    )
    ci_status = "partial" if ci_partial else "measured"
    ci_text = (f"{jobs:,} (partial)" if ci_partial and jobs is not None else None)
    return {
        "slug": slug,
        "name": NAMES[slug],
        "commit": rev,
        "measured_at": AS_OF,
        "fuzz_targets": cell(fuzz, note=fuzz_note),
        "test_insource": cell(insource, note=split_note),
        "test_folder": cell(folder, note=split_note),
        "test_unit": cell(insource, note="Deprecated alias of test_insource. " + split_note),
        "test_integration": cell(folder, note="Deprecated alias of test_folder. " + split_note),
        "test_fuzz": cell(tests.get("fuzz", 0)),
        "test_property": cell(tests.get("property", 0)),
        "test_split_total": cell(sum(tests.values()) if tests else 0),

        "vector_files": cell(vec_n),
        "spec_files": cell(spec_n),
        "authors_12m": authors_cell,
        "releases_12m": releases_cell,
        "ci_workflows": cell(wf),
        "ci_jobs": cell(jobs, ci_status, text=ci_text, note=ci_note) if jobs is not None else cell(None, "not-measured", note=ci_note),
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


# --- Stability checklist (data/stability.json) --------------------------------
# Seven pass/fail checks plus a descriptive upstream-track tag. The file shape
# matches the #6 renderer schema: each check is {status, evidence_url, retrieved}
# and a tag is {status, tag, evidence_url, retrieved}, or {status: n/a, reason}
# when the row does not track an upstream line. Score is met out of 7;
# not_measured stays in the denominator. "Tracks an upstream line" is not scored.
# Definition ids, labels and why-text are the ones the renderer and charts read.

ET = ZoneInfo("America/New_York")
STABILITY_STATUSES = {
    "met": "The criterion holds, with an evidence link",
    "not_met": "The criterion was checked and does not hold, with an evidence link",
    "not_measured": "No reading yet; never read as not met",
}
STABILITY_SCORE_RULE = (
    "Score = met / total criteria, with not measured counted in the total so it "
    "never inflates a score. Shown as N of 7 met, K not measured. Tracks an "
    "upstream line is descriptive and not scored."
)
STABILITY_DEFINITION_SCHEMA = {
    "id": "short snake_case id",
    "label": "what the criterion asks, in plain words",
    "why": "one line on why it matters for a node operator",
    "type": "check (scored met / not_met / not_measured) or tag (descriptive, not scored; for example tracks_upstream_line, forks only)",
}
STABILITY_ROW_SCHEMA = {
    "criteria": {
        "<check id>": {
            "status": "met | not_met | not_measured",
            "evidence_url": "https URL pinned to a commit, tag or release; required unless not_measured",
            "retrieved": "YYYY-MM-DD",
        },
        "<tag id>": {
            "status": "tag | n/a | not_measured",
            "tag": "short descriptive value, e.g. the upstream release line",
            "evidence_url": "https URL; required unless not_measured",
            "retrieved": "YYYY-MM-DD",
            "reason": "required for n/a",
        },
    }
}
# Ids and labels follow the research brief section 3. The PR #6 schema
# example used tracks_upstream_line for the tag; the brief's id is upstream_track.
# Ids, labels and why-text are those already on main from #6, which the
# renderer and charts display. The brief's tag id is upstream_track.
STABILITY_DEFINITION = [
    {
        "id": "has_stable_release",
        "label": "tagged non-pre release",
        "why": "A project that has never cut a non-prerelease tagged release has no stable artifact for operators to pin.",
        "type": "check",
    },
    {
        "id": "docs_not_pre_release",
        "label": "docs not pre-release",
        "why": "The project’s own operator-facing docs are the right place to read a maturity claim, not our grade and not Untangled’s Status field.",
        "type": "check",
    },
    {
        "id": "stable_release_in_12m",
        "label": "stable release in 12m",
        "why": "A past stable tag is not the same as a release still being cut. Operators need a current channel.",
        "type": "check",
    },
    {
        "id": "version_or_lts_policy",
        "label": "version ≥1.0 or LTS",
        "why": "SemVer treats 0.y.z as initial development, not a stable public API.",
        "type": "check",
    },
    {
        "id": "vulnerability_disclosure",
        "label": "vuln disclosure",
        "why": "A stable node needs a published way to report a consensus or security bug privately.",
        "type": "check",
    },
    {
        "id": "release_notes",
        "label": "release notes",
        "why": "Operators need a human-readable summary of what changed, not a tag and not a git log.",
        "type": "check",
    },
    {
        "id": "signed_or_reproducible",
        "label": "signed or reproducible",
        "why": "A release that cannot be verified is not a trustworthy stable channel, even if the tag exists.",
        "type": "check",
    },
    {
        "id": "upstream_track",
        "label": "tracks an upstream line",
        "why": "For forks only: which line the fork follows. Descriptive, not scored.",
        "type": "tag",
    },
]
RESERVED_STABILITY_ROWS = {
    "bitcoin-untangled": {
        "name": "Bitcoin Untangled",
        "on_page": False,
        "note": (
            "Row reserved. Bitcoin Untangled has no lineage, governance or "
            "verification row on this page yet, so it has no card; its "
            "stability cells show here once measured."
        ),
        "criteria": {},
    }
}
# Documented download-site signed SUMS for the latest stable version.
# {version} is the numeric leading x.y (or x.y.z) taken from the tag, without a v prefix.
DOWNLOAD_SUMS = {
    "bitcoin-core": "https://bitcoincore.org/bin/bitcoin-core-{version}/SHA256SUMS.asc",
}
GUIX_SIGS = {
    "bitcoin-core": "https://github.com/bitcoin-core/guix.sigs",
}
LTS_PAGES = {
    "bitcoin-core": "https://bitcoincore.org/en/lifecycle/#schedule",
}

PRE_TAG = re.compile(
    r"(?i)(^|[.\-_/])(alpha|beta|rc\d*|pre|preview|dev|nightly|snapshot)([.\-_/]|$)|rc\d+$"
)
VERSION_RE = re.compile(r"(?i)^v?(\d+)\.(\d+)")
AUTOMATED_NOTES = re.compile(r"(?i)^\s*automated release of \S+\.?\s*$")
GIT_LOG_NOTES = re.compile(
    r"(?m)^(commit [0-9a-f]{40}|Author: |Date: |\* [0-9a-f]{7,}\s+\S)"
)
# Project-level current-state claims. Feature-level "experimental" and
# remarks about the master/development branch are ignored by the scanner.
PRE_RELEASE_CLAIM = re.compile(
    r"(?is)("
    r"not\s+(?:suitable\s+for|for|intended\s+for)\s+production"
    r"|not\s+production[-\s]?ready"
    r"|pre[-\s]?production"
    r"|pre[-\s]?1\.0"
    r"|development\s+candidate"
    r"|in\s+an?\s+(?:alpha|beta)\s+state"
    r"|\bin\s+a\s+beta\s+state\b"
    r"|(?:this\s+project\s+is\s+currently\s+under\s+(?:active\s+)?development)"
    r"|(?:^|[.!?]\s+)(?:(?:this\s+project|the\s+software|it)\s+is\s+)?(?:still\s+)?(?:in|under)\s+development\b"
    r"|no\s+(?:parity,\s+)?production(?:\s*,\s*|\s+or\s+)?(?:or\s+)?(?:mainnet\s+)?claims"
    r"|no\s+production(?:\s+or\s+mainnet)?(?:\s+or\s+mainnet)?\s+claims"
    r"|(?:this\s+)?(?:implementation|software|project)\s+is\s+(?:alpha|beta|experimental|unstable)"
    r"|0\.x\s+experimental(?:\s+line)?"
    r"|experimental\s+line"
    r")"
)
PRE_1_0_PLANNED = re.compile(
    r"(?is)(\b1\.0\b.{0,160}(planned|support\s+window)|(support\s+window|signed\s+release\s+binaries).{0,160}\b1\.0\b)"
)
MASTER_BRANCH_TALK = re.compile(
    r"(?i)\b(master|main|development)\s+branch\b"
)
FEATURE_EXPERIMENTAL = re.compile(
    r"(?i)\b(experimental\s+bip|bip\d+\b.{0,40}experimental|rpc\b.{0,40}experimental|"
    r"optional\s+\w+.{0,20}experimental|are experimental|behind .{0,40}not recommended for production)\b"
)
SECURITY_PATHS = (
    "SECURITY.md",
    ".github/SECURITY.md",
    "docs/SECURITY.md",
    "doc/SECURITY.md",
    "security.md",
)
README_PATHS = (
    "README.md",
    "README.rst",
    "README",
    "docs/README.md",
    "doc/README.md",
)
NOTES_CANDIDATES = (
    "doc/release-notes.md",
    "docs/release-notes.md",
    "CHANGELOG.md",
    "CHANGELOG",
    "NEWS.md",
    "NEWS",
    "CHANGES.md",
)
SIG_ASSET = re.compile(r"(?i)(\.(asc|sig|minisig)$|SHA(256|512)SUMS\.asc$)")
GITHUB_REMOTE = re.compile(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", re.I)

_GH_CACHE: dict[str, object] = {}


def _check(status, evidence_url=None):
    cell = {"status": status}
    if status != "not_measured":
        cell["evidence_url"] = evidence_url
        cell["retrieved"] = AS_OF
    return cell


def _tag_cell(tag, evidence_url, reason=None):
    """A scored-check companion for the descriptive upstream_track tag.

    The #6 renderer accepts status "tag" (needs tag + https evidence_url),
    "n/a" (needs reason, no evidence_url), or "not_measured".
    """
    if tag == "n/a":
        return {"status": "n/a", "reason": reason or "independent tree"}
    if tag == "not-found":
        return {
            "status": "n/a",
            "reason": reason or "README at the pin does not state a base line",
        }
    return {
        "status": "tag",
        "tag": tag,
        "evidence_url": evidence_url,
        "retrieved": AS_OF,
    }


def pin_for(slug: str) -> tuple[Path, str]:
    if slug == "blvm":
        root, rev = LANDING_GIT["blvm"]
        return Path(root), rev
    root, rev = TREES[slug]
    return Path(root), rev


def parse_github_repo(url: str) -> str | None:
    m = GITHUB_REMOTE.search((url or "").strip())
    if not m:
        return None
    return f"{m.group(1)}/{m.group(2)}"


def origin_repo(cwd: Path) -> str | None:
    return parse_github_repo(git(cwd, "remote", "get-url", "origin", check=False))


def gh_api(endpoint: str, default=None, paginate=False):
    """GET a GitHub API path with the already-authenticated gh CLI. Never logs tokens."""
    key = ("GET", endpoint, paginate)
    if key in _GH_CACHE:
        return _GH_CACHE[key]
    cmd = ["gh", "api"]
    if paginate:
        cmd.append("--paginate")
    cmd.append(endpoint)
    r = subprocess.run(cmd, text=True, capture_output=True)
    if r.returncode != 0:
        _GH_CACHE[key] = default
        return default
    try:
        data = json.loads(r.stdout) if r.stdout.strip() else default
    except json.JSONDecodeError:
        data = default
    _GH_CACHE[key] = data
    return data


def canonical_repo(cwd: Path) -> str | None:
    origin = origin_repo(cwd)
    if not origin:
        return None
    data = gh_api(f"repos/{origin}", default=None)
    if isinstance(data, dict) and data.get("full_name"):
        return data["full_name"]
    return origin


def github_url(repo: str, *parts: str) -> str:
    return "https://github.com/" + "/".join([repo, *parts])


def blob_url(repo: str, rev: str, path: str) -> str:
    return github_url(repo, "blob", rev, path)


def release_url(repo: str, tag: str) -> str:
    return github_url(repo, "releases", "tag", tag)


def to_et_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            try:
                return date.fromisoformat(text[:10])
            except ValueError:
                return None
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ET).date()


def in_window(d: date | None) -> bool:
    if d is None:
        return False
    return date.fromisoformat(WINDOW_START) <= d <= date.fromisoformat(WINDOW_END)


def is_prerelease_tag(name: str) -> bool:
    if name.lower().startswith("untagged-"):
        return True
    if "/" in name:
        return True
    return bool(PRE_TAG.search(name))


def git_show(cwd: Path, rev: str, path: str) -> str | None:
    r = subprocess.run(
        ["git", "-C", str(cwd), "cat-file", "-e", f"{rev}:{path}"],
        capture_output=True,
    )
    if r.returncode != 0:
        return None
    return git(cwd, "show", f"{rev}:{path}", check=False)


def list_tree_paths(cwd: Path, rev: str, prefix: str = "") -> list[str] | None:
    args = ["ls-tree", "-r", "--name-only", rev]
    if prefix:
        args.append(prefix)
    out = git(cwd, *args, check=False)
    # Distinguish empty tree from git failure: git() returns "" on failure too.
    r = subprocess.run(
        ["git", "-C", str(cwd), "ls-tree", "-r", "--name-only", rev],
        text=True,
        capture_output=True,
    )
    if r.returncode != 0:
        return None
    paths = [ln for ln in r.stdout.splitlines() if ln]
    if prefix:
        paths = [p for p in paths if p.startswith(prefix)]
    return paths


def local_tag_records(cwd: Path) -> list[dict] | None:
    r = subprocess.run(
        [
            "git", "-C", str(cwd), "for-each-ref",
            "--format=%(creatordate:iso-strict)%09%(objecttype)%09%(refname:short)",
            "refs/tags",
        ],
        text=True,
        capture_output=True,
    )
    if r.returncode != 0:
        return None
    rows = []
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        when, _kind, name = parts
        if "/" in name:
            continue
        rows.append({"name": name, "date": to_et_date(when)})
    return rows


def http_ok(url: str) -> bool | None:
    """True/False if the URL could be fetched; None if the request itself failed."""
    req = Request(url, method="GET", headers={"User-Agent": "commons-website-stability-check"})
    try:
        with urlopen(req, timeout=20) as resp:
            return 200 <= getattr(resp, "status", 200) < 300
    except HTTPError as exc:
        if exc.code == 404:
            return False
        return None
    except (URLError, TimeoutError, OSError):
        return None


def collect_stable_releases(slug: str, cwd: Path, repo: str | None) -> tuple[list[dict], str | None]:
    """Return (stable releases newest-first, error if nothing could be read)."""
    releases = None
    if repo:
        releases = gh_api(f"repos/{repo}/releases?per_page=100", default=None, paginate=True)
        if releases is not None and not isinstance(releases, list):
            releases = None
    tags = local_tag_records(cwd)
    api_tags = None
    if repo and tags is None:
        api_tags = gh_api(f"repos/{repo}/tags?per_page=100", default=None, paginate=True)
        if isinstance(api_tags, list):
            tags = [{"name": t.get("name", ""), "date": None} for t in api_tags if t.get("name")]
        else:
            api_tags = None
    if releases is None and tags is None:
        return [], "releases API and local/API tags could not be read"
    tag_names = {t["name"] for t in (tags or [])}
    tag_dates = {t["name"]: t.get("date") for t in (tags or [])}
    # Also accept tags only visible via the API when the local clone missed some.
    if repo and tags is not None:
        extra = gh_api(f"repos/{repo}/tags?per_page=100", default=None, paginate=True)
        if isinstance(extra, list):
            for t in extra:
                name = t.get("name") or ""
                if name and name not in tag_names and "/" not in name:
                    tag_names.add(name)
                    tag_dates.setdefault(name, None)

    found: dict[str, dict] = {}

    def remember(tag, when, url, body, assets, from_gh):
        if not tag or tag.lower().startswith("untagged-") or "/" in tag:
            return
        rec = {
            "tag": tag,
            "date": when,
            "url": url or (release_url(repo, tag) if repo else None),
            "body": body or "",
            "assets": assets or [],
            "from_github_release": from_gh,
        }
        prev = found.get(tag)
        if prev is None or (from_gh and not prev["from_github_release"]):
            if prev and rec["date"] is None:
                rec["date"] = prev["date"]
            found[tag] = rec
        elif prev["date"] is None and when is not None:
            prev["date"] = when

    for rel in releases or []:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        tag = rel.get("tag_name") or ""
        if rel.get("prerelease") or is_prerelease_tag(tag):
            # A prerelease GitHub flag or name does not count, even if a tag exists.
            continue
        if tag_names and tag not in tag_names:
            continue
        remember(
            tag,
            to_et_date(rel.get("published_at")) or tag_dates.get(tag),
            rel.get("html_url") or (release_url(repo, tag) if repo else None),
            rel.get("body") or "",
            [a.get("name") or "" for a in (rel.get("assets") or []) if a.get("name")],
            True,
        )

    # Tags without (or in addition to) GitHub Releases, including a current
    # v4 line when only an older v3 GitHub Release exists (libbitcoin).
    if not releases:
        tag_source = tags or []
    else:
        tag_source = tags or []
    for t in tag_source:
        name = t["name"]
        if is_prerelease_tag(name):
            continue
        # If a GitHub release exists for this tag and was marked prerelease,
        # it was skipped above and must stay out.
        remember(
            name,
            t.get("date") or tag_dates.get(name),
            release_url(repo, name) if repo else None,
            "",
            [],
            False,
        )
        # If we already stored a GitHub release for this tag, remember() keeps it.

    # If a GitHub release for a tag was prerelease=true, drop any tag-only copy.
    if releases:
        pre = {
            (rel.get("tag_name") or "")
            for rel in releases
            if isinstance(rel, dict) and not rel.get("draft") and rel.get("prerelease")
        }
        for name in list(found):
            if name in pre:
                del found[name]

    items = list(found.values())

    def sort_key(rec):
        d = rec["date"] or date.min
        return (d, 1 if rec["from_github_release"] else 0, rec["tag"])

    items.sort(key=sort_key, reverse=True)
    return items, None


def leading_version(tag: str) -> tuple[int, int, str] | None:
    m = VERSION_RE.match(tag)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), f"{int(m.group(1))}.{int(m.group(2))}"


def core_family_version(tag: str) -> str | None:
    """Numeric version used in Core-family download paths (32.1 from v32.1)."""
    m = re.match(r"(?i)^v?(\d+\.\d+(?:\.\d+)?)", tag)
    return m.group(1) if m else None


def scan_docs_for_prerelease(texts: list[tuple[str, str]]) -> tuple[str, str] | None:
    """Return (path, short quote) if a current-state pre-release claim is found."""
    for path, text in texts:
        if not text:
            continue
        # Walk paragraphs so a feature-level "experimental" does not smear.
        parts = re.split(r"\n{2,}", text)
        for part in parts:
            stripped = part.strip()
            if not stripped:
                continue
            if FEATURE_EXPERIMENTAL.search(stripped) and not PRE_RELEASE_CLAIM.search(stripped):
                continue
            if MASTER_BRANCH_TALK.search(stripped) and re.search(
                r"(?i)not guaranteed to be\s+(?:completely\s+)?stable", stripped
            ):
                continue
            # Generic principle, not a self-label (satd).
            if re.search(r"(?i)an unstable node that (?:doesn'?t|does not) work", stripped):
                stripped = PRE_RELEASE_CLAIM.sub("", stripped)
            m = PRE_RELEASE_CLAIM.search(stripped)
            if m:
                quote = re.sub(r"\s+", " ", m.group(0)).strip()
                return path, quote[:200]
            if PRE_1_0_PLANNED.search(stripped) and re.search(
                r"(?i)(support window|hardening|signed release binaries).{0,160}1\.0|1\.0.{0,160}(planned|support window)",
                stripped,
            ):
                return path, "1.0 support/hardening described as planned (current line is pre-1.0)"
    return None


def is_product_version_tag(tag: str) -> bool:
    """True for tags that start with a product version (v32.1, V3.1, 0.7.1)."""
    return bool(re.match(r"(?i)^v?\d+\.\d+", tag or ""))


def latest_product_release(stable: list[dict]) -> dict | None:
    """Newest stable tag that looks like a product version; else newest stable."""
    for rec in stable:
        if is_product_version_tag(rec.get("tag") or ""):
            return rec
    return stable[0] if stable else None


def notes_substance(text: str) -> str:
    """Strip boilerplate so an automated stub plus a git-compare link does not count."""
    body = text or ""
    lines = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^#+\s*", line):
            line = re.sub(r"^#+\s*", "", line).strip()
            # Bare version headings ("v0.1.92", "Changes") are not notes.
            if re.match(r"(?i)^v?\d+\.\d+[\w.-]*$", line) or re.match(r"(?i)^(changes|changelog|release notes)$", line):
                continue
        if AUTOMATED_NOTES.match(line):
            continue
        if re.search(r"(?i)published to crates\.io", line):
            continue
        if re.search(r"(?i)^see (the )?(commit history|git log|full (changelog|diff|history))", line):
            continue
        if re.search(r"(?i)github\.com/[^/]+/[^/]+/compare/", line) and re.search(r"(?i)^(see |changes)", line):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def human_release_notes(text: str) -> bool:
    body = (text or "").strip()
    if not body:
        return False
    if GIT_LOG_NOTES.search(body) and len(re.findall(r"(?m)^commit [0-9a-f]{40}", body)) >= 2:
        return False
    substance = notes_substance(body)
    if not substance:
        return False
    compact = re.sub(r"\s+", " ", substance).strip()
    # Tag-only messages like "Add release build tags., regenerate." are not a
    # summary of major changes.
    if len(compact) < 80 and compact.count(".") <= 2 and "\n" not in substance:
        return False
    if len(compact) >= 80 or substance.count("\n") >= 2 or compact.count(".") >= 2:
        return True
    return False


def notes_from_tree(cwd: Path, rev: str, tag: str) -> tuple[str, str] | None:
    versions = {tag}
    if tag.startswith(("v", "V")):
        versions.add(tag[1:])
    else:
        versions.add("v" + tag)
        versions.add("V" + tag)
    ver = core_family_version(tag)
    if ver:
        versions.add(ver)
    tree = list_tree_paths(cwd, rev)
    if tree is None:
        # Fall back to well-known paths only; caller treats a total fetch
        # failure separately when even these are unreadable.
        tree = list(NOTES_CANDIDATES)
        fallback = True
    else:
        fallback = False
    wanted = []
    for path in tree:
        base = path.rsplit("/", 1)[-1]
        lower = path.lower()
        if any(
            lower.startswith(prefix) and any(v.lower() in base.lower() for v in versions)
            for prefix in (
                "doc/release-notes/",
                "docs/release-notes/",
                "doc/release-notes-",
            )
        ):
            wanted.append(path)
        elif path in NOTES_CANDIDATES or base in ("CHANGELOG.md", "CHANGELOG", "NEWS", "NEWS.md"):
            wanted.append(path)
    # Always try the well-known files.
    for path in NOTES_CANDIDATES:
        if path not in wanted:
            wanted.append(path)
    for path in wanted:
        text = git_show(cwd, rev, path)
        if text is None:
            continue
        base = path.rsplit("/", 1)[-1]
        if any(v.lower() in base.lower() for v in versions) and human_release_notes(text):
            return path, text
        # CHANGELOG / NEWS / combined notes file: a section headed with this version.
        if any(k in base.upper() for k in ("CHANGELOG", "NEWS", "RELEASE-NOTES", "RELEASE_NOTES")):
            for v in versions:
                sec = re.search(
                    rf"(?ims)^(?:#+|\*+)\s*\[?v?{re.escape(v.lstrip('vV'))}\]?.*?(?=^(?:#+|\*+)\s|\Z)",
                    text,
                )
                if sec and human_release_notes(sec.group(0)):
                    return path, sec.group(0)
    if fallback and not any(git_show(cwd, rev, p) is not None for p in NOTES_CANDIDATES):
        return None
    return None


def has_report_path(text: str) -> bool:
    if not text or not text.strip():
        return False
    return bool(re.search(
        r"(?i)(security@|report|vulnerabilit|responsible disclosure|security advisory|"
        r"hackerone|github.com/.+/security|please email|contact)",
        text,
    ))


def has_sig_assets(names: list[str]) -> bool:
    return any(SIG_ASSET.search(n) for n in names if n)


def sums_match_assets(cwd: Path, rev: str, names: list[str]) -> bool | None:
    """If a SHA256SUMS/SHA512SUMS asset list is readable, require listed names to overlap published artifacts."""
    return None  # GH asset names are already in `names`; mismatch check needs the sums body.


def measure_one_stability(slug: str) -> dict:
    cwd, rev = pin_for(slug)
    criteria: dict[str, dict] = {}
    if not cwd.is_dir():
        nm = _check("not_measured")
        for item in STABILITY_DEFINITION:
            if item["type"] == "check":
                criteria[item["id"]] = dict(nm)
            else:
                criteria[item["id"]] = {"status": "not_measured"}
        return {"name": NAMES[slug], "criteria": criteria}

    repo = canonical_repo(cwd)
    repo_home = f"https://github.com/{repo}" if repo else None
    releases_page = f"{repo_home}/releases" if repo else None
    pin_url = blob_url(repo, rev, "README.md") if repo else None

    # --- S1 / S3 pool ---
    stable, read_err = collect_stable_releases(slug, cwd, repo)
    latest = latest_product_release(stable)
    latest_url = (latest or {}).get("url") or releases_page or repo_home
    in_win = [r for r in stable if in_window(r.get("date"))]
    in_win_product = [r for r in in_win if is_product_version_tag(r.get("tag") or "")] or in_win
    dates_known = any(r.get("date") is not None for r in stable)

    if read_err:
        criteria["has_stable_release"] = _check("not_measured")
        criteria["stable_release_in_12m"] = _check("not_measured")
    else:
        criteria["has_stable_release"] = _check(
            "met" if stable else "not_met",
            latest_url if stable else releases_page or repo_home,
        )
        if stable and not dates_known and not in_win:
            criteria["stable_release_in_12m"] = _check("not_measured")
        else:
            ev = ((in_win_product[0]["url"] if in_win_product else None)
                  or latest_url or releases_page or repo_home)
            criteria["stable_release_in_12m"] = _check("met" if in_win else "not_met", ev)

    # --- S2 docs ---
    docs = []
    docs_failed = 0
    docs_tried = 0
    for path in README_PATHS + ("SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md", "doc/SECURITY.md", "security.md"):
        # Only the S2 set: README variants + SECURITY.md (any of the usual locations).
        pass
    s2_paths = README_PATHS + SECURITY_PATHS
    any_success = False
    readme_or_security_present = False
    for path in s2_paths:
        docs_tried += 1
        text = git_show(cwd, rev, path)
        if text is None:
            # Missing file is not a fetch failure.
            continue
        any_success = True
        if path.upper().endswith("README.MD") or path in ("README", "README.rst") or path.endswith("README.md") or path.upper().endswith("SECURITY.MD") or path.endswith("security.md"):
            readme_or_security_present = True
        docs.append((path, text))
    # If the pin is readable at all, a missing README is still a completed check.
    pin_readable = git(cwd, "cat-file", "-t", rev, check=False) == "commit"
    if not pin_readable:
        criteria["docs_not_pre_release"] = _check("not_measured")
    else:
        hit = scan_docs_for_prerelease(docs)
        if hit:
            path, _quote = hit
            criteria["docs_not_pre_release"] = _check("not_met", blob_url(repo, rev, path) if repo else pin_url)
        else:
            ev_path = docs[0][0] if docs else "README.md"
            ev = blob_url(repo, rev, ev_path) if repo else pin_url
            # Prefer the primary README when met.
            for cand in ("README.md", "README.rst", "README"):
                if any(p == cand for p, _ in docs):
                    ev = blob_url(repo, rev, cand) if repo else ev
                    break
            criteria["docs_not_pre_release"] = _check("met", ev or repo_home)

    # --- S4 version or LTS ---
    ver = leading_version(latest["tag"]) if latest else None
    lts_url = LTS_PAGES.get(slug)
    lts_ok = None
    # In-tree lifecycle / supported-releases / LTS policy at the pin.
    tree = list_tree_paths(cwd, rev) if pin_readable else None
    policy_hit = None
    policy_content = re.compile(
        r"(?i)(supported\s+versions?|support\s+(schedule|window|policy)|"
        r"long[- ]term\s+support|\bLTS\b|end[- ]of[- ]life|\bEOL\b|"
        r"lifecycle\s+schedule)"
    )
    if tree is not None:
        for path in tree:
            low = path.lower()
            base = path.rsplit("/", 1)[-1].lower()
            # Word-bounded path tokens only (do not match "lts" inside "altstack").
            if not re.search(r"(?i)(^|/)(lifecycle|supported[-_]?releases|lts)(/|\.|$)", low):
                continue
            if not base.endswith((".md", ".rst", ".txt", ".html")):
                continue
            body = git_show(cwd, rev, path) or ""
            # A file named lifecycle.md about process start/stop is not an
            # operator support schedule.
            if policy_content.search(body):
                policy_hit = path
                break
    if lts_url:
        lts_ok = http_ok(lts_url)
    if not pin_readable and ver is None and lts_ok is None and tree is None:
        criteria["version_or_lts_policy"] = _check("not_measured")
    elif ver and ver[0] >= 1:
        criteria["version_or_lts_policy"] = _check("met", latest_url)
    elif lts_ok or policy_hit:
        ev = lts_url if lts_ok else (blob_url(repo, rev, policy_hit) if repo and policy_hit else latest_url or repo_home)
        criteria["version_or_lts_policy"] = _check("met", ev)
    elif ver is None and tree is None and (lts_url and lts_ok is None):
        criteria["version_or_lts_policy"] = _check("not_measured")
    else:
        ev = latest_url or (blob_url(repo, rev, "README.md") if repo else repo_home)
        criteria["version_or_lts_policy"] = _check("not_met", ev)

    # --- S5 vulnerability disclosure ---
    sec_path = None
    sec_text = None
    for path in SECURITY_PATHS:
        text = git_show(cwd, rev, path)
        if text is not None:
            sec_path, sec_text = path, text
            break
    if sec_path is not None:
        # A file in the tree is enough; still record it when a report path is present.
        ev = blob_url(repo, rev, sec_path) if repo else repo_home
        criteria["vulnerability_disclosure"] = _check("met", ev)
    else:
        profile = gh_api(f"repos/{repo}/community/profile", default=None) if repo else None
        sec_file = None
        if isinstance(profile, dict):
            files = profile.get("files") or {}
            sec_file = (files.get("security") or None)
        if isinstance(sec_file, dict) and (sec_file.get("url") or sec_file.get("html_url")):
            ev = sec_file.get("html_url") or (f"{repo_home}/security/policy" if repo else None)
            criteria["vulnerability_disclosure"] = _check("met", ev)
        elif pin_readable and (profile is not None or not repo):
            ev = f"{repo_home}/security/policy" if repo else repo_home
            criteria["vulnerability_disclosure"] = _check("not_met", ev)
        elif not pin_readable and profile is None:
            criteria["vulnerability_disclosure"] = _check("not_measured")
        else:
            ev = f"{repo_home}/security/policy" if repo else repo_home
            criteria["vulnerability_disclosure"] = _check("not_met", ev)

    # --- S6 release notes ---
    if read_err and not latest:
        criteria["release_notes"] = _check("not_measured")
    elif not latest:
        criteria["release_notes"] = _check("not_met", releases_page or repo_home)
    else:
        notes_ok = human_release_notes(latest.get("body") or "")
        ev = latest_url
        if not notes_ok:
            # Notes at the tag when present, otherwise at the pin (tag may not be in this clone).
            tag_rev = latest["tag"]
            has_tag = git(cwd, "rev-parse", "--verify", "--quiet", f"refs/tags/{tag_rev}", check=False)
            use_rev = tag_rev if has_tag else rev
            found = notes_from_tree(cwd, use_rev, latest["tag"])
            if found is None and use_rev != rev:
                found = notes_from_tree(cwd, rev, latest["tag"])
            if found:
                path, text = found
                if human_release_notes(text):
                    notes_ok = True
                    ev = blob_url(repo, use_rev if has_tag else rev, path) if repo else ev
        if notes_ok:
            criteria["release_notes"] = _check("met", ev)
        else:
            # If we could not read the release body and could not read the notes paths, not measured.
            body_known = latest.get("from_github_release") or latest.get("body") is not None
            tree_read = list_tree_paths(cwd, rev) is not None
            if not body_known and not tree_read and not (latest.get("body") or ""):
                criteria["release_notes"] = _check("not_measured")
            else:
                criteria["release_notes"] = _check("not_met", ev or releases_page or repo_home)

    # --- S7 signed or reproducible ---
    if read_err and not latest:
        criteria["signed_or_reproducible"] = _check("not_measured")
    elif not latest:
        criteria["signed_or_reproducible"] = _check("not_met", releases_page or repo_home)
    else:
        assets = latest.get("assets") or []
        signed = has_sig_assets(assets)
        ev = latest_url
        probe_failed = False
        if not signed:
            ver_s = core_family_version(latest["tag"])
            tmpl = DOWNLOAD_SUMS.get(slug)
            if tmpl and ver_s:
                url = tmpl.format(version=ver_s)
                ok = http_ok(url)
                if ok is True:
                    signed = True
                    ev = url
                elif ok is None:
                    probe_failed = True
            guix = GUIX_SIGS.get(slug)
            if not signed and guix:
                # In-tree contrib/guix/ alone is not enough; published signatures are.
                ok = http_ok(guix)
                if ok is True:
                    signed = True
                    ev = guix
                elif ok is None:
                    probe_failed = True
        if signed:
            criteria["signed_or_reproducible"] = _check("met", ev)
        elif probe_failed and not assets and not latest.get("from_github_release"):
            criteria["signed_or_reproducible"] = _check("not_measured")
        else:
            criteria["signed_or_reproducible"] = _check("not_met", ev or releases_page or repo_home)

    # --- descriptive tag: upstream_track ---
    readme = None
    readme_path = None
    for path in ("README.md", "README.rst", "README"):
        text = git_show(cwd, rev, path)
        if text is not None:
            readme, readme_path = text, path
            break
    ev = blob_url(repo, rev, readme_path or "README.md") if repo else repo_home
    if not pin_readable and readme is None:
        criteria["upstream_track"] = {"status": "not_measured"}
    else:
        tag_val = "n/a"
        body = readme or ""
        # Forks only: classify from the README at the pin.
        if re.search(r"(?i)non[-\s]?rdts", body) and re.search(r"(?i)\bknots\b", body):
            tag_val = "tracks-knots-non-rdts"
        elif re.search(r"(?i)based directly on (?:the exact )?bitcoin core", body) or re.search(
            r"(?i)based on bitcoin core", body
        ):
            tag_val = "tracks-core"
        elif re.search(r"(?i)continue non-rdts knots|last non-rdts", body):
            tag_val = "tracks-knots-non-rdts"
        # Independent trees are n/a with reason "independent tree". Known
        # Core/Knots-layout forks that state a base are tagged above. If a
        # fork README is silent, emit n/a with that reason (not scored).
        # Bit-Block is in this silent-fork set: upstream_track stays n/a.
        reason = None
        if tag_val == "n/a" and slug in ("knots-legacy", "bit-block", "bitcoin-roots"):
            tag_val = "not-found" if not body else "n/a"
            reason = "README at the pin does not state a base line"
        elif tag_val == "n/a":
            reason = "independent tree"
        criteria["upstream_track"] = _tag_cell(tag_val, ev or repo_home, reason=reason)

    return {"name": NAMES[slug], "criteria": criteria}


def load_reserved_rows(existing_path: Path) -> dict:
    reserved = {k: json.loads(json.dumps(v)) for k, v in RESERVED_STABILITY_ROWS.items()}
    if not existing_path.is_file():
        return reserved
    try:
        doc = json.loads(existing_path.read_text())
    except (OSError, json.JSONDecodeError):
        return reserved
    for slug, row in (doc.get("rows") or {}).items():
        if isinstance(row, dict) and row.get("on_page") is False:
            reserved[slug] = {
                "name": row.get("name") or slug,
                "on_page": False,
                "note": row.get("note", ""),
                "criteria": row.get("criteria") or {},
            }
    return reserved


def build_stability_doc(out_path: Path | None = None) -> dict:
    slugs = ["blvm"] + [
        "bitcoin-core", "knots-legacy", "bit-block", "bitcoin-roots",
        "bitcoin-rs", "satd", "libbitcoin", "hornet", "floresta", "rbitcoin", "btcd",
    ]
    rows = {}
    for slug in slugs:
        print(f"stability: measuring {slug}…", flush=True)
        rows[slug] = measure_one_stability(slug)
    reserved = load_reserved_rows(out_path) if out_path else dict(RESERVED_STABILITY_ROWS)
    for slug, row in reserved.items():
        if slug not in rows:
            rows[slug] = row
    note = (
        "Seven mechanically checkable requisites for a stable release line, "
        "scored by scripts/measure-ecosystem-metrics.py from the GitHub API and "
        "the repo at the same pins as the other ecosystem metrics. The checklist "
        "definition is from Research's stability brief (2026-11-12). Score is "
        "met out of 7; not-measured stays in the denominator and is never read "
        "as not met. Citations: Semantic Versioning 2.0.0 and the OpenSSF Best "
        "Practices criteria for version tags, vulnerability reporting, release "
        "notes, and signed or reproducible releases. Bitcoin Untangled's Status "
        "field is not the source of the grade."
    )
    return {
        "schema_version": 1,
        "as_of": AS_OF,
        "status": "measured",
        "note": note,
        "score_rule": STABILITY_SCORE_RULE,
        "statuses": STABILITY_STATUSES,
        "definition": STABILITY_DEFINITION,
        "definition_schema": STABILITY_DEFINITION_SCHEMA,
        "row_schema": STABILITY_ROW_SCHEMA,
        "rows": rows,
        "source": {
            "label": (
                "Research, ecosystem-stability-brief.md, sections 3 to 5; "
                "cells scored by scripts/measure-ecosystem-metrics.py"
            ),
            "retrieved": AS_OF,
        },
    }


def stability_score_table(doc: dict) -> list[tuple[str, int, int, int]]:
    checks = [c["id"] for c in doc["definition"] if c["type"] == "check"]
    table = []
    for slug, row in doc["rows"].items():
        if row.get("on_page") is False:
            continue
        cells = (row.get("criteria") or {})
        met = sum(1 for i in checks if (cells.get(i) or {}).get("status") == "met")
        nm = sum(1 for i in checks if (cells.get(i) or {}).get("status") == "not_measured")
        table.append((slug, met, len(checks), nm))
    return table


def write_stability(path: str) -> dict:
    dest = Path(path)
    doc = build_stability_doc(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {dest}", flush=True)
    for slug, met, total, nm in stability_score_table(doc):
        extra = f", {nm} not measured" if nm else ""
        print(f"  {slug}: {met} of {total} met{extra}", flush=True)
    return doc



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="-")
    parser.add_argument("--size-out", default="")
    parser.add_argument(
        "--stability-out",
        default=str(REPO_ROOT / "data/stability.json"),
        help="Write the stability checklist JSON (PR #6 schema). Empty string skips it.",
    )
    parser.add_argument(
        "--stability-only",
        action="store_true",
        help="Only compute data/stability.json; skip size and metrics measurement.",
    )
    args = parser.parse_args()

    if args.stability_out:
        write_stability(args.stability_out)
    if args.stability_only:
        return

    if not MAILMAP.is_file():
        print(
            f"author mailmap not found at {MAILMAP}. "
            "Set AUTHOR_MAILMAP to a local mailmap file. "
            "Author counts will be recorded as not measured.",
            file=sys.stderr,
        )
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
            "in-source tests (files next to program sources, including in-file "
            "#[cfg(test)] and C++ src/test); test-folder tests (remaining files "
            "under tests/, test/, e2e/, qa/, or functional/). This is a folder "
            "split, not a unit-vs-integration classification. Benches under "
            "bench(es)/ are grouped with in-source tests. Vendored and locale "
            "paths are excluded. test_insource / test_folder are the canonical "
            "fields; test_unit / test_integration are aliases of those values."
        ),
        "fuzz_targets": (
            "Declared fuzz targets at the pin, not a count of files in a fuzz "
            "directory. C++: invocations of FUZZ_TARGET( and wrappers such as "
            "FUZZ_TARGET_DESERIALIZE(, skipping #define lines and lines that "
            "continue a macro body (the previous line ends with a backslash). "
            "Go: func FuzzXxx(f *testing.F). Rust: "
            "cargo-fuzz [[bin]] entries when a fuzz Cargo.toml is present, "
            "otherwise fuzz_target! uses (the two Rust counts match on every "
            "tree measured here)."
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
            f"Human commit authors on the landing-share repo set from "
            f"{WINDOW_START} to {WINDOW_END} inclusive. Known aliases are "
            "merged from a local mailmap (AUTHOR_MAILMAP); the mailmap is "
            "not in this repository. Bots and agents are "
            "excluded: any name or email containing [bot], merge-script, "
            "github-actions, dependabot, Cursor Agent, Claude, Grok Bot "
            "Engineer, Devin AI, OpenAI, and other obvious agent identities "
            "(rbitcoin-grok, Tau Agent, and similar), plus authors whose "
            "email host is localhost, local, or omp. Unique names are "
            "compared case-insensitively after the mailmap. If the mailmap "
            "is absent, author counts are not measured rather than silently "
            "published without alias merging. A shallow clone that does not "
            "reach the window start is not measured."
        ),
        "releases_12m": (
            f"Git tags whose creatordate falls in {WINDOW_START} to {WINDOW_END}. "
            "Annotated tags use the tagger date; lightweight tags use the tagged "
            "commit date."
        ),
        "ci_workflows": "Number of .github/workflows/*.{yml,yaml} files at the pin.",
        "ci_jobs": (
            "GitHub Actions jobs at the pin, expanding a static matrix of lists "
            "(an include-only matrix is just the include rows, not one implicit job plus those rows; minus exclude/). A fromJSON(needs.job.outputs.x) "
            "matrix is expanded when the default non-PR value is written in the "
            "same workflow (suite=all, schedule/push flavors and arches, default "
            "mutant PARTS) or when the producer reads this tree's fuzz/Cargo.toml "
            "[[bin]] list. Unquoted run: scalars that break PyYAML are quoted "
            "and retried. If a matrix still cannot be expanded or a file still "
            "fails to parse, the cell is partial and the value is a lower bound."
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
        authors_cell = measure_authors(
            Path(git_root), git_rev, "landing share repo: blvm-node only. " + hist_note
        )
        rel_n, rel_note = releases_12m(Path(git_root))
        releases_cell = cell(rel_n, note=rel_note + " (blvm-node tags)")
    else:
        authors_cell = cell(None, "not-measured", note=hist_note)
        releases_cell = cell(None, "not-measured", note=hist_note)
    wf, jobs, ci_note, ci_partial = parse_ci(Path("/tmp/eco-audit/src/blvm-node"))
    tests = size["test_split"]
    insource = tests.get("unit", 0)
    folder = tests.get("integration", 0)
    split_note = (
        "Folder split, not a unit-vs-integration classification: in-source tests "
        "are tests next to program sources (including in-file #[cfg(test)]); "
        "test-folder tests are files under tests/, test/, e2e/, qa/, or functional/."
    )
    ci_status = "partial" if ci_partial else "measured"
    ci_text = (f"{jobs:,} (partial)" if ci_partial and jobs is not None else None)
    blvm_row = {
        "slug": "blvm",
        "name": "BLVM",
        "commit": "36bb40c7e9a3f805274fa7e1bda30d0a6c082560",
        "crates": size["crates"],
        "measured_at": AS_OF,
        "fuzz_targets": cell(
            size["fuzz_targets_verify_set"],
            note=size.get("fuzz_targets_verify_note", "") + " (same crate set as the verification cell)",
        ),
        "test_insource": cell(insource, note=split_note),
        "test_folder": cell(folder, note=split_note),
        "test_unit": cell(insource, note="Deprecated alias of test_insource. " + split_note),
        "test_integration": cell(folder, note="Deprecated alias of test_folder. " + split_note),
        "test_fuzz": cell(tests.get("fuzz", 0)),
        "test_property": cell(tests.get("property", 0)),
        "test_split_total": cell(size["test_total"]),
        "vector_files": cell(size["vector_files"]),
        "spec_files": cell(size["spec_files"]),
        "authors_12m": authors_cell,
        "releases_12m": releases_cell,
        "ci_workflows": cell(wf),
        "ci_jobs": cell(jobs, ci_status, text=ci_text, note=ci_note) if jobs is not None else cell(None, "not-measured", note=ci_note),
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
