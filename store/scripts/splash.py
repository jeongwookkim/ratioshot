"""Black launch screens with the app icon centered, for every Capacitor splash density."""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ICON = Image.open(os.path.join(ROOT, "store/source/icon-gpt.png")).convert("RGB")
RES = os.path.join(ROOT, "android/app/src/main/res")

SIZES = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320), "drawable-land-hdpi": (800, 480), "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960), "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480), "drawable-port-hdpi": (480, 800), "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600), "drawable-port-xxxhdpi": (1280, 1920),
}
for d, (w, h) in SIZES.items():
    im = Image.new("RGB", (w, h), (0, 0, 0))
    s = int(min(w, h) * 0.28)
    icon = ICON.resize((s, s), Image.LANCZOS)
    im.paste(icon, ((w - s) // 2, (h - s) // 2))
    os.makedirs(os.path.join(RES, d), exist_ok=True)
    im.save(os.path.join(RES, d, "splash.png"))
print("splash done")
