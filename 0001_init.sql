-- NexoSaldo — esquema inicial (PostgreSQL 15+ / Supabase)
-- Principios:
--  * Multiempresa: toda tabla de negocio lleva company_id y FKs compuestas
--    (id, company_id) para que nunca se pueda enlazar un registro de otra empresa.
--  * Aislamiento con Row Level Security (RLS) aplicado en la base de datos.
--  * Registros financieros no se borran: se anulan con motivo (voided_at/void_reason).
--  * Importes numeric(14,2); moneda original + tipo de cambio por operación.
--  * Versiones de cotización emitidas quedan congeladas (trigger).

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Identidad del usuario actual. En Supabase reemplazar por auth.uid().
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ------------------------------------------------------------ identidad
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name      text NOT NULL,
  trade_name      text NOT NULL,
  tax_id          text,
  email           text,
  phone           text,
  address         text,
  logo_path       text,                       -- ruta en almacenamiento privado
  base_currency   char(3) NOT NULL DEFAULT 'USD',
  date_format     text NOT NULL DEFAULT 'DD/MM/YYYY',
  budget_warning_pct  numeric(5,2) NOT NULL DEFAULT 85,
  budget_exceeded_pct numeric(5,2) NOT NULL DEFAULT 100,
  savings_rule_pct    numeric(5,2) NOT NULL DEFAULT 0 CHECK (savings_rule_pct BETWEEN 0 AND 100),
  distribution_basis  text NOT NULL DEFAULT 'periodo' CHECK (distribution_basis IN ('periodo','evento')),
  default_quote_terms text,
  default_quote_validity_days int NOT NULL DEFAULT 15,
  is_demo         boolean NOT NULL DEFAULT false,   -- datos de demostración separados
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text,            -- NULL si la autenticación la gestiona Supabase Auth
  full_name     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id    uuid NOT NULL REFERENCES app_users(id),
  role       text NOT NULL CHECK (role IN ('propietario','administrador','editor','lector')),
  PRIMARY KEY (company_id, user_id)
);

CREATE OR REPLACE FUNCTION app.my_company_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM memberships WHERE user_id = app.current_user_id()
$$;

CREATE OR REPLACE FUNCTION app.can_write(c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM memberships WHERE company_id = c
                 AND user_id = app.current_user_id() AND role <> 'lector')
$$;

-- ------------------------------------------------------- configuración
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL, description text, archived boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, name), UNIQUE (id, company_id)
);

CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL, UNIQUE (company_id, name), UNIQUE (id, company_id)
);

CREATE TABLE tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL, rate_pct numeric(6,3) NOT NULL CHECK (rate_pct >= 0),
  jurisdiction text, active boolean NOT NULL DEFAULT true,
  UNIQUE (id, company_id)
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL, organization text, email text,
  phone_country_code text, phone text, tax_id text, notes text,
  UNIQUE (id, company_id)
);

-- ---------------------------------------------------------------- eventos
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text,                                   -- tipo, para comparar eventos similares
  client_id uuid,
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planificado'
    CHECK (status IN ('planificado','en_ejecucion','finalizado','cancelado')),
  cancelled_at timestamptz, cancel_reason text,
  duplicated_from uuid,                        -- estructura copiada, sin transacciones
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (company_id, code), UNIQUE (id, company_id),
  FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id)
);
CREATE INDEX ON events (company_id, starts_on);

-- ------------------------------------------------------------ presupuesto
CREATE TABLE budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  category_id uuid NOT NULL,
  description text,
  initial_amount numeric(14,2) NOT NULL CHECK (initial_amount >= 0),
  revised_amount numeric(14,2) NOT NULL CHECK (revised_amount >= 0),
  UNIQUE (event_id, category_id), UNIQUE (id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id),
  FOREIGN KEY (category_id, company_id) REFERENCES categories(id, company_id)
);

