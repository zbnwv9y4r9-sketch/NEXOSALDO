"""Pruebas de la capa financiera. Números de las pruebas = sección 23 del prompt."""
import unittest
from datetime import date
from decimal import Decimal as Dec

from nexosaldo.finance.budget import (BudgetLight, Expense, ExpenseStatus, Thresholds,
                                      allocate_general_expense, evaluate)
from nexosaldo.finance.compare import EventFacts, compare_periods, period_metrics, ranking, variation
from nexosaldo.finance.income import Sale, sale_from_accepted_quote
from nexosaldo.finance.money import MoneyError, D, fmt_pct, fmt_usd, money
from nexosaldo.finance.quotes import (DiscountType, PriceMethod, Quote, QuoteLine, QuoteStatus,
                                      TaxRate, check_transition, client_view, compute_quote,
                                      price_from_margin, price_from_markup)
from nexosaldo.finance.results import (SavingsLedger, Shareholder, distributable_profit,
                                       operating_profit, propose_distribution, propose_savings)


class MoneyTests(unittest.TestCase):
    def test_float_rejected_and_rounding(self):
        with self.assertRaises(MoneyError):
            D(0.1)
        self.assertEqual(money("0.1") + money("0.2"), Dec("0.30"))
        self.assertEqual(money("2.675"), Dec("2.68"))  # HALF_UP, no error binario
        self.assertEqual(fmt_usd("-1234.5"), "-$1,234.50")
        self.assertEqual(fmt_pct(None), "Sin base de comparación")


class BudgetTests(unittest.TestCase):
    # 3. presupuesto y gastos reales
    def test_budget_formulas(self):
        r = evaluate({"Personal": "1000", "Transporte": "500"}, [
            Expense("g1", "Personal", Dec("900"), Dec("900")),
            Expense("g2", "Transporte", Dec("600"), Dec("0")),
        ])
        self.assertEqual(r.budgeted, Dec("1500.00"))
        self.assertEqual(r.actual, Dec("1500.00"))
        self.assertEqual(r.balance, Dec("0.00"))
        self.assertEqual(r.execution_pct, Dec("100"))
        self.assertEqual(r.paid, Dec("900.00"))
        self.assertEqual(r.payable, Dec("600.00"))  # gasto pendiente sí afecta rentabilidad
        pers, transp = r.categories
        self.assertEqual(pers.light, BudgetLight.YELLOW)   # 90 % >= 85 %
        self.assertEqual(transp.light, BudgetLight.RED)    # 120 %
        self.assertEqual(transp.variance, Dec("100.00"))
        self.assertEqual(transp.variance_pct, Dec("20"))

    def test_zero_budget_no_division(self):
        r = evaluate({"Otros": "0"}, [Expense("g1", "Otros", Dec("50"))])
        self.assertIsNone(r.execution_pct)
        self.assertIsNone(r.variance_pct)
        self.assertEqual(r.light, BudgetLight.RED)
        self.assertEqual(evaluate({}, []).light, BudgetLight.NONE)

    def test_custom_thresholds_and_unbudgeted_category(self):
        r = evaluate({"A": "100"}, [Expense("1", "A", Dec("70")), Expense("2", "Nueva", Dec("5"))],
                     Thresholds(Dec("60"), Dec("100")))
        self.assertEqual(r.categories[0].light, BudgetLight.YELLOW)
        self.assertEqual(r.categories[1].category, "Nueva")

    # 20. prevención de duplicados + anulaciones
    def test_duplicate_and_voided_expenses(self):
        e = Expense("g1", "A", Dec("100"))
        r = evaluate({"A": "1000"}, [e, e, Expense("g2", "A", Dec("40"), voided=True)])
        self.assertEqual(r.actual, Dec("100.00"))

    def test_expense_status(self):
        self.assertEqual(Expense("1", "A", Dec("100")).status, ExpenseStatus.PENDING)
        self.assertEqual(Expense("1", "A", Dec("100"), Dec("30")).status, ExpenseStatus.PARTIAL)
        self.assertEqual(Expense("1", "A", Dec("100"), Dec("100")).status, ExpenseStatus.PAID)

    def test_general_expense_allocation_exact(self):
        out = allocate_general_expense("100.00", {"E1": 1, "E2": 1, "E3": 1})
        self.assertEqual(sum(out.values()), Dec("100.00"))
        self.assertEqual(sorted(out.values()), [Dec("33.33"), Dec("33.33"), Dec("33.34")])


