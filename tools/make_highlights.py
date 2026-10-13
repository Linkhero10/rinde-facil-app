"""Genera, a partir de los PDF originales, un recorte de cada hoja con el extracto relevante marcado en amarillo.
Uso:  python tools/make_highlights.py "<carpeta con los PDF originales>"
Salida: assets/docs/hl/<mismo nombre que la hoja completa>.jpg
La hoja completa (assets/docs/<nombre>.jpg) se conserva: la app muestra primero el recorte y deja ver la hoja entera."""
import os
import sys

try:
    import pymupdf as fitz
except ImportError:  # versiones antiguas
    import fitz

SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\SMI\Fuentes\Desempeño social y gobernanza de recursos\Documentos iniciales"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "docs", "hl")
PDF = {
    "doc-004-79b28f1aad": "Manual rendición de proyectos_Corfo.pdf",
    "doc-005-7690461ef7": "Presentación Rendición financiera y técnica - Versión final.pdf",
}
# (prefijo del archivo, página, [frases a marcar tal como están en el PDF])
SPEC = [
    ("doc-004-79b28f1aad", 21, ["cuenta corriente bancaria exclusiva", "centro de costos diferenciado"]),
    ("doc-004-79b28f1aad", 8, ["superiores a $10.000.000", "al menos 2 cotizaciones", "No se podrán fragmentar"]),
    ("doc-004-79b28f1aad", 19, ["certificado de hipotecas y gravámenes", "al menos 2 tasaciones comerciales"]),
    ("doc-004-79b28f1aad", 15, ["funciones y los motivos", "Certificado de Viático propuesto en el Anexo N°4", "consulte a Corfo respecto"]),
    ("doc-004-79b28f1aad", 7, ["Declaración jurada simple de no haber hecho", "Formularios 29, del SII"]),
    ("doc-004-79b28f1aad", 20, ["máximo de $3.000.000", "una memoria de cálculo que detalle", "Word, Excel o PDF"]),
    ("doc-004-79b28f1aad", 9, ["ingresar uno a uno", "errores en la información incorporada"]),
    ("doc-004-79b28f1aad", 10, ["por única vez", "10 días hábiles", "se rechazarán los gastos observados"]),
    ("doc-004-79b28f1aad", 22, ["XI. INTERPRETACIÓN", "resolver toda controversia o duda"]),
    ("doc-005-7690461ef7", 15, ["sin puntos ni guión", "restablecer la contraseña"]),
    ("doc-005-7690461ef7", 16, ["VIGENTE"]),
    ("doc-005-7690461ef7", 4, ["Informe mensual de Boleta de Honorarios", "se refiere a la cartola bancaria"]),
    ("doc-005-7690461ef7", 5, ["Copia de la Factura", "Formulario 29", "Comprobante de Pago"]),
    ("doc-005-7690461ef7", 18, ["Tipo Documento", "Guardar"]),
    ("doc-005-7690461ef7", 20, ["Resumen por Cuentas", "montos totales que se deberían"]),
    ("doc-005-7690461ef7", 24, ["Ver Informe / Rendir", "Pendiente"]),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    docs = {}
    report = []
    for key, page_no, phrases in SPEC:
        path = os.path.join(SRC, PDF[key])
        if path not in docs:
            docs[path] = fitz.open(path)
        page = docs[path][page_no - 1]
        rects, missing = [], []
        for ph in phrases:
            hits = page.search_for(ph)
            if not hits:
                missing.append(ph)
                continue
            rects += hits
            page.add_highlight_annot(quads=[h.quad for h in hits]).update()
        name = "%s_p%03d.jpg" % (key, page_no)
        if not rects:
            report.append("SIN MARCAS %s: %s" % (name, phrases))
            continue
        pr = page.rect
        y0 = max(pr.y0, min(r.y0 for r in rects) - 70)
        y1 = min(pr.y1, max(r.y1 for r in rects) + 70)
        if key == "doc-005-7690461ef7":  # diapositivas: se muestra la lámina completa, con las marcas
            y0, y1 = pr.y0, pr.y1
        elif y1 - y0 < pr.height * 0.28:  # recorte demasiado bajo: se agranda para dar contexto
            mid = (y0 + y1) / 2
            y0, y1 = max(pr.y0, mid - pr.height * 0.14), min(pr.y1, mid + pr.height * 0.14)
        clip = fitz.Rect(pr.x0, y0, pr.x1, y1)
        page.get_pixmap(dpi=120, clip=clip).save(os.path.join(OUT, name), jpg_quality=82)
        report.append("ok %s (%d marcas)%s" % (name, len(rects), (" · no encontradas: %s" % missing) if missing else ""))
    print("\n".join(report))


if __name__ == "__main__":
    main()