CREATE TABLE budget_revisions (                -- historial: cuándo y por qué
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL,
  budget_line_id uuid NOT NULL,
  old_amount numeric(14,2), new_amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (budget_line_id, company_id) REFERENCES budget_lines(id, company_id)
);

-- ------------------------------------------------------------------ gastos
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid,                               -- NULL = gasto general de la empresa
  category_id uuid NOT NULL,
  incurred_on date NOT NULL,
  description text NOT NULL,
  supplier text,
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),     -- gasto reconocido
  currency char(3) NOT NULL DEFAULT 'USD',
  fx_rate numeric(18,8),                                 -- si se convirtió
  payment_method_id uuid,
  reference text,
  due_on date,
  notes text,
  idempotency_key text NOT NULL,               -- evita doble registro por reintento
  voided_at timestamptz, void_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  UNIQUE (company_id, idempotency_key), UNIQUE (id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id),
  FOREIGN KEY (category_id, company_id) REFERENCES categories(id, company_id),
  FOREIGN KEY (payment_method_id, company_id) REFERENCES payment_methods(id, company_id)
);
CREATE INDEX ON expenses (company_id, event_id, incurred_on);

CREATE TABLE expense_payments (                -- salida efectiva de dinero
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  paid_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL,
  voided_at timestamptz,
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (expense_id, company_id) REFERENCES expenses(id, company_id)
);

CREATE TABLE expense_allocations (             -- reparto de gastos generales
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  expense_id uuid NOT NULL,
  event_id uuid NOT NULL,
  rule text NOT NULL,                          -- regla explícita (p.ej. "partes iguales")
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (expense_id, event_id),
  FOREIGN KEY (expense_id, company_id) REFERENCES expenses(id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id)
);

CREATE TABLE attachments (                     -- comprobantes en almacenamiento privado
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  owner_table text NOT NULL, owner_id uuid NOT NULL,
  storage_path text NOT NULL, mime_type text NOT NULL, size_bytes int NOT NULL,
  uploaded_by uuid, uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ cotizaciones
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  number text NOT NULL,                        -- p.ej. COT-2026-0007
  event_id uuid,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number), UNIQUE (id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id),
  FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id)
);

CREATE TABLE quote_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  version_no int NOT NULL CHECK (version_no >= 1),
  status text NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador','emitida','enviada','aceptada','rechazada','vencida','cancelada')),
  issued_on date, valid_until date, accepted_at timestamptz, rejected_at timestamptz,
  currency char(3) NOT NULL DEFAULT 'USD',
  global_method text NOT NULL DEFAULT 'recargo' CHECK (global_method IN ('recargo','margen')),
  global_rate_pct numeric(7,3) NOT NULL DEFAULT 0,
  manual_subtotal numeric(14,2),
  discount_type text NOT NULL DEFAULT 'ninguno' CHECK (discount_type IN ('ninguno','porcentaje','importe')),
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  taxes jsonb NOT NULL DEFAULT '[]',           -- copia de las tasas aplicadas
  payment_terms text, advance_requested numeric(14,2), execution_term text, notes text,
  client_snapshot jsonb,                       -- datos de contacto al emitir
  -- totales calculados por la capa financiera y congelados al emitir
  cost_total numeric(14,2), subtotal numeric(14,2), discount_total numeric(14,2),
  tax_total numeric(14,2), total numeric(14,2), gross_profit numeric(14,2),
  pdf_path text, pdf_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version_no), UNIQUE (id, company_id),
  FOREIGN KEY (quote_id, company_id) REFERENCES quotes(id, company_id)
);

CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  version_id uuid NOT NULL,
  position int NOT NULL,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit text,
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),        -- PRIVADO
  method text NOT NULL CHECK (method IN ('recargo','margen','manual','global')),
  rate_pct numeric(7,3) CHECK (rate_pct IS NULL OR rate_pct >= 0), -- PRIVADO
  manual_unit_price numeric(14,2),
  taxable boolean NOT NULL DEFAULT true,
  CHECK (method <> 'margen' OR rate_pct < 100),
  CHECK (method <> 'manual' OR manual_unit_price IS NOT NULL),
  FOREIGN KEY (version_id, company_id) REFERENCES quote_versions(id, company_id)
);

