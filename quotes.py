"""Cotizaciones al cliente: partidas, métodos de precio y resumen de rentabilidad.

Tres conceptos separados:
  1. Presupuesto interno (cuánto se estima gastar)    -> budget.py
  2. Gastos reales (cuánto cuesta realmente)          -> budget.py
  3. Cotización al cliente (cuánto se cobrará)        -> este módulo

Métodos de precio por partida:
  A) MARKUP  — recargo sobre el costo:   precio = costo × (1 + r/100)
  B) MARGIN  — margen sobre la venta:    precio = costo / (1 − m/100), m < 100
  C) MANUAL  — precio introducido por el usuario; nunca se recalcula solo.
  GLOBAL     — la partida usa el método/porcentaje global de la cotización.
              Una partida GLOBAL nunca recibe además un porcentaje propio,
              de modo que el margen no se aplica dos veces.

Los impuestos se calculan sobre la base neta (subtotal − descuento) y NO
forman parte del ingreso propio ni de la ganancia.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from decimal import Decimal
from enum import Enum
from typing import Optional

from .money import D, HUNDRED, ZERO, MoneyError, Number, money, ratio_pct


class PriceMethod(str, Enum):
    MARKUP = "recargo"
    MARGIN = "margen"
    MANUAL = "manual"
    GLOBAL = "global"


class DiscountType(str, Enum):
    NONE = "ninguno"
    PERCENT = "porcentaje"
    AMOUNT = "importe"


class QuoteStatus(str, Enum):
    DRAFT = "borrador"
    ISSUED = "emitida"
    SENT = "enviada"
    ACCEPTED = "aceptada"
    REJECTED = "rechazada"
    EXPIRED = "vencida"
    CANCELLED = "cancelada"


# Transiciones permitidas. Una cotización aceptada no pasa a "cobrada":
# la aceptación comercial y el cobro son hechos distintos (ver income.py).
QUOTE_TRANSITIONS: dict[QuoteStatus, set[QuoteStatus]] = {
    QuoteStatus.DRAFT: {QuoteStatus.ISSUED, QuoteStatus.CANCELLED},
    QuoteStatus.ISSUED: {QuoteStatus.SENT, QuoteStatus.ACCEPTED, QuoteStatus.REJECTED,
                         QuoteStatus.EXPIRED, QuoteStatus.CANCELLED},
    QuoteStatus.SENT: {QuoteStatus.ACCEPTED, QuoteStatus.REJECTED,
                       QuoteStatus.EXPIRED, QuoteStatus.CANCELLED},
    QuoteStatus.ACCEPTED: {QuoteStatus.CANCELLED},
    QuoteStatus.REJECTED: set(),
    QuoteStatus.EXPIRED: set(),
    QuoteStatus.CANCELLED: set(),
}

# Estados en los que el contenido de la versión queda congelado.
FROZEN_STATUSES = {QuoteStatus.ISSUED, QuoteStatus.SENT, QuoteStatus.ACCEPTED,
                   QuoteStatus.REJECTED, QuoteStatus.EXPIRED, QuoteStatus.CANCELLED}


def check_transition(current: QuoteStatus, new: QuoteStatus) -> None:
    if new not in QUOTE_TRANSITIONS[current]:
        raise MoneyError(f"Transición no permitida: {current.value} → {new.value}")


def price_from_markup(cost: Number, markup_pct: Number) -> Decimal:
    if D(markup_pct) < ZERO:
        raise MoneyError("El recargo no puede ser negativo.")
    return D(cost) * (1 + D(markup_pct) / HUNDRED)


def price_from_margin(cost: Number, margin_pct: Number) -> Decimal:
    m = D(margin_pct)
    if m >= HUNDRED:
        raise MoneyError("El margen sobre la venta debe ser menor que 100 %.")
    if m < ZERO:
        raise MoneyError("El margen no puede ser negativo.")
    return D(cost) / (1 - m / HUNDRED)


@dataclass(frozen=True)
class QuoteLine:
    description: str
    quantity: Decimal
    unit_cost: Decimal                     # costo interno unitario (PRIVADO)
    method: PriceMethod = PriceMethod.GLOBAL
    rate_pct: Optional[Decimal] = None     # recargo o margen de la partida (PRIVADO)
    manual_unit_price: Optional[Decimal] = None
    unit: str = ""
    taxable: bool = True
    position: int = 0

    def with_cost(self, new_unit_cost: Number) -> "QuoteLine":
        """Cambia el costo sin tocar un precio manual."""
        return replace(self, unit_cost=D(new_unit_cost))

    def back_to_auto(self, method: PriceMethod, rate_pct: Number) -> "QuoteLine":
        if method == PriceMethod.MANUAL:
            raise MoneyError("Use un método automático.")
        return replace(self, method=method, rate_pct=D(rate_pct), manual_unit_price=None)


@dataclass
class LineResult:
    line: QuoteLine
    effective_method: PriceMethod
    is_manual: bool
    unit_price: Decimal
    cost_total: Decimal
    sale_total: Decimal
    profit: Decimal
    margin_pct: Optional[Decimal]   # ganancia / venta
    markup_pct: Optional[Decimal]   # ganancia / costo


@dataclass(frozen=True)
class TaxRate:
    name: str
    rate_pct: Decimal


@dataclass(frozen=True)
class Quote:
    lines: tuple[QuoteLine, ...]
    global_method: PriceMethod = PriceMethod.MARKUP
    global_rate_pct: Decimal = ZERO
    manual_subtotal: Optional[Decimal] = None   # precio global manual (antes de descuento)
    discount_type: DiscountType = DiscountType.NONE
    discount_value: Decimal = ZERO
    taxes: tuple[TaxRate, ...] = ()


@dataclass
class QuoteSummary:
    lines: list[LineResult] = field(default_factory=list)
    cost_total: Decimal = ZERO
    lines_subtotal: Decimal = ZERO
    global_adjustment: Decimal = ZERO   # diferencia por precio global manual
    subtotal: Decimal = ZERO
    discount: Decimal = ZERO
    net_sales: Decimal = ZERO           # ingreso propio (sin impuestos)
    tax_lines: list[tuple[str, Decimal, Decimal]] = field(default_factory=list)
    tax_total: Decimal = ZERO
    total: Decimal = ZERO               # total a pagar por el cliente
    gross_profit: Decimal = ZERO
    margin_pct: Optional[Decimal] = None


def _line_unit_price(line: QuoteLine, quote: Quote) -> tuple[PriceMethod, Decimal]:
    method = line.method
    rate = line.rate_pct
    if method == PriceMethod.GLOBAL:
        method, rate = quote.global_method, quote.global_rate_pct
        if method in (PriceMethod.GLOBAL, PriceMethod.MANUAL):
            raise MoneyError("El método global debe ser recargo o margen.")
    if method == PriceMethod.MANUAL:
        if line.manual_unit_price is None or D(line.manual_unit_price) < ZERO:
            raise MoneyError(f"Precio manual inválido en «{line.description}».")
        return method, D(line.manual_unit_price)
    if rate is None:
        raise MoneyError(f"Falta el porcentaje en «{line.description}».")
    if method == PriceMethod.MARKUP:
        return method, price_from_markup(line.unit_cost, rate)
    return method, price_from_margin(line.unit_cost, rate)


def compute_line(line: QuoteLine, quote: Quote) -> LineResult:
    if D(line.quantity) <= ZERO:
        raise MoneyError(f"Cantidad inválida en «{line.description}».")
    if D(line.unit_cost) < ZERO:
        raise MoneyError(f"Costo inválido en «{line.description}».")
    method, unit_price = _line_unit_price(line, quote)
    unit_price = money(unit_price)
    cost_total = money(D(line.quantity) * D(line.unit_cost))
    sale_total = money(D(line.quantity) * unit_price)
    profit = sale_total - cost_total
    return LineResult(line=line, effective_method=method,
                      is_manual=method == PriceMethod.MANUAL,
                      unit_price=unit_price, cost_total=cost_total,
                      sale_total=sale_total, profit=profit,
                      margin_pct=ratio_pct(profit, sale_total),
                      markup_pct=ratio_pct(profit, cost_total))


def compute_quote(quote: Quote) -> QuoteSummary:
    s = QuoteSummary()
    s.lines = [compute_line(l, quote) for l in sorted(quote.lines, key=lambda l: l.position)]
    s.cost_total = money(sum((r.cost_total for r in s.lines), ZERO))
    s.lines_subtotal = money(sum((r.sale_total for r in s.lines), ZERO))

    # Precio global manual: se reporta como ajuste, sin modificar las partidas.
    if quote.manual_subtotal is not None:
        if D(quote.manual_subtotal) < ZERO:
            raise MoneyError("El precio global manual no puede ser negativo.")
        s.subtotal = money(quote.manual_subtotal)
        s.global_adjustment = s.subtotal - s.lines_subtotal
    else:
        s.subtotal = s.lines_subtotal

    # Descuento
    if quote.discount_type == DiscountType.PERCENT:
        if not (ZERO <= D(quote.discount_value) <= HUNDRED):
            raise MoneyError("El descuento porcentual debe estar entre 0 y 100.")
        s.discount = money(s.subtotal * D(quote.discount_value) / HUNDRED)
    elif quote.discount_type == DiscountType.AMOUNT:
        if D(quote.discount_value) < ZERO or D(quote.discount_value) > s.subtotal:
            raise MoneyError("El descuento no puede ser negativo ni mayor que el subtotal.")
        s.discount = money(quote.discount_value)
    s.net_sales = s.subtotal - s.discount

    # Base imponible: porción gravada de la venta neta (descuento prorrateado).
    taxable_lines = sum((r.sale_total for r in s.lines if r.line.taxable), ZERO)
    if s.lines_subtotal > ZERO:
        taxable_base = money(s.net_sales * taxable_lines / s.lines_subtotal)
    else:
        taxable_base = ZERO
    for t in quote.taxes:
        if D(t.rate_pct) < ZERO:
            raise MoneyError("La tasa de impuesto no puede ser negativa.")
        amount = money(taxable_base * D(t.rate_pct) / HUNDRED)
        s.tax_lines.append((t.name, D(t.rate_pct), amount))
    s.tax_total = money(sum((a for _, _, a in s.tax_lines), ZERO))
    s.total = s.net_sales + s.tax_total

    # Rentabilidad: los impuestos NO son ingreso propio.
    s.gross_profit = s.net_sales - s.cost_total
    s.margin_pct = ratio_pct(s.gross_profit, s.net_sales)
    return s


def client_view(summary: QuoteSummary) -> dict:
    """Datos permitidos para documentos del cliente (lista blanca).

    Se construye con lista blanca, no restando campos, para que ningún campo
    interno nuevo (costos, márgenes, utilidades) se filtre por accidente.
    """
    return {
        "lines": [{
            "description": r.line.description,
            "quantity": D(r.line.quantity),
            "unit": r.line.unit,
            "unit_price": r.unit_price,
            "total": r.sale_total,
        } for r in summary.lines],
        "lines_subtotal": summary.lines_subtotal,
        "global_adjustment": summary.global_adjustment,
        "subtotal": summary.subtotal,
        "discount": summary.discount,
        "taxes": [{"name": n, "rate_pct": r, "amount": a} for n, r, a in summary.tax_lines],
        "total": summary.total,
    }
