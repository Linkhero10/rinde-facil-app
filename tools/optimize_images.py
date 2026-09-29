"""Convierte las capturas reales de los documentos (PNG grandes) a JPEG livianos para celulares.
Solo usa las que la app referencia en js/11-tramites.js. No genera ni modifica contenido de las capturas."""
import re, sys, os
from PIL import Image

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(APP), "demo", "assets", "steps")
DST = os.path.join(APP, "assets", "docs")
os.makedirs(DST, exist_ok=True)
# Coordenadas sobre la imagen escalada a 1100 px de ancho (x0, y0, x1, y1, texto).
# La diapositiva 16 de la presentación de rendición muestra en pantalla nombres reales de personas y de otros proyectos.
REDACTIONS = {
    "doc-005-7690461ef7_p016": [
        (800, 172, 1012, 189, "nombre de usuario omitido"),
        (300, 331, 1012, 397, "  Datos de otros proyectos y de personas omitidos"),
    ]
}
code = open(os.path.join(APP, "js", "11-tramites.js"), encoding="utf-8").read()
names = sorted(set(re.findall(r"\['([A-Za-z0-9_\-]+\.(?:png|jpg))'", code)))
missing = []
total = 0
for n in names:
    base = os.path.splitext(n)[0]
    src = os.path.join(SRC, base + ".png")
    if not os.path.exists(src):
        missing.append(n); continue
    im = Image.open(src).convert("RGB")
    w = 1100
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    if base in REDACTIONS:  # tapar nombres de personas y datos de terceros que aparecen en pantallazos de SGP
        from PIL import ImageDraw
        d = ImageDraw.Draw(im)
        sx = im.width / 1100.0
        for (x0, y0, x1, y1, label) in REDACTIONS[base]:
            d.rectangle([x0 * sx, y0 * sx, x1 * sx, y1 * sx], fill=(70, 70, 78))
            if label:
                d.text((x0 * sx + 6, y0 * sx + 3), label, fill=(235, 235, 240))
    out = os.path.join(DST, base + ".jpg")
    im.save(out, "JPEG", quality=74, optimize=True, progressive=True)
    total += os.path.getsize(out)
print("imagenes:", len(names), "faltan:", missing, "total KB:", total // 1024)
if missing:
    sys.exit(1)
# apuntar las referencias a .jpg
new = re.sub(r"\['([A-Za-z0-9_\-]+)\.png'", r"['\1.jpg'", code)
open(os.path.join(APP, "js", "11-tramites.js"), "w", encoding="utf-8", newline="\n").write(new)
print("referencias actualizadas a .jpg")
