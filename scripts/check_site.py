#!/usr/bin/env python3
"""Validate slide markup and the local assets used by the presentation."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = [
    "index.html",
    "quest.html",
    "styles.css",
    "app.js",
    "deck-data.js",
    "globe.js",
]
ASSET_RE = re.compile(
    r"(?<![A-Za-z0-9_.-])((?:images|audio|vendor)/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|mp3|js|txt))"
)
VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


class MarkupAudit(HTMLParser):
    """Track HTML nesting, IDs, image metadata and slide titles."""

    def __init__(self, filename: str) -> None:
        super().__init__(convert_charrefs=True)
        self.filename = filename
        self.stack: list[tuple[str, int]] = []
        self.ids: set[str] = set()
        self.slide_titles: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        line = self.getpos()[0]
        element_id = values.get("id")
        if element_id:
            if element_id in self.ids:
                self.errors.append(f"duplicate id {element_id!r} at line {line}")
            self.ids.add(element_id)
        title = values.get("data-title")
        if tag == "section" and "slide" in (values.get("class") or "").split():
            if not title:
                self.errors.append(f"slide without data-title at line {line}")
            else:
                self.slide_titles.append(title)
            if not values.get("data-layout"):
                self.errors.append(f"slide without stable data-layout at line {line}")
        if tag == "img":
            if "alt" not in values:
                self.errors.append(f"image without alt attribute at line {line}")
            source = values.get("src") or ""
            if source.startswith("images/"):
                if not values.get("width") or not values.get("height"):
                    self.errors.append(
                        f"image missing intrinsic dimensions at line {line}"
                    )
                if source.endswith("cover-ded-moroz-proportioned.jpg"):
                    if values.get("fetchpriority") != "high":
                        self.errors.append(
                            f"cover image should have high fetch priority at line {line}"
                        )
                elif (
                    values.get("loading") != "lazy" or values.get("decoding") != "async"
                ):
                    self.errors.append(
                        f"non-cover image should load lazily at line {line}"
                    )
        if tag not in VOID_TAGS:
            self.stack.append((tag, line))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_TAGS:
            return
        if not self.stack:
            self.errors.append(
                f"unexpected closing tag </{tag}> at line {self.getpos()[0]}"
            )
            return
        open_tag, open_line = self.stack.pop()
        if open_tag != tag:
            self.errors.append(
                f"mismatched </{tag}> at line {self.getpos()[0]}; "
                f"expected </{open_tag}> for line {open_line}"
            )

    def finish(self) -> None:
        if self.stack:
            tag, line = self.stack[-1]
            self.errors.append(f"unclosed <{tag}> from line {line}")


def main() -> int:
    errors: list[str] = []
    for filename in SOURCE_FILES:
        path = ROOT / filename
        if not path.is_file():
            errors.append(f"missing source file: {filename}")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        return 1

    audits: dict[str, MarkupAudit] = {}
    for filename in ("index.html", "quest.html"):
        audit = MarkupAudit(filename)
        audit.feed((ROOT / filename).read_text(encoding="utf-8"))
        audit.finish()
        audits[filename] = audit
        errors.extend(f"{filename}: {error}" for error in audit.errors)

    source = "\n".join(
        (ROOT / filename).read_text(encoding="utf-8") for filename in SOURCE_FILES
    )
    asset_refs = set(ASSET_RE.findall(source))
    asset_refs.update(f"audio/narration-{number:02}.mp3" for number in range(1, 14))
    for reference in sorted(asset_refs):
        if not (ROOT / reference).is_file():
            errors.append(f"missing referenced asset: {reference}")

    html = (ROOT / "quest.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    if re.search(r"\bonclick\s*=", html, re.IGNORECASE):
        errors.append(
            "quest.html should use delegated actions, not inline onclick handlers"
        )
    if "[data-title=" in css:
        errors.append(
            "styles should use stable data-layout identifiers, not slide titles"
        )
    layouts = re.findall(r'\bdata-layout="([^"]+)"', html)
    if len(layouts) != len(set(layouts)):
        errors.append("data-layout identifiers must be unique")
    styled_layouts = set(re.findall(r'\[data-layout="([^"]+)"\]', css))
    unknown_layouts = sorted(styled_layouts - set(layouts))
    if unknown_layouts:
        errors.append(
            f"styles target unknown data-layout identifiers: {unknown_layouts}"
        )
    if 'image.loading = "lazy"' not in app or 'image.decoding = "async"' not in app:
        errors.append(
            "generated gallery images must be lazy-loaded and decoded asynchronously"
        )

    volga_start = html.find('data-layout="volga"')
    if volga_start >= 0:
        slide_start = html.rfind("<section", 0, volga_start)
        slide_end = html.find("</section>", volga_start)
        slide = html[slide_start:slide_end]
        image_end = slide.find("</figure>")
        layout_end = slide.find("</div>", image_end + len("</figure>"))
        selectors = slide.find('class="volga-region-labels"')
        if image_end < 0 or layout_end < 0 or selectors < layout_end:
            errors.append(
                "Volga region selectors must follow the complete image layout"
            )

    slide_count = len(audits["quest.html"].slide_titles)
    if slide_count != 13:
        errors.append(f"expected 13 slides, found {slide_count}")

    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        return 1
    print(
        f"Project checks passed: {slide_count} slides, {len(asset_refs)} referenced assets."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
