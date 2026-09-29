"""Imagen de prueba ficticia (no es un documento real) para probar la subida de fotos."""
from PIL import Image, ImageDraw
import os
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(here, "fixtures"), exist_ok=True)
im = Image.new("RGB", (600, 800), "white")
d = ImageDraw.Draw(im)
for i, t in enumerate(["EMPRESA FANTASIA SPA (FICTICIA)", "RUT 76.123.456-0", "FACTURA N 1042", "Fecha 14-08-2026", "Neto 1.250.000", "IVA 237.500", "Total 1.487.500", "DOCUMENTO DE PRUEBA"]):
    d.text((40, 60 + i * 60), t, fill="black")
im.save(os.path.join(here, "fixtures", "boleta-ficticia.jpg"), "JPEG", quality=80)
print("ok")
