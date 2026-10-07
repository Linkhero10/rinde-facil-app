"""Marca en amarillo, palabra por palabra, las ORACIONES completas que respaldan un trámite y recorta la hoja por párrafos enteros.

Uso:
  python tools/hl_apply.py --dump <prefijo> <página>        imprime la hoja por párrafos (para copiar las frases tal como están)
  python tools/hl_apply.py --apply spec.json [--src carpeta] [--out carpeta]

spec.json: [{"pdf": "doc-004-79b28f1aad", "page": 8, "sentences": ["oración completa 1", "oración completa 2"]}, ...]
Cada oración se copia TAL CUAL del volcado (puede cruzar renglones). La herramienta avisa si una oración no se encuentra,
si solo calzó en parte, o si el marcado ocupa demasiado de la hoja (señal de que se marcó de más)."""
import json
import os
import re
import sys

try:
    import pymupdf as fitz
except ImportError:
    import fitz

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = r"D:\SMI\Fuentes\Desempeño social y gobernanza de recursos\Documentos iniciales"
PDF = {
    "doc-004-79b28f1aad": "Manual rendición de proyectos_Corfo.pdf",
    "doc-005-7690461ef7": "Presentación Rendición financiera y técnica - Versión final.pdf",
}


def norm(t):
    t = t.lower().replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"[^\w$%°]+", "", t)


def page_words(page):
    ws = page.get_text("words")  # x0, y0, x1, y1, text, block, line, word
    ws.sort(key=lambda w: (w[5], w[6], w[7]))
    return [{"r": fitz.Rect(w[:4]), "t": w[4], "n": norm(w[4]), "b": w[5], "l": w[6]} for w in ws if norm(w[4])]


def find_span(words, sentence):
    toks = [norm(x) for x in sentence.split() if norm(x)]
    if not toks:
        return None, "vacía"
    ns = [w["n"] for w in words]
    n = len(toks)
    for i in range(0, len(ns) - n + 1):
        if ns[i:i + n] == toks:
            return (i, i + n), "exacta"
    # parcial: el inicio y el final de la oración (4 palabras cada uno) dentro de una ventana razonable
    k = min(4, n)
    head, tail = toks[:k], toks[-k:]
    starts = [i for i in range(len(ns) - k + 1) if ns[i:i + k] == head]
    for s in starts:
        for e in range(s + n - 6, min(len(ns) - k, s + n + 12) + 1):
            if e >= s and ns[e:e + k] == tail:
                return (s, e + k), "aproximada"
    return None, "no encontrada"


def dump(key, pno, src):
    doc = fitz.open(os.path.join(src, PDF[key]))
    page = doc[pno - 1]
    blocks = page.get_text("blocks")
    blocks.sort(key=lambda b: (round(b[1]), b[0]))
    print("PÁGINA %d · %s · alto %.0f pt" % (pno, key, page.rect.height))
    for i, b in enumerate(blocks):
        txt = " ".join(b[4].split())
        if txt:
            print("[%d] (y=%.0f) %s" % (i, b[1], txt))


def apply_spec(spec, src, out):
    os.makedirs(out, exist_ok=True)
    docs, reports = {}, []
    for item in spec:
        key, pno = item["pdf"], item["page"]
        path = os.path.join(src, PDF[key])
        if path not in docs:
            docs[path] = fitz.open(path)
        page = docs[path][pno - 1]
        words = page_words(page)
        used, rep = [], {"file": "%s_p%03d.jpg" % (key, pno), "sentences": [], "problems": []}
        for s in item["sentences"]:
            span, how = find_span(words, s)
            rep["sentences"].append({"text": s[:70] + ("…" if len(s) > 70 else ""), "match": how})
            if span is None:
                rep["problems"].append("NO ENCONTRADA: " + s[:80])
                continue
            if how == "aproximada":
                rep["problems"].append("calzó solo de forma aproximada (revisa que la oración esté copiada tal cual): " + s[:60])
            used += words[span[0]:span[1]]
        if not used:
            rep["problems"].append("sin marcas: no se generó imagen")
            reports.append(rep)
            continue
        # un rectángulo por renglón
        lines = {}
        for w in used:
            lines.setdefault((w["b"], w["l"]), []).append(w["r"])
        quads, area = [], 0.0
        for rs in lines.values():
            r = fitz.Rect(rs[0])
            for x in rs[1:]:
                r |= x
            r = fitz.Rect(r.x0 - 1, r.y0, r.x1 + 1, r.y1)
            quads.append(r.quad)
            area += r.width * r.height
        for q in quads:
            page.add_highlight_annot(quads=[q]).update()
        pr = page.rect
        rep["marcado_pct_hoja"] = round(100 * area / (pr.width * pr.height), 1)
        if rep["marcado_pct_hoja"] > 22:
            rep["problems"].append("se marcó demasiado (%.0f %% de la hoja): deja solo las oraciones que respaldan el trámite" % rep["marcado_pct_hoja"])
        # recorte: párrafos (bloques) completos que contienen lo marcado
        blocks = [fitz.Rect(b[:4]) for b in page.get_text("blocks") if " ".join(b[4].split())]
        blocks.sort(key=lambda r: r.y0)
        used_blocks = {w["b"] for w in used}
        raw = page.get_text("blocks")
        marked = [fitz.Rect(b[:4]) for b in raw if b[5] in used_blocks]
        y0 = min(r.y0 for r in marked)
        y1 = max(r.y1 for r in marked)
        if key == "doc-005-7690461ef7":
            y0, y1 = pr.y0, pr.y1
        else:
            above = [r for r in blocks if r.y1 <= y0 + 1]
            below = [r for r in blocks if r.y0 >= y1 - 1]
            if above:
                y0 = max(above, key=lambda r: r.y1).y0  # un párrafo de contexto antes
            if below:
                y1 = min(below, key=lambda r: r.y0).y1  # y uno después
            y0, y1 = max(pr.y0, y0 - 8), min(pr.y1, y1 + 8)
        rep["recorte_pct_hoja"] = round(100 * (y1 - y0) / pr.height)
        clip = fitz.Rect(pr.x0, y0, pr.x1, y1)
        page.get_pixmap(dpi=120, clip=clip).save(os.path.join(out, rep["file"]), jpg_quality=84)
        reports.append(rep)
    return reports


def main():
    a = sys.argv[1:]
    src = DEFAULT_SRC
    if "--src" in a:
        src = a[a.index("--src") + 1]
    out = os.path.join(HERE, "assets", "docs", "hl")
    if "--out" in a:
        out = a[a.index("--out") + 1]
    if a and a[0] == "--dump":
        dump(a[1], int(a[2]), src)
    elif a and a[0] == "--apply":
        with open(a[1], encoding="utf8") as f:
            spec = json.load(f)
        print(json.dumps(apply_spec(spec, src, out), ensure_ascii=False, indent=1))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
