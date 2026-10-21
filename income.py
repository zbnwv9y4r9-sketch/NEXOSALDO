"""Ventas, facturas y cobros.

Cotizado ≠ Aceptado ≠ Facturado ≠ Cobrado.

- Una cotización aceptada genera (una sola vez) una *venta* por el importe
  neto aceptado (sin impuestos). Es el ingreso reconocido.
- Las facturas se vinculan a la venta; no crean ingreso adicional. La suma
  facturada nunca supera el total de la venta (incluidos impuestos).
- Los cobros se vinculan a la venta (y opcionalmente a una factura). Se
  admiten cobros parciales y múltiples; cada cobro tiene una clave de
  idempotencia para que un reintento no lo registre dos veces.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from .money import D, ZERO, MoneyError, Number, money


@dataclass
class Payment:
    key: str                 # clave de idempotencia
    amount: Decimal
    invoice_id: Optional[str] = None
    voided: bool = False


@dataclass
class Invoice:
    id: str
    amount: Decimal          # total facturado (incluye impuestos)
    voided: bool = False


@dataclass
class Sale:
    """Operación de venta (normalmente originada en una cotización aceptada)."""
    id: str
    net_amount: Decimal       # ingreso reconocido (sin impuestos)
    tax_amount: Decimal = ZERO  # impuestos por cuenta de la autoridad fiscal
    source_quote_version_id: Optional[str] = None
    invoices: list[Invoice] = field(default_factory=list)
    payments: list[Payment] = field(default_factory=list)

    @property
    def gross_amount(self) -> Decimal:
        return money(D(self.net_amount) + D(self.tax_amount))

    @property
    def invoiced(self) -> Decimal:
        return money(sum((D(i.amount) for i in self.invoices if not i.voided), ZERO))

    @property
    def collected(self) -> Decimal:
        return money(sum((D(p.amount) for p in self.payments if not p.voided), ZERO))

    @property
    def receivable(self) -> Decimal:
        return self.gross_amount - self.collected

    @property
    def status(self) -> str:
        if self.collected <= ZERO:
            return "pendiente"
        if self.collected < self.gross_amount:
            return "parcialmente_cobrado"
        return "cobrado"

    def add_invoice(self, invoice_id: str, amount: Number) -> Invoice:
        if any(i.id == invoice_id for i in self.invoices):
            raise MoneyError("La factura ya está vinculada a esta venta.")
        amt = money(amount)
        if amt <= ZERO:
            raise MoneyError("El importe facturado debe ser positivo.")
        if self.invoiced + amt > self.gross_amount:
            raise MoneyError("La facturación superaría el total de la venta.")
        inv = Invoice(invoice_id, amt)
        self.invoices.append(inv)
        return inv

    def add_payment(self, key: str, amount: Number, invoice_id: Optional[str] = None) -> Payment:
        for p in self.payments:
            if p.key == key:
                if p.amount != money(amount):
                    raise MoneyError("Clave de cobro reutilizada con otro importe.")
                return p  # reintento idempotente: no se duplica
        amt = money(amount)
        if amt <= ZERO:
            raise MoneyError("El cobro debe ser positivo.")
        if amt > self.receivable:
            raise MoneyError("El cobro supera el saldo pendiente.")
        if invoice_id is not None and not any(i.id == invoice_id and not i.voided
                                              for i in self.invoices):
            raise MoneyError("La factura indicada no pertenece a esta venta.")
        p = Payment(key, amt, invoice_id)
        self.payments.append(p)
        return p


def sale_from_accepted_quote(sale_id: str, quote_version_id: str, net_sales: Number,
                             tax_total: Number, existing: list[Sale]) -> Sale:
    """Convierte una versión aceptada en venta, una sola vez."""
    for s in existing:
        if s.source_quote_version_id == quote_version_id:
            raise MoneyError("Esta cotización ya se convirtió en venta.")
    return Sale(sale_id, money(net_sales), money(tax_total), quote_version_id)
