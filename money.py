"""Aritmética monetaria con precisión decimal.

Política de redondeo de NexoSaldo:
- Todos los importes se manejan como ``decimal.Decimal`` (nunca ``float``).
- Los cálculos intermedios conservan precisión completa.
- Los importes monetarios se redondean a 2 decimales con ROUND_HALF_UP
  (0.005 -> 0.01) en el momento de **persistir o mostrar** un importe.
- Los porcentajes se redondean a 2 decimales sólo para mostrarlos.
- Las divisiones con denominador cero devuelven ``None`` ("sin base válida").
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from typing import Optional, Union

Number = Union[Decimal, int, str]

CENT = Decimal("0.01")
ZERO = Decimal("0")
HUNDRED = Decimal("100")


class MoneyError(ValueError):
    """Error de validación en un importe o porcentaje."""


def D(value: Number | None) -> Decimal:
    """Convierte a Decimal rechazando float (fuente típica de errores)."""
    if value is None:
        return ZERO
    if isinstance(value, float):
        raise MoneyError("Use Decimal o str para importes; float no está permitido.")
    if isinstance(value, Decimal):
        d = value
    else:
        try:
            d = Decimal(str(value).strip().replace(",", ""))
        except InvalidOperation as exc:
            raise MoneyError(f"Importe inválido: {value!r}") from exc
    if not d.is_finite():
        raise MoneyError(f"Importe no finito: {value!r}")
    return d


def money(value: Number | None) -> Decimal:
    """Redondea un importe a centavos (ROUND_HALF_UP)."""
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def pct(value: Number | None) -> Decimal:
    """Redondea un porcentaje a 2 decimales para mostrarlo."""
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)


def safe_div(num: Number, den: Number) -> Optional[Decimal]:
    """División segura: devuelve None cuando el denominador es cero."""
    n, d = D(num), D(den)
    if d == ZERO:
        return None
    with localcontext() as ctx:
        ctx.prec = 34
        return n / d


def ratio_pct(num: Number, den: Number) -> Optional[Decimal]:
    """num / den × 100, o None si no hay base válida."""
    r = safe_div(num, den)
    return None if r is None else r * HUNDRED


def fmt_usd(value: Number | None, symbol: str = "$") -> str:
    """Formato de visualización: $1,234.56 / -$1,234.56."""
    v = money(value)
    sign = "-" if v < 0 else ""
    return f"{sign}{symbol}{abs(v):,.2f}"


def fmt_pct(value: Optional[Decimal], empty: str = "Sin base de comparación") -> str:
    if value is None:
        return empty
    return f"{pct(value)} %"
