-- Phase 2: physical inventory. Assignments and loans remain separate future concepts.
create type public.garment_state as enum ('DISPONIBLE', 'PENDIENTE_LAVANDERIA', 'DANADA');

create table public.garment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index garment_types_name_unique on public.garment_types (lower(btrim(name)));
insert into public.garment_types (name, sort_order) values ('Chaqueta', 1), ('Camisa', 2), ('Pantalón', 3);

create table public.garments (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(code) between 1 and 60 and code = upper(btrim(code))),
  garment_type_id uuid not null references public.garment_types(id) on delete restrict,
  size text not null check (length(size) between 1 and 20 and size = upper(btrim(size))),
  physical_state public.garment_state not null default 'DISPONIBLE',
  notes text check (length(notes) <= 2000),
  archived_at timestamptz,
  archived_by uuid references public.admin_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.admin_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.admin_profiles(user_id) on delete restrict,
  version integer not null default 1 check (version > 0),
  constraint garments_code_unique unique (code),
  constraint garments_archive_consistent check ((archived_at is null) = (archived_by is null))
);
create index garments_active_filters on public.garments (garment_type_id, physical_state, size) where archived_at is null;
create index garments_updated_at on public.garments (updated_at desc, id);
create index garments_archived_at on public.garments (archived_at) where archived_at is not null;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.admin_profiles(user_id) on delete restrict,
  actor_name text not null,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('PRENDA_CREADA', 'PRENDA_EDITADA', 'PRENDA_ARCHIVADA', 'PRENDA_REACTIVADA')),
  entity_type text not null default 'garment' check (entity_type = 'garment'),
  entity_id uuid not null references public.garments(id) on delete restrict,
  before_data jsonb,
  after_data jsonb not null
);
create index audit_log_entity_time on public.audit_log (entity_id, occurred_at desc);
create index audit_log_actor on public.audit_log (actor_id);
create index garments_created_by on public.garments (created_by);
create index garments_updated_by on public.garments (updated_by);
create index garments_archived_by on public.garments (archived_by) where archived_by is not null;

alter table public.garment_types enable row level security;
alter table public.garments enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.garment_types, public.garments, public.audit_log from public, anon, authenticated;
grant select on public.garment_types, public.garments, public.audit_log to authenticated;
grant all on public.garment_types, public.garments, public.audit_log to service_role;
create policy "Admins read types" on public.garment_types for select to authenticated using ((select private.is_admin()));
create policy "Admins read garments" on public.garments for select to authenticated using ((select private.is_admin()));
create policy "Admins read audit" on public.audit_log for select to authenticated using ((select private.is_admin()));