class QuoteTests(unittest.TestCase):
    # 4. recargo sobre costo
    def test_markup(self):
        self.assertEqual(money(price_from_markup("1000", "30")), Dec("1300.00"))
        s = compute_quote(Quote((QuoteLine("Equipo", Dec(1), Dec("1000"), PriceMethod.MARKUP, Dec("30")),)))
        self.assertEqual(s.gross_profit, Dec("300.00"))
        self.assertEqual(s.lines[0].markup_pct, Dec("30"))

    # 5. margen sobre la venta
    def test_margin(self):
        self.assertEqual(money(price_from_margin("1000", "30")), Dec("1428.57"))
        s = compute_quote(Quote((QuoteLine("Equipo", Dec(1), Dec("1000"), PriceMethod.MARGIN, Dec("30")),)))
        self.assertEqual(s.gross_profit, Dec("428.57"))
        self.assertEqual(round(s.margin_pct, 2), Dec("30.00"))
        for bad in ("100", "120"):
            with self.assertRaises(MoneyError):
                price_from_margin("1000", bad)

    # 6. precio manual se conserva
    def test_manual_price_preserved(self):
        line = QuoteLine("Decoración", Dec(2), Dec("400"), PriceMethod.MANUAL, manual_unit_price=Dec("650"))
        s1 = compute_quote(Quote((line,)))
        self.assertTrue(s1.lines[0].is_manual)
        self.assertEqual(s1.subtotal, Dec("1300.00"))
        s2 = compute_quote(Quote((line.with_cost("500"),)))
        self.assertEqual(s2.subtotal, Dec("1300.00"))          # precio intacto
        self.assertEqual(s2.gross_profit, Dec("300.00"))       # ganancia actualizada
        s3 = compute_quote(Quote((line.with_cost("500").back_to_auto(PriceMethod.MARKUP, "10"),)))
        self.assertEqual(s3.subtotal, Dec("1100.00"))

    def test_global_rate_not_applied_twice(self):
        lines = (QuoteLine("A", Dec(1), Dec("100")),  # GLOBAL
                 QuoteLine("B", Dec(1), Dec("100"), PriceMethod.MARKUP, Dec("50")))
        s = compute_quote(Quote(lines, PriceMethod.MARKUP, Dec("20")))
        self.assertEqual([l.sale_total for l in s.lines], [Dec("120.00"), Dec("150.00")])

    def test_global_manual_price_keeps_lines(self):
        lines = (QuoteLine("A", Dec(1), Dec("100"), PriceMethod.MARKUP, Dec("20")),)
        s = compute_quote(Quote(lines, manual_subtotal=Dec("200")))
        self.assertEqual(s.lines[0].sale_total, Dec("120.00"))
        self.assertEqual(s.global_adjustment, Dec("80.00"))
        self.assertEqual(s.gross_profit, Dec("100.00"))

    # 7. descuentos e impuestos
    def test_discount_and_taxes(self):
        lines = (QuoteLine("Servicio", Dec(1), Dec("700"), PriceMethod.MANUAL, manual_unit_price=Dec("1000")),
                 QuoteLine("Exento", Dec(1), Dec("0"), PriceMethod.MANUAL, manual_unit_price=Dec("1000"),
                           taxable=False))
        s = compute_quote(Quote(lines, discount_type=DiscountType.PERCENT, discount_value=Dec("10"),
                                taxes=(TaxRate("ITBMS", Dec("7")),)))
        self.assertEqual(s.subtotal, Dec("2000.00"))
        self.assertEqual(s.discount, Dec("200.00"))
        self.assertEqual(s.net_sales, Dec("1800.00"))
        self.assertEqual(s.tax_total, Dec("63.00"))      # 7 % de 900 (mitad gravada)
        self.assertEqual(s.total, Dec("1863.00"))
        self.assertEqual(s.gross_profit, Dec("1100.00"))  # impuestos no son ingreso
        with self.assertRaises(MoneyError):
            compute_quote(Quote(lines, discount_type=DiscountType.AMOUNT, discount_value=Dec("5000")))

    # 9/23. vista cliente no expone datos internos
    def test_client_view_whitelist(self):
        s = compute_quote(Quote((QuoteLine("A", Dec(1), Dec("100"), PriceMethod.MARGIN, Dec("40")),)))
        flat = repr(client_view(s))
        for forbidden in ("unit_cost", "cost", "margin", "markup", "profit"):
            self.assertNotIn(forbidden, flat)

    def test_status_transitions(self):
        check_transition(QuoteStatus.DRAFT, QuoteStatus.ISSUED)
        with self.assertRaises(MoneyError):
            check_transition(QuoteStatus.REJECTED, QuoteStatus.ACCEPTED)


