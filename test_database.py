"""Pruebas de integración contra PostgreSQL real (RLS, inmutabilidad, duplicados).

Requiere un servidor accesible con psql. Variables:
  NEXOSALDO_TEST_PG="-h /ruta/socket -p 5544 -U postgres"
Si no está definida, las pruebas se omiten (no se simulan).
"""
import os
import shlex
import subprocess
import unittest
import uuid
from pathlib import Path

PG = os.environ.get("NEXOSALDO_TEST_PG")
MIGRATION = Path(__file__).resolve().parents[1] / "db" / "migrations" / "0001_init.sql"

A_USER, B_USER = str(uuid.uuid4()), str(uuid.uuid4())
A_CO, B_CO = str(uuid.uuid4()), str(uuid.uuid4())
A_CAT, B_CAT = str(uuid.uuid4()), str(uuid.uuid4())
A_EV, B_EV = str(uuid.uuid4()), str(uuid.uuid4())


def psql(sql: str, db: str, user_id: str | None = None) -> subprocess.CompletedProcess:
    prefix = ""
    if user_id:
        prefix = f"SET ROLE nexosaldo_app; SET app.user_id = '{user_id}';\n"
    return subprocess.run(["psql", *shlex.split(PG), "-d", db, "-X", "-q", "-t", "-A",
                           "-v", "ON_ERROR_STOP=1", "-c", prefix + sql],
                          capture_output=True, text=True)


