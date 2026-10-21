"""Comparativos entre períodos y entre eventos.

Variación monetaria  = actual − anterior
Variación porcentual = (actual − anterior) / anterior × 100, sólo con base válida.
Si el valor anterior es cero se informa "Sin base de comparación".

Cada métrica es de un tipo (cotizado, facturado, cobrado...) y nunca se compara
una métrica contra otra de distinto tipo.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional

from .money import D, ZERO, money, ratio_pct

METRICS = (
    "eventos", "ingresos", "gastos", "presupuesto", "utilidad", "margen_pct",
    "ahorro", "cotizaciones_emitidas", "cotizaciones_aceptadas", "importe_cotizado",
    "importe_facturado", "cobrado", "cuentas_por_cobrar", "promedio_por_evento",
)


@dataclass
class EventFacts:
    """Hechos financieros ya agregados de un evento (desde la base de datos)."""
    event_id: str
    name: str
    kind: str
    start: date
    status: str
    revenue: Decimal = ZERO          # ingreso reconocido
    expenses: Decimal = ZERO         # gasto reconocido
    budget: Decimal = ZERO
    quoted: Decimal = ZERO
    quotes_issued: int = 0
    quotes_accepted: int = 0
    invoiced: Decimal = ZERO
    collected: Decimal = ZERO
    savings: Decimal = ZERO

    @property
    def profit(self) -> Decimal:
        return money(D(self.revenue) - D(self.expenses))

    @property
    def margin_pct(self) -> Optional[Decimal]:
        return ratio_pct(self.profit, self.revenue)


def in_period(e: EventFacts, start: date, end: date) -> bool:
    return start <= e.start <= end


def period_metrics(events: Iterable[EventFacts], start: date, end: date) -> dict:
    ev = [e for e in events if in_period(e, start, end)]
    s = lambda attr: money(sum((D(getattr(e, attr)) for e in ev), ZERO))  # noqa: E731
    revenue, expenses = s("revenue"), s("expenses")
    profit = revenue - expenses
    invoiced = s("invoiced")
    return {
        "eventos": len(ev),
        "ingresos": revenue,
        "gastos": expenses,
        "presupuesto": s("budget"),
        "utilidad": profit,
        "margen_pct": ratio_pct(profit, revenue),
        "ahorro": s("savings"),
        "cotizaciones_emitidas": sum(e.quotes_issued for e in ev),
        "cotizaciones_aceptadas": sum(e.quotes_accepted for e in ev),
        "importe_cotizado": s("quoted"),
        "importe_facturado": invoiced,
        "cobrado": s("collected"),
        "cuentas_por_cobrar": money(invoiced - s("collected")),
        "promedio_por_evento": money(revenue / len(ev)) if ev else None,
        "_names": {e.name for e in ev},
    }


@dataclass
class Variation:
    metric: str
    previous: Optional[Decimal]
    current: Optional[Decimal]
    delta: Optional[Decimal]
    delta_pct: Optional[Decimal]   # None => "Sin base de comparación"


def variation(metric: str, previous, current) -> Variation:
    if previous is None or current is None:
        return Variation(metric, previous, current, None, None)
    p, c = D(previous), D(current)
    delta = c - p
    return Variation(metric, p, c, delta, ratio_pct(delta, p) if p != ZERO else None)


@dataclass
class PeriodComparison:
    variations: list[Variation] = field(default_factory=list)
    new_events: set[str] = field(default_factory=set)
    not_repeated: set[str] = field(default_factory=set)
    alerts: list[str] = field(default_factory=list)


def compare_periods(events: list[EventFacts], prev: tuple[date, date],
                    cur: tuple[date, date],
                    margin_drop_alert_pts: Decimal = Decimal("5")) -> PeriodComparison:
    a, b = period_metrics(events, *prev), period_metrics(events, *cur)
    out = PeriodComparison([variation(m, a[m], b[m]) for m in METRICS])
    out.new_events = b["_names"] - a["_names"]
    out.not_repeated = a["_names"] - b["_names"]
    if a["margen_pct"] is not None and b["margen_pct"] is not None:
        if a["margen_pct"] - b["margen_pct"] >= margin_drop_alert_pts:
            out.alerts.append("Caída de rentabilidad: el margen bajó "
                              f"{(a['margen_pct'] - b['margen_pct']).quantize(Decimal('0.01'))} puntos.")
    if b["utilidad"] < ZERO:
        out.alerts.append("El período actual presenta pérdida.")
    return out


def ranking(events: Iterable[EventFacts], by: str = "profit") -> list[EventFacts]:
    """Ranking por utilidad ('profit') o por margen ('margin'). Eventos sin
    ingresos (margen indefinido) van al final en el ranking por margen."""
    evs = [e for e in events if e.status != "cancelado"]
    if by == "margin":
        return sorted(evs, key=lambda e: (e.margin_pct is None, -(e.margin_pct or ZERO)))
    return sorted(evs, key=lambda e: -e.profit)