class IncomeTests(unittest.TestCase):
    # 12. cotización ≠ venta ≠ factura ≠ cobro ; 13. pagos parciales
    def test_quote_sale_invoice_payment(self):
        sales = []
        sale = sale_from_accepted_quote("S1", "Q1v2", "1000", "70", sales)
        sales.append(sale)
        self.assertEqual(sale.collected, Dec("0"))   # aceptado no es cobrado
        with self.assertRaises(MoneyError):
            sale_from_accepted_quote("S2", "Q1v2", "1000", "70", sales)
        sale.add_invoice("F-1", "1070")
        with self.assertRaises(MoneyError):
            sale.add_invoice("F-1", "10")              # factura duplicada
        with self.assertRaises(MoneyError):
            sale.add_invoice("F-2", "1")               # supera total
        sale.add_payment("p1", "500", "F-1")
        sale.add_payment("p1", "500", "F-1")           # reintento idempotente
        self.assertEqual(sale.status, "parcialmente_cobrado")
        self.assertEqual(sale.receivable, Dec("570.00"))
        with self.assertRaises(MoneyError):
            sale.add_payment("p2", "600")
        sale.add_payment("p2", "570")
        self.assertEqual(sale.status, "cobrado")
        self.assertEqual(sale.net_amount, Dec("1000.00"))  # ingreso propio sin impuestos


class ResultsTests(unittest.TestCase):
    holders = [Shareholder("A", "Ana", Dec("50"), date(2025, 1, 1)),
               Shareholder("B", "Beto", Dec("30"), date(2025, 1, 1)),
               Shareholder("C", "Cira", Dec("20"), date(2025, 1, 1))]

    # 15. ejemplo de la sección 15
    def test_distribution_example(self):
        p = operating_profit("10000", "6000")
        d = distributable_profit(p.operating_profit, approved_savings="400")
        self.assertEqual(d.available, Dec("3600.00"))
        prop = propose_distribution(d.available, self.holders, date(2026, 10, 1))
        self.assertEqual([l.amount for l in prop.lines], [Dec("1800.00"), Dec("1080.00"), Dec("720.00")])

    # 16. participaciones al 100 %
    def test_shares_must_total_100(self):
        bad = self.holders[:2]
        with self.assertRaises(MoneyError):
            propose_distribution("1000", bad, date(2026, 1, 1))
        ended = [Shareholder("A", "Ana", Dec("50"), date(2025, 1, 1), end=date(2025, 12, 31))] + self.holders[1:]
        with self.assertRaises(MoneyError):
            propose_distribution("1000", ended, date(2026, 6, 1))

    # 17. bloqueo de distribución superior a lo disponible + utilidad negativa
    def test_cannot_overdistribute(self):
        with self.assertRaises(MoneyError):
            propose_distribution("1000", self.holders, date(2026, 1, 1), amount_to_distribute="1000.01")
        d = distributable_profit(operating_profit("1000", "3000").operating_profit)
        self.assertEqual(d.available, Dec("0"))
        prop = propose_distribution(d.available, self.holders, date(2026, 1, 1))
        self.assertEqual(prop.total, Dec("0"))

    def test_distribution_rounding_exact(self):
        h = [Shareholder("A", "A", Dec("33.33"), date(2025, 1, 1)),
             Shareholder("B", "B", Dec("33.33"), date(2025, 1, 1)),
             Shareholder("C", "C", Dec("33.34"), date(2025, 1, 1))]
        self.assertEqual(propose_distribution("100.01", h, date(2026, 1, 1)).total, Dec("100.01"))

    # 14. ahorro sin duplicar gastos
    def test_savings_not_an_expense(self):
        p = operating_profit("10000", "6000")
        proposal = propose_savings(p.operating_profit, "10")
        self.assertEqual(proposal, Dec("400.00"))
        led = SavingsLedger()
        led.contribute("s1", proposal, date(2026, 10, 5), available_cash="5000")
        led.contribute("s1", proposal, date(2026, 10, 5), available_cash="5000")  # idempotente
        self.assertEqual(led.balance(), Dec("400.00"))
        self.assertEqual(p.expenses, Dec("6000.00"))  # el ahorro no tocó los gastos
        with self.assertRaises(MoneyError):
            led.contribute("s2", "9999", date(2026, 10, 6), available_cash="100")
        with self.assertRaises(MoneyError):
            led.withdraw("w1", "401", date(2026, 10, 7))
        led.withdraw("w1", "100", date(2026, 10, 7))
        self.assertEqual(led.month_totals(2026, 10), (Dec("400.00"), Dec("100.00")))
        self.assertEqual(propose_savings("-50", "10"), Dec("0"))


