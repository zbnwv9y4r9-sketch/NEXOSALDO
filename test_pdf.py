"""8/9/23. PDF real, multipágina, sin información confidencial."""
import io
import unittest
from datetime import date
from decimal import Decimal as Dec

import pdfplumber

from nexosaldo.finance.quotes import (DiscountType, PriceMethod, Quote, QuoteLine, TaxRate,
                                      client_view, compute_quote)
from nexosaldo.pdf.quote_pdf import Issuer, QuoteDocMeta, build_quote_pdf, share_texts

ISSUER = Issuer("Eventos Brisa", "Eventos Brisa S.A.", "155-123-45", "hola@brisa.test",
                "+507 6000-0000", "Ciudad de Panamá")


def make(n_lines=3, **kw):
    lines = tuple(QuoteLine(f"Servicio número {i} con descripción larga de montaje y logística",
                            Dec(2), Dec("731.37"), PriceMethod.MARGIN, Dec("37.5"), position=i)
                  for i in range(n_lines))
    q = Quote(lines, discount_type=DiscountType.PERCENT, discount_value=Dec("5"),
              taxes=(TaxRate("ITBMS", Dec("7")),), **kw)
    s = compute_quote(q)
    meta = QuoteDocMeta("COT-2026-0007", 2, date(2026, 10, 21), date(2026, 11, 5),
                        "María Pérez", "Boda Pérez-Ruiz", client_company="Pérez & Asoc.",
                        client_email="maria@cliente.test", client_phone="+507 6111-2222",
                        payment_terms="50 % de anticipo, saldo 3 días antes del evento",
                        advance="50 %", execution_term="Evento del 15/11/2026")
    return s, build_quote_pdf(client_view(s), meta, ISSUER), meta


class PdfTests(unittest.TestCase):
    def test_real_pdf_and_totals(self):
        s, pdf, _ = make()
        self.assertTrue(pdf.startswith(b"%PDF-"))
        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            text = "\n".join(p.extract_text() for p in doc.pages)
        self.assertIn("COT-2026-0007", text)
        self.assertIn("María Pérez", text)
        self.assertIn(f"${s.total:,.2f}", text)
        self.assertIn("Eventos Brisa", text)

    def test_confidential_data_excluded(self):
        s, pdf, _ = make()
        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            text = "\n".join(p.extract_text() for p in doc.pages).lower()
        for secret in ("731.37", f"{s.cost_total:,.2f}", f"{s.gross_profit:,.2f}", "37.5",
                       "costo", "margen", "recargo", "utilidad", "ganancia", "accionista", "ahorro"):
            self.assertNotIn(secret.lower(), text, secret)

    def test_internal_fields_rejected(self):
        s, _, meta = make()
        view = client_view(s)
        view["lines"][0]["unit_cost"] = Dec("1")
        with self.assertRaises(ValueError):
            build_quote_pdf(view, meta, ISSUER)

    def test_multipage_keeps_totals_with_table(self):
        s, pdf, _ = make(60)
        with pdfplumber.open(io.BytesIO(pdf)) as doc:
            self.assertGreater(len(doc.pages), 1)
            last = doc.pages[-1].extract_text()
            # el total final aparece junto a partidas o condiciones, no aislado
            self.assertIn("Total a pagar", last)
            for p in doc.pages:
                self.assertIn("Concepto", p.extract_text())  # encabezado repetido
                for w in p.extract_words():
                    self.assertLessEqual(w["x1"], p.width)

    def test_share_texts_do_not_claim_sending(self):
        _, _, meta = make()
        t = share_texts(meta)
        self.assertTrue(t["whatsapp_url"].startswith("https://wa.me/50761112222?text="))
        self.assertIn("Cotizaci%C3%B3n%20COT-2026-0007", t["mailto_url"])
        self.assertIn("adjunte", t["note"])


if __name__ == "__main__":
    unittest.main()