-- Called only by the database trigger, never by the browser. Uses auth.uid(), not client input.
create function private.audit_garment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_actor uuid := auth.uid(); v_name text;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select display_name into strict v_name from public.admin_profiles where user_id = v_actor;
  if tg_op = 'INSERT' then v_action := 'PRENDA_CREADA';
  elsif old.archived_at is null and new.archived_at is not null then v_action := 'PRENDA_ARCHIVADA';
  elsif old.archived_at is not null and new.archived_at is null then v_action := 'PRENDA_REACTIVADA';
  else v_action := 'PRENDA_EDITADA'; end if;
  insert into public.audit_log (actor_id, actor_name, action, entity_id, before_data, after_data)
  values (v_actor, v_name, v_action, new.id, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.audit_garment() from public, anon, authenticated;
create trigger garment_audit after insert or update on public.garments
for each row execute function private.audit_garment();

-- Writes are RPC-only so validation, optimistic locking and audit cannot be bypassed.
create function public.save_garment(
  p_id uuid,
  p_expected_version integer,
  p_code text,
  p_garment_type_id uuid,
  p_size text,
  p_physical_state public.garment_state,
  p_notes text
) returns public.garments language plpgsql security definer set search_path = '' as $$
declare
  v_row public.garments;
  v_actor uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_size text := upper(btrim(p_size));
  v_notes text := nullif(btrim(p_notes), '');
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_id is null or v_code is null or length(v_code) not between 1 and 60
    or v_size is null or length(v_size) not between 1 and 20
    or p_physical_state is null or length(v_notes) > 2000 then
    raise exception 'INVALID_GARMENT' using errcode = '22023';
  end if;
  select * into v_row from public.garments where id = p_id for update;
  if p_expected_version is null then
    -- The client keeps the same UUID on retry after a lost response. No duplicate audit.
    if found then
      if v_row.version = 1 and v_row.code = v_code and v_row.garment_type_id = p_garment_type_id
        and v_row.size = v_size and v_row.physical_state = p_physical_state
        and v_row.notes is not distinct from v_notes and v_row.archived_at is null then return v_row; end if;
      raise exception 'GARMENT_CHANGED' using errcode = '40001';
    end if;
  else
    if not found then raise exception 'GARMENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_row.version <> p_expected_version then raise exception 'GARMENT_CHANGED' using errcode = '40001'; end if;
    if v_row.archived_at is not null then raise exception 'GARMENT_ARCHIVED' using errcode = '22023'; end if;
  end if;
  if not exists (select 1 from public.garment_types where id = p_garment_type_id and active) then
    raise exception 'INVALID_GARMENT_TYPE' using errcode = '22023';
  end if;
  if p_expected_version is null then
    insert into public.garments (id, code, garment_type_id, size, physical_state, notes, created_by, updated_by)
    values (p_id, v_code, p_garment_type_id, v_size, p_physical_state, v_notes, v_actor, v_actor)
    returning * into v_row;
  else
    if v_row.code = v_code and v_row.garment_type_id = p_garment_type_id and v_row.size = v_size
      and v_row.physical_state = p_physical_state and v_row.notes is not distinct from v_notes then return v_row; end if;
    update public.garments set code = v_code, garment_type_id = p_garment_type_id, size = v_size,
      physical_state = p_physical_state, notes = v_notes, updated_by = v_actor,
      updated_at = clock_timestamp(), version = version + 1
    where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.save_garment(uuid, integer, text, uuid, text, public.garment_state, text) from public, anon;
grant execute on function public.save_garment(uuid, integer, text, uuid, text, public.garment_state, text) to authenticated;

create function public.set_garment_archived(p_id uuid, p_expected_version integer, p_archived boolean)
returns public.garments language plpgsql security definer set search_path = '' as $$
declare v_row public.garments;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_expected_version is null or p_archived is null then raise exception 'INVALID_GARMENT' using errcode = '22023'; end if;
  select * into v_row from public.garments where id = p_id for update;
  if not found then raise exception 'GARMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.version <> p_expected_version then raise exception 'GARMENT_CHANGED' using errcode = '40001'; end if;
  if (v_row.archived_at is not null) = p_archived then return v_row; end if;
  update public.garments set
    archived_at = case when p_archived then clock_timestamp() else null end,
    archived_by = case when p_archived then auth.uid() else null end,
    updated_at = clock_timestamp(), updated_by = auth.uid(), version = version + 1
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.set_garment_archived(uuid, integer, boolean) from public, anon;
grant execute on function public.set_garment_archived(uuid, integer, boolean) to authenticated;

create function public.inventory_summary()
returns table (active_count bigint, available_count bigint, laundry_count bigint, damaged_count bigint, archived_count bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*) filter (where archived_at is null),
    count(*) filter (where archived_at is null and physical_state = 'DISPONIBLE'),
    count(*) filter (where archived_at is null and physical_state = 'PENDIENTE_LAVANDERIA'),
    count(*) filter (where archived_at is null and physical_state = 'DANADA'),
    count(*) filter (where archived_at is not null)
  from public.garments;
$$;
revoke all on function public.inventory_summary() from public, anon;
grant execute on function public.inventory_summary() to authenticated;
