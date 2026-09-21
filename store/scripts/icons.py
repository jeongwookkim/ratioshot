"""Launcher icons, Play store icon and feature graphic from store/source/icon-gpt.png."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = Image.open(os.path.join(ROOT, "store/source/icon-gpt.png")).convert("RGB")
RES = os.path.join(ROOT, "android/app/src/main/res")
OUT = os.path.join(ROOT, "store/out")
os.makedirs(OUT, exist_ok=True)

# Legacy launcher icons (full-bleed square, black background).
for d, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    im = SRC.resize((px, px), Image.LANCZOS)
    im.save(os.path.join(RES, f"mipmap-{d}/ic_launcher.png"))
    # round icon: same art, circular mask
    mask = Image.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    rnd.paste(im, (0, 0), mask)
    rnd.save(os.path.join(RES, f"mipmap-{d}/ic_launcher_round.png"))
    # adaptive foreground: art scaled into the 66/108 safe zone on transparent
    fg_px = int(px * 108 / 48) if d == "mdpi" else {"hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}[d]
    fg = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
    inner = int(fg_px * 0.72)
    art = SRC.resize((inner, inner), Image.LANCZOS)
    fg.paste(art, ((fg_px - inner) // 2, (fg_px - inner) // 2))
    fg.save(os.path.join(RES, f"mipmap-{d}/ic_launcher_foreground.png"))

# Adaptive background = solid black
with open(os.path.join(RES, "values/ic_launcher_background.xml"), "w") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')

# Play: 512x512 icon, 1024x500 feature graphic
SRC.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "play-icon-512.png"))
feat = Image.new("RGB", (1024, 500), (0, 0, 0))
art = SRC.resize((380, 380), Image.LANCZOS)
feat.paste(art, (80, 60))
draw = ImageDraw.Draw(feat)
font_path = next((p for p in [
    "/System/Library/Fonts/SFCompact.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
] if os.path.exists(p)), None)
big = ImageFont.truetype(font_path, 76) if font_path else ImageFont.load_default()
small = ImageFont.truetype(font_path, 34) if font_path else ImageFont.load_default()
draw.text((500, 150), "RatioShot", font=big, fill=(255, 255, 255))
draw.text((500, 250), "Shoot once. Save every ratio.", font=small, fill=(210, 210, 215))
draw.text((500, 300), "4:5 · 1:1 · 16:9 · 9:16 · 3:2", font=small, fill=(255, 95, 168))
feat.save(os.path.join(OUT, "feature-1024x500.png"))
print("icons done")