class CompareTests(unittest.TestCase):
    def ev(self, i, name, d, rev, exp, status="finalizado"):
        return EventFacts(str(i), name, "feria", d, status, Dec(rev), Dec(exp),
                          invoiced=Dec(rev), collected=Dec(rev) / 2)

    # 1/2. varios eventos en el mismo mes, separados ; 18. comparativos
    def test_monthly_comparison(self):
        evs = [self.ev(1, "Boda A", date(2026, 9, 5), "5000", "3000"),
               self.ev(2, "Expo", date(2026, 9, 20), "5000", "3000"),
               self.ev(3, "Boda A", date(2026, 10, 3), "6000", "4500"),
               self.ev(4, "Gala", date(2026, 10, 10), "4000", "3500"),
               self.ev(5, "Gala 2", date(2026, 10, 10), "4000", "3500")]
        sep = period_metrics(evs, date(2026, 9, 1), date(2026, 9, 30))
        oct_ = period_metrics(evs, date(2026, 10, 1), date(2026, 10, 31))
        self.assertEqual((sep["eventos"], oct_["eventos"]), (2, 3))
        self.assertEqual(sep["utilidad"], Dec("4000.00"))
        c = compare_periods(evs, (date(2026, 9, 1), date(2026, 9, 30)), (date(2026, 10, 1), date(2026, 10, 31)))
        ing = next(v for v in c.variations if v.metric == "ingresos")
        self.assertEqual(ing.delta, Dec("4000.00"))
        self.assertEqual(ing.delta_pct, Dec("40"))
        self.assertEqual(c.new_events, {"Gala", "Gala 2"})
        self.assertEqual(c.not_repeated, {"Expo"})
        self.assertTrue(any("Caída de rentabilidad" in a for a in c.alerts))
        self.assertEqual(ranking(evs)[0].name, "Boda A")

    # 19. meses sin datos
    def test_empty_month(self):
        m = period_metrics([], date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(m["eventos"], 0)
        self.assertIsNone(m["margen_pct"])
        self.assertIsNone(m["promedio_por_evento"])
        self.assertIsNone(variation("ingresos", Dec("0"), Dec("500")).delta_pct)

    # 24. evento cancelado conserva sus cifras pero no entra al ranking
    def test_cancelled_event(self):
        evs = [self.ev(1, "X", date(2026, 10, 1), "0", "800", status="cancelado"),
               self.ev(2, "Y", date(2026, 10, 2), "100", "50")]
        m = period_metrics(evs, date(2026, 10, 1), date(2026, 10, 31))
        self.assertEqual(m["gastos"], Dec("850.00"))   # gastos incurridos se conservan
        self.assertEqual([e.name for e in ranking(evs)], ["Y"])


if __name__ == "__main__":
    unittest.main()