CREATE TABLE quote_shares (                    -- generado / preparado / enviado
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  version_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('descarga','compartir','whatsapp','email')),
  state text NOT NULL CHECK (state IN ('generado','preparado','enviado_confirmado')),
  recipient text,
  at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (version_id, company_id) REFERENCES quote_versions(id, company_id)
);

-- ------------------------------------------- ventas, facturas y cobros
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid, client_id uuid,
  source_quote_version_id uuid UNIQUE,         -- una venta por versión aceptada
  recognized_on date NOT NULL,
  description text NOT NULL,
  net_amount numeric(14,2) NOT NULL CHECK (net_amount >= 0),   -- ingreso reconocido
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'USD', fx_rate numeric(18,8),
  due_on date, reference text,
  voided_at timestamptz, void_reason text,
  UNIQUE (id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id),
  FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id),
  FOREIGN KEY (source_quote_version_id, company_id) REFERENCES quote_versions(id, company_id)
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  sale_id uuid NOT NULL,                       -- vinculada, no crea ingreso nuevo
  number text NOT NULL,
  issued_on date NOT NULL, due_on date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  voided_at timestamptz, void_reason text,
  UNIQUE (company_id, number), UNIQUE (id, company_id),
  FOREIGN KEY (sale_id, company_id) REFERENCES sales(id, company_id)
);

CREATE TABLE receipts (                        -- cobros: entrada efectiva de dinero
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  invoice_id uuid,
  received_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method_id uuid,
  idempotency_key text NOT NULL,
  voided_at timestamptz, void_reason text,
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (sale_id, company_id) REFERENCES sales(id, company_id),
  FOREIGN KEY (invoice_id, company_id) REFERENCES invoices(id, company_id)
);

-- ------------------------------------------------------------------ ahorro
CREATE TABLE savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL, purpose text,
  target_amount numeric(14,2) CHECK (target_amount IS NULL OR target_amount > 0),
  UNIQUE (company_id, name), UNIQUE (id, company_id)
);

CREATE TABLE savings_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('aporte','retiro')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  moved_on date NOT NULL,
  event_id uuid,                               -- si proviene de la utilidad de un evento
  confirmed_by uuid NOT NULL,                  -- toda reserva requiere confirmación
  idempotency_key text NOT NULL,
  notes text,
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (goal_id, company_id) REFERENCES savings_goals(id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id)
);

-- ------------------------------------------------------------- accionistas
CREATE TABLE shareholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  internal_code text NOT NULL,
  name text NOT NULL,
  share_pct numeric(6,3) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  starts_on date NOT NULL, ends_on date,
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','inactivo')),
  UNIQUE (company_id, internal_code), UNIQUE (id, company_id)
);

CREATE TABLE distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  basis text NOT NULL CHECK (basis IN ('periodo','evento')),
  period_start date, period_end date, event_id uuid,
  operating_profit numeric(14,2) NOT NULL,
  approved_savings numeric(14,2) NOT NULL DEFAULT 0,
  other_reserves numeric(14,2) NOT NULL DEFAULT 0,
  unaccounted_obligations numeric(14,2) NOT NULL DEFAULT 0,
  available numeric(14,2) NOT NULL CHECK (available >= 0),
  distributed numeric(14,2) NOT NULL CHECK (distributed >= 0 AND distributed <= available),
  status text NOT NULL DEFAULT 'propuesta' CHECK (status IN ('propuesta','aprobada','anulada')),
  approved_by uuid, approved_at timestamptz,
  UNIQUE (id, company_id),
  FOREIGN KEY (event_id, company_id) REFERENCES events(id, company_id)
);

