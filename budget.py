"""Presupuesto frente a gastos reales.

Fórmulas (sección 6 del prompt maestro):
    Saldo presupuestario   = Presupuesto aprobado − Gastos reales
    Ejecución (%)          = Gastos reales / Presupuesto aprobado × 100
    Variación              = Gastos reales − Presupuesto aprobado
    Variación (%)          = Variación / Presupuesto aprobado × 100   (si hay base)

Regla contable: el gasto *reconocido* (pendiente, parcial o pagado) afecta la
rentabilidad aunque no haya salido dinero; los gastos anulados no cuentan.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Iterable, Optional

from .money import D, ZERO, Number, money, ratio_pct


class ExpenseStatus(str, Enum):
    PENDING = "pendiente"
    PARTIAL = "parcialmente_pagado"
    PAID = "pagado"


class BudgetLight(str, Enum):
    GREEN = "verde"      # dentro del presupuesto
    YELLOW = "amarillo"  # próximo al límite
    RED = "rojo"         # excedido
    NONE = "sin_presupuesto"


@dataclass(frozen=True)
class Expense:
    id: str
    category: str
    amount: Decimal                 # importe reconocido
    paid_amount: Decimal = ZERO     # pagos efectivamente realizados
    voided: bool = False            # anulado con motivo (no cuenta)
    event_id: Optional[str] = None  # None = gasto general de la empresa

    @property
    def status(self) -> ExpenseStatus:
        paid = D(self.paid_amount)
        if paid <= ZERO:
            return ExpenseStatus.PENDING
        if paid < D(self.amount):
            return ExpenseStatus.PARTIAL
        return ExpenseStatus.PAID

    @property
    def outstanding(self) -> Decimal:
        return money(max(D(self.amount) - D(self.paid_amount), ZERO))


@dataclass(frozen=True)
class Thresholds:
    """Umbrales configurables de alerta (porcentaje de ejecución)."""
    warning_pct: Decimal = Decimal("85")   # amarillo desde aquí
    exceeded_pct: Decimal = Decimal("100")  # rojo por encima de esto


@dataclass
class CategoryResult:
    category: str
    budgeted: Decimal
    actual: Decimal
    balance: Decimal
    execution_pct: Optional[Decimal]
    variance: Decimal
    variance_pct: Optional[Decimal]
    light: BudgetLight


@dataclass
class BudgetResult:
    categories: list[CategoryResult] = field(default_factory=list)
    budgeted: Decimal = ZERO
    actual: Decimal = ZERO
    paid: Decimal = ZERO
    payable: Decimal = ZERO
    balance: Decimal = ZERO
    execution_pct: Optional[Decimal] = None
    variance: Decimal = ZERO
    variance_pct: Optional[Decimal] = None
    light: BudgetLight = BudgetLight.NONE


def light_for(budgeted: Decimal, actual: Decimal, th: Thresholds) -> BudgetLight:
    if D(budgeted) == ZERO:
        return BudgetLight.RED if D(actual) > ZERO else BudgetLight.NONE
    execution = ratio_pct(actual, budgeted)
    assert execution is not None
    if execution > th.exceeded_pct:
        return BudgetLight.RED
    if execution >= th.warning_pct:
        return BudgetLight.YELLOW
    return BudgetLight.GREEN


def _dedupe(expenses: Iterable[Expense]) -> list[Expense]:
    """Evita contar dos veces la misma transacción (mismo id)."""
    seen: dict[str, Expense] = {}
    for e in expenses:
        seen[e.id] = e  # la última versión de la transacción prevalece
    return [e for e in seen.values() if not e.voided]


def evaluate(budget_by_category: dict[str, Number],
             expenses: Iterable[Expense],
             thresholds: Thresholds = Thresholds()) -> BudgetResult:
    exps = _dedupe(expenses)
    cats = list(budget_by_category.keys())
    for e in exps:
        if e.category not in cats:
            cats.append(e.category)  # gasto en categoría sin presupuesto

    res = BudgetResult()
    for cat in cats:
        b = money(budget_by_category.get(cat, ZERO))
        a = money(sum((D(e.amount) for e in exps if e.category == cat), ZERO))
        variance = a - b
        res.categories.append(CategoryResult(
            category=cat, budgeted=b, actual=a, balance=b - a,
            execution_pct=ratio_pct(a, b), variance=variance,
            variance_pct=ratio_pct(variance, b),
            light=light_for(b, a, thresholds)))

    res.budgeted = money(sum((c.budgeted for c in res.categories), ZERO))
    res.actual = money(sum((c.actual for c in res.categories), ZERO))
    res.paid = money(sum((min(D(e.paid_amount), D(e.amount)) for e in exps), ZERO))
    res.payable = money(sum((e.outstanding for e in exps), ZERO))
    res.balance = res.budgeted - res.actual
    res.execution_pct = ratio_pct(res.actual, res.budgeted)
    res.variance = res.actual - res.budgeted
    res.variance_pct = ratio_pct(res.variance, res.budgeted)
    res.light = light_for(res.budgeted, res.actual, thresholds)
    return res


def allocate_general_expense(amount: Number, weights: dict[str, Number]) -> dict[str, Decimal]:
    """Asigna un gasto general a eventos según una regla explícita (pesos).

    La suma de las asignaciones es exactamente igual al importe original: el
    centavo residual del redondeo se asigna al evento de mayor peso, de modo
    que el gasto nunca se duplica ni se pierde.
    """
    total_w = sum((D(w) for w in weights.values()), ZERO)
    if total_w <= ZERO:
        raise ValueError("La regla de asignación necesita pesos positivos.")
    amt = money(amount)
    out = {k: money(amt * D(w) / total_w) for k, w in weights.items()}
    residual = amt - sum(out.values(), ZERO)
    if residual:
        top = max(weights, key=lambda k: D(weights[k]))
        out[top] += residual
    return out

