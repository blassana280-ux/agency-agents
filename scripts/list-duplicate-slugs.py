#!/usr/bin/env python3
"""Liste les slugs d'agents dupliques (toutes divisions, source: divisions.json)."""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")

def main() -> int:
    data = json.loads((REPO_ROOT / "divisions.json").read_text(encoding="utf-8"))
    divisions = sorted(data["divisions"].keys())
    seen: dict[str, list[str]] = {}
    for division in divisions:
        base = REPO_ROOT / division
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.md")):
            text = path.read_text(encoding="utf-8", errors="replace")
            if not text.startswith("---\n"):
                continue
            parts = text.split("---\n", 2)
            if len(parts) < 3:
                continue
            for line in parts[1].splitlines():
                if line.startswith("name:"):
                    name = line.split(":", 1)[1].strip()
                    if len(name) > 1 and name[0] == name[-1] and name[0] in ("\"", "'"):
                        name = name[1:-1]
                    name = name.strip()
                    if name:
                        seen.setdefault(slugify(name), []).append(f"{name} <- {path.relative_to(REPO_ROOT)}")
                    break
    duplicates = {slug: locs for slug, locs in seen.items() if len(locs) > 1}
    if not duplicates:
        print("OK: aucun slug duplique.")
        return 0
    for slug, locs in sorted(duplicates.items()):
        print(f"DOUBLON {slug}:")
        for loc in locs:
            print(f"  - {loc}")
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
