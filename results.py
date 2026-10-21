"""Resultado financiero, ahorro y distribución de utilidades.

Utilidad operativa = Ingresos reconocidos − Gastos operativos reconocidos
Utilidad disponible = Utilidad operativa − Ahorro aprobado − Otras reservas
                      − Impuestos/obligaciones aplicables NO contabilizados antes
Participación       = Utilidad disponible × % de participación

El ahorro es una asignación interna de fondos: nunca se suma a los gastos.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from .money import D, HUNDRED, ZERO, MoneyError, Number, money, ratio_pct


# ---------------------------------------------------------------- resultado
@dataclass
class ProfitResult:
    revenue: Decimal
    expenses: Decimal
    operating_profit: Decimal
    margin_pct: Optional[Decimal]


def operating_profit(revenue: Number, expenses: Number) -> ProfitResult:
    r, e = money(revenue), money(expenses)
    p = r - e
    return ProfitResult(r, e, p, ratio_pct(p, r))


@dataclass
class Distributable:
    operating_profit: Decimal
    savings: Decimal
    other_reserves: Decimal
    pending_obligations: Decimal
    available: Decimal


def distributable_profit(op_profit: Number, approved_savings: Number = ZERO,
                         other_reserves: Number = ZERO,
                         unaccounted_obligations: Number = ZERO) -> Distributable:
    """Las obligaciones ya registradas como gasto NO deben pasarse aquí
    (se restarían dos veces); sólo las aún no contabilizadas."""
    for v in (approved_savings, other_reserves, unaccounted_obligations):
        if D(v) < ZERO:
            raise MoneyError("Reservas y obligaciones no pueden ser negativas.")
    op = money(op_profit)
    avail = op - money(approved_savings) - money(other_reserves) - money(unaccounted_obligations)
    return Distributable(op, money(approved_savings), money(other_reserves),
                         money(unaccounted_obligations), max(avail, ZERO))


# ------------------------------------------------------------------ ahorro
@dataclass
class SavingsMovement:
    key: str
    kind: str            # "aporte" | "retiro"
    amount: Decimal
    on: date
    goal: str = "General"


@dataclass
class SavingsLedger:
    movements: list[SavingsMovement] = field(default_factory=list)

    def balance(self, goal: Optional[str] = None) -> Decimal:
        total = ZERO
        for m in self.movements:
            if goal is not None and m.goal != goal:
                continue
            total += D(m.amount) if m.kind == "aporte" else -D(m.amount)
        return money(total)

    def _add(self, mv: SavingsMovement) -> SavingsMovement:
        for m in self.movements:
            if m.key == mv.key:
                return m  # idempotente
        self.movements.append(mv)
        return mv

    def contribute(self, key: str, amount: Number, on: date, available_cash: Number,
                   goal: str = "General") -> SavingsMovement:
        amt = money(amount)
        if amt <= ZERO:
            raise MoneyError("El aporte debe ser positivo.")
        if amt > money(available_cash):
            raise MoneyError("No se puede reservar más dinero del disponible.")
        return self._add(SavingsMovement(key, "aporte", amt, on, goal))

    def withdraw(self, key: str, amount: Number, on: date, goal: str = "General") -> SavingsMovement:
        amt = money(amount)
        if amt <= ZERO:
            raise MoneyError("El retiro debe ser positivo.")
        if amt > self.balance(goal):
            raise MoneyError("El retiro supera el saldo de la reserva.")
        return self._add(SavingsMovement(key, "retiro", amt, on, goal))

    def month_totals(self, year: int, month: int) -> tuple[Decimal, Decimal]:
        ins = sum((D(m.amount) for m in self.movements if m.kind == "aporte"
                   and (m.on.year, m.on.month) == (year, month)), ZERO)
        outs = sum((D(m.amount) for m in self.movements if m.kind == "retiro"
                    and (m.on.year, m.on.month) == (year, month)), ZERO)
        return money(ins), money(outs)


def propose_savings(op_profit: Number, rule_pct: Number) -> Decimal:
    """Propuesta (no aplicada) de reserva: % de la utilidad positiva."""
    if not (ZERO <= D(rule_pct) <= HUNDRED):
        raise MoneyError("El porcentaje de ahorro debe estar entre 0 y 100.")
    p = money(op_profit)
    return money(p * D(rule_pct) / HUNDRED) if p > ZERO else ZERO


def goal_progress(balance: Number, target: Number) -> Optional[Decimal]:
    return ratio_pct(balance, target)


# ------------------------------------------------------------- accionistas
@dataclass(frozen=True)
class Shareholder:
    id: str
    name: str
    share_pct: Decimal
    start: date
    end: Optional[date] = None
    active: bool = True

    def is_effective(self, on: date) -> bool:
        return self.active and self.start <= on and (self.end is None or on <= self.end)


def effective_shareholders(holders: list[Shareholder], on: date) -> list[Shareholder]:
    return [h for h in holders if h.is_effective(on)]


def shares_total(holders: list[Shareholder], on: date) -> Decimal:
    return sum((D(h.share_pct) for h in effective_shareholders(holders, on)), ZERO)


@dataclass
class DistributionLine:
    shareholder_id: str
    name: str
    share_pct: Decimal       # porcentaje congelado al calcular
    amount: Decimal


@dataclass
class DistributionProposal:
    on: date
    available: Decimal
    lines: list[DistributionLine]
    status: str = "propuesta"   # propuesta -> aprobada -> pagada (por líneas)

    @property
    def total(self) -> Decimal:
        return money(sum((l.amount for l in self.lines), ZERO))


def propose_distribution(available: Number, holders: list[Shareholder], on: date,
                         amount_to_distribute: Optional[Number] = None) -> DistributionProposal:
    """Calcula la distribución; exige participaciones vigentes = 100 %."""
    avail = money(available)
    eff = effective_shareholders(holders, on)
    total_pct = shares_total(holders, on)
    if total_pct != HUNDRED:
        raise MoneyError(f"Las participaciones vigentes suman {total_pct} %, deben sumar 100 %.")
    amount = avail if amount_to_distribute is None else money(amount_to_distribute)
    if amount < ZERO:
        raise MoneyError("El importe a distribuir no puede ser negativo.")
    if amount > avail:
        raise MoneyError("No se puede distribuir más que la utilidad disponible.")
    if avail <= ZERO:
        amount = ZERO  # utilidad negativa o nula: no hay repartos ficticios
    lines = [DistributionLine(h.id, h.name, D(h.share_pct),
                              money(amount * D(h.share_pct) / HUNDRED)) for h in eff]
    residual = amount - sum((l.amount for l in lines), ZERO)
    if residual and lines:
        max(lines, key=lambda l: l.share_pct).amount += residual
    return DistributionProposal(on, avail, lines)
