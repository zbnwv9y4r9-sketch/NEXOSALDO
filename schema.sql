-- NexoSaldo — esquema para la versión web publicada en GitHub Pages con Supabase.
-- Ejecutar una sola vez en Supabase: SQL Editor → New query → pegar → Run.
--
-- Modelo: cada registro de la app (evento, gasto, cotización…) se guarda como un
-- documento JSON dentro de su empresa. La seguridad la aplica la base de datos (RLS):
--   * cada usuario solo ve las empresas de las que es miembro;
--   * el rol «lector» no puede escribir;
--   * los registros financieros NO se pueden borrar (solo anular desde la app);
--     únicamente se permite borrar documentos marcados como demostración;
--   * todo cambio queda en una tabla de auditoría que la app no puede modificar.
-- La clave «anon» de Supabase es pública por diseño; lo que protege los datos es RLS.

begin;

create extension if not exists pgcrypto;

create table if not exists public.nexosaldo_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.nexosaldo_members (
  company_id uuid not null references public.nexosaldo_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('propietario', 'editor', 'lector')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.nexosaldo_docs (
  company_id uuid not null references public.nexosaldo_companies(id) on delete cascade,
  collection text not null check (collection in ('events','expenses','quotes','sales','savings','goals','shareholders','distributions','config')),
  id text not null check (id ~ '^[A-Za-z0-9_\-.~:@+]{1,200}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (company_id, collection, id)
);

create table if not exists public.nexosaldo_audit (
  id bigserial primary key,
  company_id uuid not null,
  collection text not null,
  doc_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index if not exists nexosaldo_audit_company on public.nexosaldo_audit (company_id, at desc);

-- ------------------------------------------------------------ funciones de acceso
create or replace function public.nexosaldo_my_companies() returns setof uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.nexosaldo_members where user_id = auth.uid()
$$;

create or replace function public.nexosaldo_can_write(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nexosaldo_members
                 where company_id = c and user_id = auth.uid() and role in ('propietario', 'editor'))
$$;

create or replace function public.nexosaldo_is_owner(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nexosaldo_members
                 where company_id = c and user_id = auth.uid() and role = 'propietario')
$$;

-- Alta: la primera vez que un usuario entra se crea su empresa y queda como propietario.
create or replace function public.nexosaldo_bootstrap(company_name text default 'Mi empresa')
returns table (company_id uuid, role text)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from public.nexosaldo_members m where m.user_id = uid) then
    insert into public.nexosaldo_companies (name, created_by) values (coalesce(nullif(trim(company_name), ''), 'Mi empresa'), uid)
      returning id into cid;
    insert into public.nexosaldo_members (company_id, user_id, email, role)
      values (cid, uid, (select email from auth.users where id = uid), 'propietario');
  end if;
  return query select m.company_id, m.role from public.nexosaldo_members m
    where m.user_id = uid order by m.created_at limit 1;
end $$;

-- El propietario invita a alguien que ya creó su cuenta en la app.
create or replace function public.nexosaldo_add_member(c uuid, member_email text, member_role text)
returns void language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.nexosaldo_is_owner(c) then raise exception 'Solo el propietario puede agregar miembros.'; end if;
  if member_role not in ('editor', 'lector') then raise exception 'Rol no válido.'; end if;
  select id into target from auth.users where lower(email) = lower(trim(member_email));
  if target is null then raise exception 'Esa persona aún no ha creado su cuenta en NexoSaldo.'; end if;
  insert into public.nexosaldo_members (company_id, user_id, email, role) values (c, target, lower(trim(member_email)), member_role)
    on conflict (company_id, user_id) do update set role = excluded.role;
end $$;

-- ------------------------------------------------------------ reglas de integridad
create or replace function public.nexosaldo_guard_delete() returns trigger
language plpgsql as $$
begin
  if coalesce(old.data->>'demo', 'false') <> 'true' then
    raise exception 'Los registros financieros no se eliminan; anúlalos desde la aplicación.';
  end if;
  return old;
end $$;
drop trigger if exists nexosaldo_docs_no_delete on public.nexosaldo_docs;
create trigger nexosaldo_docs_no_delete before delete on public.nexosaldo_docs
  for each row execute function public.nexosaldo_guard_delete();

create or replace function public.nexosaldo_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists nexosaldo_docs_touch on public.nexosaldo_docs;
create trigger nexosaldo_docs_touch before insert or update on public.nexosaldo_docs
  for each row execute function public.nexosaldo_touch();

create or replace function public.nexosaldo_audit_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.nexosaldo_audit (company_id, collection, doc_id, action, old_data, new_data, actor)
  values (coalesce(new.company_id, old.company_id), coalesce(new.collection, old.collection), coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then old.data end, case when tg_op <> 'DELETE' then new.data end, auth.uid());
  return coalesce(new, old);
end $$;
drop trigger if exists nexosaldo_docs_audit on public.nexosaldo_docs;
create trigger nexosaldo_docs_audit after insert or update or delete on public.nexosaldo_docs
  for each row execute function public.nexosaldo_audit_fn();

-- ------------------------------------------------------------ Row Level Security
alter table public.nexosaldo_companies enable row level security;
alter table public.nexosaldo_members enable row level security;
alter table public.nexosaldo_docs enable row level security;
alter table public.nexosaldo_audit enable row level security;

drop policy if exists companies_read on public.nexosaldo_companies;
create policy companies_read on public.nexosaldo_companies for select to authenticated
  using (id in (select public.nexosaldo_my_companies()));
drop policy if exists companies_rename on public.nexosaldo_companies;
create policy companies_rename on public.nexosaldo_companies for update to authenticated
  using (public.nexosaldo_is_owner(id)) with check (public.nexosaldo_is_owner(id));

drop policy if exists members_read on public.nexosaldo_members;
create policy members_read on public.nexosaldo_members for select to authenticated
  using (company_id in (select public.nexosaldo_my_companies()));

drop policy if exists docs_read on public.nexosaldo_docs;
create policy docs_read on public.nexosaldo_docs for select to authenticated
  using (company_id in (select public.nexosaldo_my_companies()));
drop policy if exists docs_insert on public.nexosaldo_docs;
create policy docs_insert on public.nexosaldo_docs for insert to authenticated
  with check (public.nexosaldo_can_write(company_id));
drop policy if exists docs_update on public.nexosaldo_docs;
create policy docs_update on public.nexosaldo_docs for update to authenticated
  using (public.nexosaldo_can_write(company_id)) with check (public.nexosaldo_can_write(company_id));
drop policy if exists docs_delete on public.nexosaldo_docs;
create policy docs_delete on public.nexosaldo_docs for delete to authenticated
  using (public.nexosaldo_can_write(company_id));

drop policy if exists audit_read on public.nexosaldo_audit;
create policy audit_read on public.nexosaldo_audit for select to authenticated
  using (company_id in (select public.nexosaldo_my_companies()));

revoke all on public.nexosaldo_companies, public.nexosaldo_members, public.nexosaldo_docs, public.nexosaldo_audit from anon;
grant select, update on public.nexosaldo_companies to authenticated;
grant select on public.nexosaldo_members to authenticated;
grant select, insert, update, delete on public.nexosaldo_docs to authenticated;
grant select on public.nexosaldo_audit to authenticated;
revoke execute on function public.nexosaldo_bootstrap(text), public.nexosaldo_add_member(uuid, text, text) from anon, public;
grant execute on function public.nexosaldo_bootstrap(text), public.nexosaldo_add_member(uuid, text, text),
  public.nexosaldo_my_companies(), public.nexosaldo_can_write(uuid), public.nexosaldo_is_owner(uuid) to authenticated;

-- Cambios en vivo entre dispositivos (Supabase Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'nexosaldo_docs') then
    alter publication supabase_realtime add table public.nexosaldo_docs;
  end if;
end $$;

commit;
