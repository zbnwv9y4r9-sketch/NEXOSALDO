"""Pruebas del esquema de Supabase (supabase/schema.sql) contra PostgreSQL real
con una simulación mínima de auth. Requiere NEXOSALDO_TEST_PG (ver test_database)."""
import os, shlex, subprocess, unittest, uuid
from pathlib import Path

PG = os.environ.get("NEXOSALDO_TEST_PG")
ROOT = Path(__file__).resolve().parents[1]
A, B, C = (str(uuid.uuid4()) for _ in range(3))


def psql(sql, db, uid=None, role="authenticated"):
    pre = f"SET ROLE {role}; SET request.jwt.claim.sub = '{uid}';\n" if uid else (f"SET ROLE {role};\n" if role != "postgres" else "")
    return subprocess.run(["psql", *shlex.split(PG), "-d", db, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", pre + sql],
                          capture_output=True, text=True)


@unittest.skipUnless(PG, "NEXOSALDO_TEST_PG no definido")
class SupabaseSchemaTests(unittest.TestCase):
    db = "nexosaldo_sb_" + uuid.uuid4().hex[:8]

    @classmethod
    def setUpClass(cls):
        subprocess.run(["createdb", *shlex.split(PG), cls.db], check=True)
        for f in (ROOT / "supabase/test/auth_stub.sql", ROOT / "supabase/schema.sql", ROOT / "supabase/schema.sql"):  # dos veces: idempotente
            r = subprocess.run(["psql", *shlex.split(PG), "-d", cls.db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(f)], capture_output=True, text=True)
            assert r.returncode == 0, r.stderr
        r = psql(f"insert into auth.users values ('{A}','a@a.test'),('{B}','b@b.test'),('{C}','c@c.test')", cls.db, role="postgres")
        assert r.returncode == 0, r.stderr

    @classmethod
    def tearDownClass(cls):
        subprocess.run(["dropdb", *shlex.split(PG), cls.db])

    def ok(self, sql, uid):
        r = psql(sql, self.db, uid); self.assertEqual(r.returncode, 0, r.stderr); return r.stdout.strip()

    def fails(self, sql, uid, contains=""):
        r = psql(sql, self.db, uid); self.assertNotEqual(r.returncode, 0, sql); self.assertIn(contains, r.stderr); return r.stderr

    def company(self, uid, name):
        return self.ok(f"select company_id from public.nexosaldo_bootstrap('{name}')", uid).split("|")[0]

    def test_isolation_roles_delete_and_audit(self):
        ca, cb = self.company(A, "Empresa A"), self.company(B, "Empresa B")
        self.assertNotEqual(ca, cb)
        self.assertEqual(self.company(A, "otra"), ca)  # bootstrap idempotente
        ins = lambda c, col, i, data: f"insert into public.nexosaldo_docs (company_id, collection, id, data) values ('{c}','{col}','{i}','{data}')"
        self.ok(ins(ca, "events", "e1", '{"name":"Boda A"}'), A)
        self.ok(ins(ca, "events", "demo1", '{"name":"Demo","demo":true}'), A)
        # B no ve ni escribe en A (cambiar el id de empresa no da acceso)
        self.assertEqual(self.ok(f"select count(*) from public.nexosaldo_docs where company_id='{ca}'", B), "0")
        self.fails(ins(ca, "events", "x", '{"a":1}'), B, "row-level security")
        self.assertEqual(self.ok(f"update public.nexosaldo_docs set data='{{}}' where company_id='{ca}' returning id", B), "")
        # colección desconocida y documento no-objeto rechazados
        self.fails(ins(ca, "hack", "x", '{"a":1}'), A, "check")
        self.fails(ins(ca, "events", "x2", '[1]'), A, "check")
        # sin sesión (anon) no ve nada
        r = psql("select count(*) from public.nexosaldo_docs", self.db, role="anon"); self.assertNotEqual(r.returncode, 0)
        # lector: lee pero no escribe
        self.ok(f"select public.nexosaldo_add_member('{ca}','c@c.test','lector')", A)
        self.fails(f"select public.nexosaldo_add_member('{ca}','b@b.test','editor')", C, "propietario")
        self.assertEqual(self.ok(f"select count(*) from public.nexosaldo_docs where company_id='{ca}'", C), "2")
        self.fails(ins(ca, "events", "e9", '{"a":1}'), C, "row-level security")
        # no se borran registros financieros; los demo sí
        self.fails(f"delete from public.nexosaldo_docs where company_id='{ca}' and id='e1'", A, "no se eliminan")
        self.ok(f"delete from public.nexosaldo_docs where company_id='{ca}' and id='demo1'", A)
        # auditoría automática, no modificable por la app
        self.assertEqual(self.ok(f"select count(*) from public.nexosaldo_audit where company_id='{ca}'", A), "3")
        self.fails(f"delete from public.nexosaldo_audit", A, "permission denied")
        self.assertEqual(self.ok(f"select count(*) from public.nexosaldo_audit where company_id='{ca}'", B), "0")


if __name__ == "__main__":
    unittest.main()
