import json, sys, pdfplumber
d = sys.argv[1]; meta = json.load(open(f"{d}/secrets.json"))
with pdfplumber.open(f"{d}/q.pdf") as pdf:
    pages = [p.extract_text() for p in pdf.pages]
    assert len(pages) > 1, "debe ser multipágina"
    for p, pg in zip(pages, pdf.pages):
        if "Servicio número" in p: assert "Concepto" in p, "encabezado repetido"
        assert all(w["x1"] <= pg.width - 40 for w in pg.extract_words()), "texto fuera del margen"
    text = "\n".join(pages)
    assert "COT-2026-0007" in text and "María Pérez" in text and "ñandú" in text
    tp = [p for p in pages if "Total a pagar" in p]; assert tp and meta["total"] in tp[0] and "Servicio número" in tp[0], "total junto a partidas"
    low = text.lower()
    for s in meta["secrets"]: assert s.lower() not in low, f"filtró: {s}"
with pdfplumber.open(f"{d}/r.pdf") as pdf:
    assert "Sin datos" in pdf.pages[0].extract_text()
print(f"CHECK_OK páginas={len(pages)}")
