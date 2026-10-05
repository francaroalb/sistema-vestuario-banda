-- Phase 3: stable person identities; no loans, movements or inferred sizes yet.
create type public.person_kind as enum ('BANDA', 'REFUERZO');
create table public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 1 and 120 and full_name = btrim(full_name)),
  kind public.person_kind not null default 'BANDA',
  instrument text check (length(instrument) between 1 and 80 and instrument = btrim(instrument)),
  phone text check (length(phone) between 1 and 40 and phone = btrim(phone)),
  notes text check (length(notes) <= 2000),
  archived_at timestamptz,
  archived_by uuid references public.admin_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.admin_profiles(user_id) on delete restrict,
  updated_by uuid not null references public.admin_profiles(user_id) on delete restrict,
  version integer not null default 1 check (version > 0),
  constraint people_archive_consistent check ((archived_at is null) = (archived_by is null))
);
-- Names deliberately aren't unique: homonyms are separate people.
create index people_name_id on public.people (full_name, id);
create index people_active_kind on public.people (kind) where archived_at is null;
create index people_created_by on public.people (created_by);
create index people_updated_by on public.people (updated_by);
create index people_archived_by on public.people (archived_by) where archived_by is not null;
alter table public.people enable row level security;
revoke all on public.people from public, anon, authenticated;
grant select on public.people to authenticated;
grant all on public.people to service_role;
create policy "Admins read people" on public.people for select to authenticated using ((select private.is_admin()));

-- Keep the existing audit API and data, while enforcing real foreign keys for each entity.
alter table public.audit_log drop constraint audit_log_entity_id_fkey;
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
  add column garment_id uuid generated always as (case when entity_type = 'garment' then entity_id end) stored references public.garments(id) on delete restrict,
  add column person_id uuid generated always as (case when entity_type = 'person' then entity_id end) stored references public.people(id) on delete restrict,
  add constraint audit_log_entity_type_check check (entity_type in ('garment', 'person')),
  add constraint audit_log_action_check check (
    (entity_type = 'garment' and action in ('PRENDA_CREADA','PRENDA_EDITADA','PRENDA_ARCHIVADA','PRENDA_REACTIVADA')) or
    (entity_type = 'person' and action in ('PERSONA_CREADA','PERSONA_EDITADA','PERSONA_ARCHIVADA','PERSONA_REACTIVADA'))
  );
create index audit_log_garment on public.audit_log (garment_id) where garment_id is not null;
create index audit_log_person on public.audit_log (person_id, occurred_at desc) where person_id is not null;

create function private.audit_person()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_actor uuid := auth.uid(); v_name text;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select display_name into strict v_name from public.admin_profiles where user_id = v_actor;
  if tg_op = 'INSERT' then v_action := 'PERSONA_CREADA';
  elsif old.archived_at is null and new.archived_at is not null then v_action := 'PERSONA_ARCHIVADA';
  elsif old.archived_at is not null and new.archived_at is null then v_action := 'PERSONA_REACTIVADA';
  else v_action := 'PERSONA_EDITADA'; end if;
  insert into public.audit_log(actor_id, actor_name, action, entity_type, entity_id, before_data, after_data)
  values(v_actor, v_name, v_action, 'person', new.id, case when tg_op = 'INSERT' then null else to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.audit_person() from public, anon, authenticated;
create trigger person_audit after insert or update on public.people for each row execute function private.audit_person();

create function public.save_person(p_id uuid, p_expected_version integer, p_full_name text,
 p_kind public.person_kind, p_instrument text, p_phone text, p_notes text)
returns public.people language plpgsql security definer set search_path = '' as $$
declare
 v_row public.people; v_actor uuid := auth.uid();
 v_name text := btrim(regexp_replace(p_full_name, '\s+', ' ', 'g'));
 v_instrument text := nullif(btrim(regexp_replace(p_instrument, '\s+', ' ', 'g')), '');
 v_phone text := nullif(btrim(p_phone), ''); v_notes text := nullif(btrim(p_notes), '');
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
 if p_id is null or v_name is null or length(v_name) not between 1 and 120 or p_kind is null
   or length(v_instrument) > 80 or length(v_phone) > 40 or length(v_notes) > 2000 then
   raise exception 'INVALID_PERSON' using errcode = '22023';
 end if;
 -- Serialize retries for the same UUID, including concurrent first insert attempts.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text, 3));
 select * into v_row from public.people where id = p_id for update;
 if p_expected_version is null then
   if found then
     if v_row.version = 1 and v_row.full_name = v_name and v_row.kind = p_kind
       and v_row.instrument is not distinct from v_instrument and v_row.phone is not distinct from v_phone
       and v_row.notes is not distinct from v_notes and v_row.archived_at is null then return v_row; end if;
     raise exception 'PERSON_CHANGED' using errcode = 'PT409';
   end if;
 else
   if not found then raise exception 'PERSON_NOT_FOUND' using errcode = 'P0002'; end if;
   if v_row.version <> p_expected_version then raise exception 'PERSON_CHANGED' using errcode = 'PT409'; end if;
   if v_row.archived_at is not null then raise exception 'PERSON_ARCHIVED' using errcode = '22023'; end if;
 end if;
 if p_expected_version is null then
   insert into public.people (id, full_name, kind, instrument, phone, notes, created_by, updated_by)
   values(p_id, v_name, p_kind, v_instrument, v_phone, v_notes, v_actor, v_actor) returning * into v_row;
 else
   if v_row.full_name = v_name and v_row.kind = p_kind and v_row.instrument is not distinct from v_instrument
      and v_row.phone is not distinct from v_phone and v_row.notes is not distinct from v_notes then return v_row; end if;
   update public.people set full_name = v_name, kind = p_kind, instrument = v_instrument, phone = v_phone,
     notes = v_notes, updated_at = clock_timestamp(), updated_by = v_actor, version = version + 1
   where id = p_id returning * into v_row;
 end if;
 return v_row;
end;
$$;
revoke all on function public.save_person(uuid,integer,text,public.person_kind,text,text,text) from public, anon;
grant execute on function public.save_person(uuid,integer,text,public.person_kind,text,text,text) to authenticated;

create function public.set_person_archived(p_id uuid, p_expected_version integer, p_archived boolean)
returns public.people language plpgsql security definer set search_path = '' as $$
declare v_row public.people;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
 if p_expected_version is null or p_archived is null then raise exception 'INVALID_PERSON' using errcode = '22023'; end if;
 select * into v_row from public.people where id = p_id for update;
 if not found then raise exception 'PERSON_NOT_FOUND' using errcode = 'P0002'; end if;
 if v_row.version <> p_expected_version then raise exception 'PERSON_CHANGED' using errcode = 'PT409'; end if;
 if (v_row.archived_at is not null) = p_archived then return v_row; end if;
 update public.people set archived_at = case when p_archived then clock_timestamp() else null end,
   archived_by = case when p_archived then auth.uid() else null end,
   updated_at = clock_timestamp(), updated_by = auth.uid(), version = version + 1
 where id = p_id returning * into v_row;
 return v_row;
end;
$$;
revoke all on function public.set_person_archived(uuid,integer,boolean) from public, anon;
grant execute on function public.set_person_archived(uuid,integer,boolean) to authenticated;