@unittest.skipUnless(PG, "NEXOSALDO_TEST_PG no definido: se omiten pruebas de base de datos")
class DatabaseTests(unittest.TestCase):
    db = "nexosaldo_test_" + uuid.uuid4().hex[:8]

    @classmethod
    def setUpClass(cls):
        subprocess.run(["createdb", *shlex.split(PG), cls.db], check=True)
        r = subprocess.run(["psql", *shlex.split(PG), "-d", cls.db, "-X", "-q",
                            "-v", "ON_ERROR_STOP=1", "-f", str(MIGRATION)],
                           capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        seed = f"""
        INSERT INTO companies (id, legal_name, trade_name) VALUES
          ('{A_CO}', 'Empresa A S.A.', 'A Eventos'), ('{B_CO}', 'Empresa B S.A.', 'B Eventos');
        INSERT INTO app_users (id, email) VALUES ('{A_USER}', 'a@a.test'), ('{B_USER}', 'b@b.test');
        INSERT INTO memberships VALUES ('{A_CO}', '{A_USER}', 'propietario'),
                                       ('{B_CO}', '{B_USER}', 'propietario');
        INSERT INTO categories (id, company_id, name) VALUES
          ('{A_CAT}', '{A_CO}', 'Personal'), ('{B_CAT}', '{B_CO}', 'Personal');
        INSERT INTO events (id, company_id, code, name, starts_on, ends_on) VALUES
          ('{A_EV}', '{A_CO}', 'EV-001', 'Boda A', '2026-10-03', '2026-10-03'),
          ('{B_EV}', '{B_CO}', 'EV-001', 'Gala B', '2026-10-04', '2026-10-04');
        """
        r = psql(seed, cls.db)
        assert r.returncode == 0, r.stderr

    @classmethod
    def tearDownClass(cls):
        subprocess.run(["dropdb", *shlex.split(PG), cls.db])

    def ok(self, sql, user=A_USER):
        r = psql(sql, self.db, user)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.strip()

    def fails(self, sql, user=A_USER, contains=""):
        r = psql(sql, self.db, user)
        self.assertNotEqual(r.returncode, 0, f"Debió fallar: {sql}")
        self.assertIn(contains, r.stderr)

    # 22. aislamiento entre empresas
    def test_isolation(self):
        self.assertEqual(self.ok("SELECT count(*) FROM events"), "1")
        self.assertEqual(self.ok(f"SELECT count(*) FROM events WHERE id = '{B_EV}'"), "0")
        self.assertEqual(self.ok("SELECT count(*) FROM companies"), "1")
        # no puede escribir en otra empresa
        self.fails(f"INSERT INTO categories (company_id, name) VALUES ('{B_CO}', 'X')",
                   contains="row-level security")
        # no puede vincular su gasto al evento de otra empresa (FK compuesta)
        self.fails(f"""INSERT INTO expenses (company_id, event_id, category_id, incurred_on,
                       description, amount, idempotency_key)
                       VALUES ('{A_CO}', '{B_EV}', '{A_CAT}', '2026-10-03', 'x', 10, 'k-x')""")
        # sin usuario no ve nada
        self.assertEqual(psql("SET ROLE nexosaldo_app; SELECT count(*) FROM events",
                              self.db).stdout.strip(), "0")

    # 20. duplicados + 24. cancelado conserva gastos + sin borrado físico
    def test_duplicates_cancel_and_no_delete(self):
        ins = f"""INSERT INTO expenses (company_id, event_id, category_id, incurred_on,
                  description, amount, idempotency_key)
                  VALUES ('{A_CO}', '{A_EV}', '{A_CAT}', '2026-10-03', 'Meseros', 300, 'exp-1')"""
        self.ok(ins)
        self.fails(ins, contains="duplicate key")
        self.ok(f"UPDATE events SET status='cancelado', cancelled_at=now(), cancel_reason='Lluvia' WHERE id='{A_EV}'")
        self.assertEqual(self.ok(f"SELECT sum(amount) FROM expenses WHERE event_id='{A_EV}'"), "300.00")
        self.fails(f"DELETE FROM expenses WHERE event_id='{A_EV}'")
        self.assertGreater(int(self.ok("SELECT count(*) FROM audit_log WHERE table_name='expenses'")), 0)

    # 11. versiones congeladas + 12. venta sólo desde aceptada, una vez + facturas
    def test_quote_lifecycle(self):
        q, v1, v2 = (str(uuid.uuid4()) for _ in range(3))
        self.ok(f"""INSERT INTO quotes (id, company_id, number, event_id) VALUES ('{q}', '{A_CO}', 'COT-1', '{A_EV}');
                    INSERT INTO quote_versions (id, company_id, quote_id, version_no) VALUES ('{v1}', '{A_CO}', '{q}', 1);
                    INSERT INTO quote_lines (company_id, version_id, position, description, quantity, unit_cost, method, rate_pct)
                    VALUES ('{A_CO}', '{v1}', 1, 'Sonido', 1, 1000, 'recargo', 30);""")
        self.fails(f"""INSERT INTO quote_lines (company_id, version_id, position, description, quantity, unit_cost, method, rate_pct)
                       VALUES ('{A_CO}', '{v1}', 2, 'Luces', 1, 100, 'margen', 100)""", contains="check")
        self.fails(f"""INSERT INTO sales (company_id, source_quote_version_id, recognized_on, description, net_amount)
                       VALUES ('{A_CO}', '{v1}', '2026-10-01', 'x', 1300)""", contains="aceptada")
        self.ok(f"UPDATE quote_versions SET status='emitida', issued_on='2026-10-01', total=1300 WHERE id='{v1}'")
        self.fails(f"UPDATE quote_versions SET total=999 WHERE id='{v1}'", contains="nueva versión")
        self.fails(f"UPDATE quote_lines SET unit_cost=1 WHERE version_id='{v1}'", contains="emitida")
        self.ok(f"INSERT INTO quote_versions (id, company_id, quote_id, version_no) VALUES ('{v2}', '{A_CO}', '{q}', 2)")
        self.ok(f"UPDATE quote_versions SET status='aceptada', accepted_at=now() WHERE id='{v1}'")
        self.assertEqual(self.ok(f"SELECT count(*) FROM quote_versions WHERE quote_id='{q}'"), "2")
        s = str(uuid.uuid4())
        sale = f"""INSERT INTO sales (id, company_id, event_id, source_quote_version_id, recognized_on, description, net_amount, tax_amount)
                   VALUES ('{{id}}', '{A_CO}', '{A_EV}', '{v1}', '2026-10-02', 'Venta', 1300, 91)"""
        self.ok(sale.format(id=s))
        self.fails(sale.format(id=uuid.uuid4()), contains="duplicate key")
        self.ok(f"INSERT INTO invoices (company_id, sale_id, number, issued_on, amount) VALUES ('{A_CO}', '{s}', 'F-1', '2026-10-02', 1391)")
        self.fails(f"INSERT INTO invoices (company_id, sale_id, number, issued_on, amount) VALUES ('{A_CO}', '{s}', 'F-2', '2026-10-02', 1)",
                   contains="supera")
        self.ok(f"INSERT INTO receipts (company_id, sale_id, received_on, amount, idempotency_key) VALUES ('{A_CO}', '{s}', '2026-10-05', 500, 'r1')")
        self.fails(f"INSERT INTO receipts (company_id, sale_id, received_on, amount, idempotency_key) VALUES ('{A_CO}', '{s}', '2026-10-05', 500, 'r1')",
                   contains="duplicate key")
        self.fails(f"INSERT INTO receipts (company_id, sale_id, received_on, amount, idempotency_key) VALUES ('{A_CO}', '{s}', '2026-10-06', 900, 'r2')",
                   contains="superan")

    # 14/17. ahorro sin exceder saldo; distribución aprobada inmutable
    def test_savings_and_distribution(self):
        g = str(uuid.uuid4())
        self.ok(f"INSERT INTO savings_goals (id, company_id, name, target_amount) VALUES ('{g}', '{A_CO}', 'Emergencia', 5000)")
        self.ok(f"""INSERT INTO savings_movements (company_id, goal_id, kind, amount, moved_on, confirmed_by, idempotency_key)
                    VALUES ('{A_CO}', '{g}', 'aporte', 400, '2026-10-10', '{A_USER}', 's1')""")
        self.fails(f"""INSERT INTO savings_movements (company_id, goal_id, kind, amount, moved_on, confirmed_by, idempotency_key)
                       VALUES ('{A_CO}', '{g}', 'retiro', 401, '2026-10-11', '{A_USER}', 's2')""", contains="saldo")
        d = str(uuid.uuid4())
        self.fails(f"""INSERT INTO distributions (company_id, basis, operating_profit, available, distributed)
                       VALUES ('{A_CO}', 'periodo', 4000, 3600, 3700)""", contains="check")
        self.ok(f"""INSERT INTO distributions (id, company_id, basis, operating_profit, approved_savings, available, distributed, status)
                    VALUES ('{d}', '{A_CO}', 'periodo', 4000, 400, 3600, 3600, 'aprobada')""")
        self.fails(f"UPDATE distributions SET distributed=1000 WHERE id='{d}'", contains="aprobada")


if __name__ == "__main__":
    unittest.main()