CREATE TABLE distribution_lines (              -- % congelado: cambios futuros no alteran historia
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  distribution_id uuid NOT NULL,
  shareholder_id uuid NOT NULL,
  share_pct_snapshot numeric(6,3) NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (distribution_id, shareholder_id), UNIQUE (id, company_id),
  FOREIGN KEY (distribution_id, company_id) REFERENCES distributions(id, company_id),
  FOREIGN KEY (shareholder_id, company_id) REFERENCES shareholders(id, company_id)
);

CREATE TABLE shareholder_payments (            -- desembolso efectivamente realizado
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  distribution_line_id uuid NOT NULL,
  paid_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL,
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (distribution_line_id, company_id) REFERENCES distribution_lines(id, company_id)
);

-- --------------------------------------------------------------- auditoría
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL,
  table_name text NOT NULL, row_id text NOT NULL,
  action text NOT NULL, old_data jsonb, new_data jsonb,
  actor uuid, at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ reglas
-- 1) Versiones de cotización congeladas fuera de 'borrador'.
CREATE OR REPLACE FUNCTION app.guard_quote_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'borrador' THEN
    -- sólo se permite cambiar estado/fechas de seguimiento y datos del PDF
    IF (to_jsonb(NEW) - ARRAY['status','accepted_at','rejected_at','pdf_path','pdf_sha256'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','accepted_at','rejected_at','pdf_path','pdf_sha256']) THEN
      RAISE EXCEPTION 'La versión % ya fue emitida; cree una nueva versión.', OLD.version_no;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_version_frozen BEFORE UPDATE ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION app.guard_quote_version();

CREATE OR REPLACE FUNCTION app.guard_quote_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM quote_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF st <> 'borrador' THEN
    RAISE EXCEPTION 'Las partidas de una versión emitida no se pueden modificar.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER quote_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_quote_line();

-- 2) Una venta sólo puede originarse en una versión aceptada.
CREATE OR REPLACE FUNCTION app.guard_sale_source() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_quote_version_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM quote_versions WHERE id = NEW.source_quote_version_id AND status = 'aceptada') THEN
    RAISE EXCEPTION 'Sólo una cotización aceptada puede convertirse en venta.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_source_accepted BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_source();

-- 3) Facturado ≤ total de la venta; cobrado ≤ total de la venta.
CREATE OR REPLACE FUNCTION app.guard_sale_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE gross numeric; inv numeric; col numeric;
BEGIN
  SELECT net_amount + tax_amount INTO gross FROM sales WHERE id = NEW.sale_id FOR UPDATE;
  SELECT COALESCE(sum(amount),0) INTO inv FROM invoices WHERE sale_id = NEW.sale_id AND voided_at IS NULL;
  SELECT COALESCE(sum(amount),0) INTO col FROM receipts WHERE sale_id = NEW.sale_id AND voided_at IS NULL;
  IF inv > gross THEN RAISE EXCEPTION 'La facturación supera el total de la venta.'; END IF;
  IF col > gross THEN RAISE EXCEPTION 'Los cobros superan el total de la venta.'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoices_total AFTER INSERT OR UPDATE ON invoices
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION app.guard_sale_totals();
CREATE CONSTRAINT TRIGGER receipts_total AFTER INSERT OR UPDATE ON receipts
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION app.guard_sale_totals();

-- 4) Asignaciones de gasto general ≤ importe original (no duplica el gasto).
CREATE OR REPLACE FUNCTION app.guard_allocations() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE total numeric; alloc numeric; ev uuid;
BEGIN
  SELECT amount, event_id INTO total, ev FROM expenses WHERE id = NEW.expense_id FOR UPDATE;
  IF ev IS NOT NULL THEN RAISE EXCEPTION 'Sólo los gastos generales se asignan a eventos.'; END IF;
  SELECT COALESCE(sum(amount),0) INTO alloc FROM expense_allocations WHERE expense_id = NEW.expense_id;
  IF alloc > total THEN RAISE EXCEPTION 'La asignación supera el importe del gasto general.'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER allocations_total AFTER INSERT OR UPDATE ON expense_allocations
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION app.guard_allocations();

