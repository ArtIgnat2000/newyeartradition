#!/usr/bin/env python3
"""Build a minimal GitHub Pages artifact while retaining source assets in Git."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
ENTRY_FILES = (
    "index.html",
    "quest.html",
    "styles.css",
    "app.js",
    "deck-data.js",
    "globe.js",
)
ASSET_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])((?:images|audio|vendor)/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|mp3|js|txt))"
)


def main() -> None:
    sources = [ROOT / name for name in ENTRY_FILES]
    missing_sources = [path.name for path in sources if not path.is_file()]
    if missing_sources:
        raise SystemExit(f"Missing site source files: {', '.join(missing_sources)}")

    source_text = "\n".join(path.read_text(encoding="utf-8") for path in sources)
    media = set(ASSET_RE.findall(source_text))
    missing_media = sorted(path for path in media if not (ROOT / path).is_file())
    if missing_media:
        raise SystemExit(f"Missing referenced assets: {', '.join(missing_media)}")

    # Narration filenames are generated from slide numbers at runtime.
    audio = {f"audio/narration-{number:02}.mp3" for number in range(1, 14)}
    missing_audio = sorted(path for path in audio if not (ROOT / path).is_file())
    if missing_audio:
        raise SystemExit(f"Missing generated audio assets: {', '.join(missing_audio)}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for source in sources:
        shutil.copy2(source, OUTPUT / source.name)

    for relative in sorted(media | audio):
        source = ROOT / relative
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    # Vendor modules import one another by relative path; include the complete vendor set.
    shutil.copytree(ROOT / "vendor", OUTPUT / "vendor", dirs_exist_ok=True)
    total_bytes = sum(
        path.stat().st_size for path in OUTPUT.rglob("*") if path.is_file()
    )
    print(
        f"Built {OUTPUT.relative_to(ROOT)} with referenced media and "
        f"{total_bytes / 1_048_576:.2f} MiB total."
    )


if __name__ == "__main__":
    main()
