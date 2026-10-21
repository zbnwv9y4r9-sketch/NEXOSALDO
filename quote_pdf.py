"""Generación real del PDF de cotización para el cliente.

Sólo recibe la vista de cliente (``finance.quotes.client_view``), construida
con lista blanca: el generador no tiene acceso a costos, márgenes, utilidades,
ahorro ni accionistas, por lo que no puede filtrarlos aunque cambie el diseño.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional
from xml.sax.saxutils import escape

from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer,
                                Table, TableStyle)

from ..finance.money import fmt_usd
from .brand import DEEP_GREEN, LIME, MUTED, RULE, TEXT, logo_drawing

ALLOWED_KEYS = {"lines", "lines_subtotal", "global_adjustment", "subtotal", "discount",
                "taxes", "total"}
ALLOWED_LINE_KEYS = {"description", "quantity", "unit", "unit_price", "total"}


@dataclass
class Issuer:
    """Empresa que emite la cotización (configurable)."""
    trade_name: str
    legal_name: str = ""
    tax_id: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    logo_bytes: Optional[bytes] = None   # PNG/JPG del emisor; si falta, se usa el nombre


@dataclass
class QuoteDocMeta:
    number: str
    version: int
    issued_on: date
    valid_until: date
    client_name: str
    event_name: str
    client_company: str = ""
    client_email: str = ""
    client_phone: str = ""
    description: str = ""
    payment_terms: str = ""
    advance: str = ""
    execution_term: str = ""
    notes: str = ""
    currency: str = "USD"
    acceptance_block: bool = True
    date_format: str = "%d/%m/%Y"
    extra: dict = field(default_factory=dict)


def _styles():
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=9.5, leading=13, textColor=TEXT)
    return {
        "base": base,
        "small": ParagraphStyle("small", parent=base, fontSize=8, leading=11, textColor=MUTED),
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=18, leading=22,
                             textColor=DEEP_GREEN),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=10.5,
                             leading=14, textColor=DEEP_GREEN, spaceBefore=8, spaceAfter=3),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
        "rightb": ParagraphStyle("rightb", parent=base, alignment=TA_RIGHT, fontName="Helvetica-Bold"),
        "cell": ParagraphStyle("cell", parent=base, fontSize=9, leading=12),
        "th": ParagraphStyle("th", parent=base, fontName="Helvetica-Bold", fontSize=8.5,
                             textColor=DEEP_GREEN),
        "thr": ParagraphStyle("thr", parent=base, fontName="Helvetica-Bold", fontSize=8.5,
                              textColor=DEEP_GREEN, alignment=TA_RIGHT),
    }


def _p(text, style):
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def _qty(q: Decimal) -> str:
    q = Decimal(q)
    return f"{q.normalize():f}" if q == q.to_integral() else f"{q:.3f}".rstrip("0")


def _validate(view: dict) -> None:
    extra = set(view) - ALLOWED_KEYS
    if extra:
        raise ValueError(f"Campos no permitidos en el PDF del cliente: {sorted(extra)}")
    for line in view["lines"]:
        bad = set(line) - ALLOWED_LINE_KEYS
        if bad:
            raise ValueError(f"Campos internos en partida: {sorted(bad)}")


def build_quote_pdf(view: dict, meta: QuoteDocMeta, issuer: Issuer) -> bytes:
    _validate(view)
    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=18 * mm,
                            title=f"Cotización {meta.number} v{meta.version}",
                            author=issuer.trade_name, subject=meta.event_name,
                            creator="NexoSaldo")
    width = doc.width
    fd = lambda d: d.strftime(meta.date_format)  # noqa: E731
    story = []

    # Encabezado: identidad del EMISOR (no de NexoSaldo)
    if issuer.logo_bytes:
        logo = Image(io.BytesIO(issuer.logo_bytes), width=26 * mm, height=26 * mm, kind="proportional")
    else:
        logo = _p(issuer.trade_name, st["h1"])
    contact = "<br/>".join(escape(x) for x in [
        issuer.legal_name, f"RUC/NIT: {issuer.tax_id}" if issuer.tax_id else "",
        issuer.address, issuer.phone, issuer.email] if x)
    head_right = [
        _p("COTIZACIÓN", ParagraphStyle("t", parent=st["h1"], alignment=TA_RIGHT)),
        _p(f"N.º {meta.number}  ·  Versión {meta.version}", st["rightb"]),
        _p(f"Emisión: {fd(meta.issued_on)}", st["right"]),
        _p(f"Válida hasta: {fd(meta.valid_until)}", st["right"]),
    ]
    head = Table([[[logo, Spacer(1, 3), Paragraph(contact, st["small"])], head_right]],
                 colWidths=[width * 0.55, width * 0.45])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                              ("LINEBELOW", (0, 0), (-1, 0), 1.2, LIME),
                              ("BOTTOMPADDING", (0, 0), (-1, 0), 8)]))
    story += [head, Spacer(1, 8)]

    # Cliente y proyecto
    client_lines = [f"<b>{escape(meta.client_name)}</b>"] + [escape(x) for x in
                    (meta.client_company, meta.client_email, meta.client_phone) if x]
    info = Table([[[_p("Cliente", st["h2"]), Paragraph("<br/>".join(client_lines), st["base"])],
                   [_p("Evento / proyecto", st["h2"]), _p(meta.event_name, st["base"])]]],
                 colWidths=[width / 2, width / 2])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(info)
    if meta.description:
        story += [_p("Descripción de los servicios", st["h2"]), _p(meta.description, st["base"])]
    story.append(Spacer(1, 8))

    # Tabla de partidas (encabezado repetido en cada página; filas no se parten)
    cw = [width * 0.52, width * 0.12, width * 0.18, width * 0.18]
    rows = [[_p("Concepto", st["th"]), _p("Cant.", st["thr"]),
             _p("Precio unit.", st["thr"]), _p("Total", st["thr"])]]
    for ln in view["lines"]:
        qty = _qty(ln["quantity"]) + (f" {ln['unit']}" if ln.get("unit") else "")
        rows.append([_p(ln["description"], st["cell"]), _p(qty, st["right"]),
                     _p(fmt_usd(ln["unit_price"]), st["right"]), _p(fmt_usd(ln["total"]), st["right"])])
    table = Table(rows, colWidths=cw, repeatRows=1, splitByRow=1)
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 1, DEEP_GREEN),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)

    # Totales: siempre juntos, nunca aislados de la última partida
    tot = []
    if view["global_adjustment"]:
        tot.append(("Suma de partidas", fmt_usd(view["lines_subtotal"])))
        tot.append(("Ajuste de precio", fmt_usd(view["global_adjustment"])))
    tot.append(("Subtotal", fmt_usd(view["subtotal"])))
    if view["discount"]:
        tot.append(("Descuento", "-" + fmt_usd(view["discount"])))
    for t in view["taxes"]:
        tot.append((f"{t['name']} ({Decimal(t['rate_pct']).normalize():f} %)", fmt_usd(t["amount"])))
    tot_rows = [[_p(k, st["right"]), _p(v, st["right"])] for k, v in tot]
    tot_rows.append([_p(f"Total a pagar ({meta.currency})", st["rightb"]),
                     _p(fmt_usd(view["total"]), st["rightb"])])
    tt = Table(tot_rows, colWidths=[width * 0.30, width * 0.18], hAlign="RIGHT")
    tt.setStyle(TableStyle([("LINEABOVE", (0, -1), (-1, -1), 1.2, DEEP_GREEN),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.append(KeepTogether([Spacer(1, 6), tt]))

    # Condiciones
    conds = [("Condiciones de pago", meta.payment_terms), ("Anticipo solicitado", meta.advance),
             ("Plazo de ejecución", meta.execution_term),
             ("Vigencia de la oferta", f"Hasta el {fd(meta.valid_until)}"),
             ("Observaciones", meta.notes)]
    block = [_p("Condiciones comerciales", st["h2"])]
    for k, v in conds:
        if v:
            block.append(Paragraph(f"<b>{escape(k)}:</b> {escape(v)}", st["base"]))
    story.append(KeepTogether(block))

    if meta.acceptance_block:
        sig = Table([["", ""], [_p("Firma y nombre del cliente", st["small"]), _p("Fecha", st["small"])]],
                    colWidths=[width * 0.55, width * 0.3], rowHeights=[28, None], hAlign="LEFT")
        sig.setStyle(TableStyle([("LINEABOVE", (0, 1), (0, 1), 0.6, TEXT),
                                 ("LINEABOVE", (1, 1), (1, 1), 0.6, TEXT),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        story.append(KeepTogether([_p("Aceptación de la propuesta", st["h2"]), sig]))

    def on_page(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        contact = " · ".join(x for x in (issuer.trade_name, issuer.email, issuer.phone) if x)
        canvas.drawString(d.leftMargin, 10 * mm, contact)
        canvas.drawRightString(d.leftMargin + d.width, 10 * mm,
                               f"Cotización {meta.number} v{meta.version} · Página {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


def share_texts(meta: QuoteDocMeta) -> dict:
    """Textos para WhatsApp/correo. Abrir un enlace NO equivale a enviar."""
    from urllib.parse import quote
    msg = (f"Hola, {meta.client_name}. Te comparto la cotización correspondiente a "
           f"{meta.event_name}. En el documento encontrarás el detalle de los servicios, "
           "los importes y las condiciones de la propuesta. Quedo atento a tus comentarios. Saludos.")
    subject = f"Cotización {meta.number} — {meta.event_name}"
    phone = "".join(ch for ch in meta.client_phone if ch.isdigit())
    return {
        "message": msg,
        "subject": subject,
        "filename": f"Cotizacion_{meta.number}_v{meta.version}.pdf",
        "whatsapp_url": f"https://wa.me/{phone}?text={quote(msg)}" if phone else None,
        "mailto_url": (f"mailto:{meta.client_email}?subject={quote(subject)}&body={quote(msg)}"
                       if meta.client_email else None),
        "note": "El enlace abre una conversación o un borrador; adjunte el PDF descargado "
                "si su dispositivo no permite compartir archivos.",
    }