-- 5) Retiros de ahorro ≤ saldo de la meta.
CREATE OR REPLACE FUNCTION app.guard_savings() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE bal numeric;
BEGIN
  PERFORM 1 FROM savings_goals WHERE id = NEW.goal_id FOR UPDATE;
  SELECT COALESCE(sum(CASE kind WHEN 'aporte' THEN amount ELSE -amount END),0)
    INTO bal FROM savings_movements WHERE goal_id = NEW.goal_id;
  IF bal < 0 THEN RAISE EXCEPTION 'El retiro supera el saldo de la reserva.'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER savings_balance AFTER INSERT ON savings_movements
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION app.guard_savings();

-- 6) Distribuciones aprobadas y sus líneas son inmutables.
CREATE OR REPLACE FUNCTION app.guard_distribution() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'aprobada' AND NEW.status <> 'anulada' THEN
    RAISE EXCEPTION 'Una distribución aprobada no se puede modificar.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER distribution_frozen BEFORE UPDATE ON distributions
  FOR EACH ROW EXECUTE FUNCTION app.guard_distribution();

-- 7) Sin borrados físicos de registros financieros (se anulan con motivo).
CREATE OR REPLACE FUNCTION app.forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no se eliminan; anúlelos con un motivo.', TG_TABLE_NAME;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','expenses','expense_payments','sales','invoices','receipts',
                           'savings_movements','distributions','distribution_lines',
                           'shareholder_payments','quote_versions','budget_revisions','audit_log']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app.forbid_delete()',
                   t || '_no_delete', t);
  END LOOP;
END $$;

-- 8) Auditoría de tablas financieras.
CREATE OR REPLACE FUNCTION app.audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_log (company_id, table_name, row_id, action, old_data, new_data, actor)
  VALUES (COALESCE(NEW.company_id, OLD.company_id), TG_TABLE_NAME,
          COALESCE(NEW.id, OLD.id)::text, TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
          app.current_user_id());
  RETURN COALESCE(NEW, OLD);
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','budget_lines','expenses','expense_payments','quote_versions',
                           'sales','invoices','receipts','savings_movements','shareholders',
                           'distributions','shareholder_payments']
  LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.audit()',
                   t || '_audit', t);
  END LOOP;
END $$;

-- ======================================================= Row Level Security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','payment_methods','tax_rates','clients','events',
     'budget_lines','budget_revisions','expenses','expense_payments','expense_allocations',
     'attachments','quotes','quote_versions','quote_lines','quote_shares','sales','invoices',
     'receipts','savings_goals','savings_movements','shareholders','distributions',
     'distribution_lines','shareholder_payments','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (company_id IN (SELECT app.my_company_ids()))',
                   t || '_read', t);
    IF t <> 'audit_log' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.can_write(company_id))',
                     t || '_insert', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.can_write(company_id)) WITH CHECK (app.can_write(company_id))',
                     t || '_update', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_read ON companies FOR SELECT USING (id IN (SELECT app.my_company_ids()));
CREATE POLICY companies_update ON companies FOR UPDATE USING (app.can_write(id));

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_read ON memberships FOR SELECT USING (user_id = app.current_user_id());

-- Rol de aplicación sin privilegios de superusuario (RLS siempre aplica).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexosaldo_app') THEN
    CREATE ROLE nexosaldo_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public, app TO nexosaldo_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nexosaldo_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO nexosaldo_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO nexosaldo_app;
REVOKE INSERT, UPDATE ON audit_log FROM nexosaldo_app;   -- sólo vía trigger

COMMIT;
