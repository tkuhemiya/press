#!/usr/bin/env python3
from pathlib import Path
import shutil
import sys

from fontTools.subset import Options, Subsetter, load_font, save_font
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts"
TTF_DIR = OUT / "ttf"

UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [
        0x2013,
        0x2014,
        0x2018,
        0x2019,
        0x201C,
        0x201D,
        0x2016,
        0x2022,
        0x2026,
        0x00B7,
        0x2190,
        0x2191,
        0x2192,
        0x2193,
        0x2194,
        0x00D7,
        0x00F7,
        0x00B1,
        0x2264,
        0x2265,
        0x2260,
        0x00B0,
        0x2713,
        0x2717,
    ]
)

FACES = [
    ("Geist/ttf/Geist-Regular.ttf", "Geist", 400, "normal", "geist-sans-400-normal"),
    ("Geist/ttf/Geist-Medium.ttf", "Geist", 500, "normal", "geist-sans-500-normal"),
    ("Geist/ttf/Geist-SemiBold.ttf", "Geist", 600, "normal", "geist-sans-600-normal"),
    ("Geist/ttf/Geist-Italic.ttf", "Geist", 400, "italic", "geist-sans-400-italic"),
    ("GeistSerif/ttf/GeistSerif-Regular.ttf", "Geist Serif", 400, "normal", "geist-serif-400-normal"),
    ("GeistMono/ttf/GeistMono-Regular.ttf", "Geist Mono", 400, "normal", "geist-mono-400-normal"),
]


def family_style(family: str, weight: int, style: str) -> str:
    if style == "italic" and weight == 400:
        return "Italic"
    return {400: "Regular", 500: "Medium", 600: "SemiBold"}[weight]


def set_names(font: TTFont, family: str, weight: int, style: str) -> None:
    subfamily = family_style(family, weight, style)
    full = f"{family} {subfamily}".replace(" Regular", "") if subfamily == "Regular" else f"{family} {subfamily}"
    if subfamily == "Regular":
        full = f"{family} Regular"
    ps = (family + "-" + subfamily).replace(" ", "")
    nam = font["name"]
    for rec in nam.names:
        if rec.platformID not in (1, 3):
            continue
        if rec.nameID == 1:
            rec.string = family
        elif rec.nameID == 2:
            rec.string = subfamily
        elif rec.nameID == 4:
            rec.string = full
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 16:
            rec.string = family
        elif rec.nameID == 17:
            rec.string = subfamily


def subset(src: Path, dest: Path, flavor: str | None) -> None:
    options = Options()
    options.unicodes = UNICODES
    options.layout_features = ["*"]
    options.hinting = True
    options.desubroutinize = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.canonical_order = True
    if flavor:
        options.flavor = flavor
    font = load_font(str(src), options)
    sub = Subsetter(options)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    save_font(font, str(dest), options)
    font.close()


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/vendor-fonts.py <geist-font-dir>", file=sys.stderr)
        sys.exit(2)
    src_root = Path(sys.argv[1])
    if (src_root / "geist-font").is_dir():
        src_root = src_root / "geist-font"
    for old in OUT.glob("inter-*"):
        old.unlink()
    for old in OUT.glob("jetbrains-*"):
        old.unlink()
    for old in OUT.glob("source-serif-*"):
        old.unlink()
    for old in TTF_DIR.glob("*.ttf"):
        old.unlink()
    for old in OUT.glob("LICENSE-*.txt"):
        old.unlink()
    for rel, family, weight, style, stem in FACES:
        src = src_root / rel
        if not src.exists():
            raise SystemExit(f"missing {src}")
        woff = OUT / f"{stem}.woff2"
        ttf = TTF_DIR / f"{stem}.ttf"
        subset(src, woff, "woff2")
        subset(src, ttf, None)
        for path in (woff, ttf):
            font = TTFont(str(path))
            set_names(font, family, weight, style)
            font.save(str(path))
            font.close()
        print("wrote", woff.name, ttf.name)
    shutil.copyfile(src_root / "OFL.txt", OUT / "LICENSE-Geist.txt")
    print("wrote LICENSE-Geist.txt")


if __name__ == "__main__":
    main()
