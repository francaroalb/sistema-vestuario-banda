-- Physical custody is independent of physical condition and future reservations.
create table public.loans (
 id uuid primary key,
 person_id uuid not null references public.people(id) on delete restrict,
 person_name text not null,
 opened_at timestamptz not null default now(),
 due_at timestamptz,
 closed_at timestamptz,
 notes text check(length(notes)<=2000),
 created_by uuid not null references public.admin_profiles(user_id) on delete restrict,
 version integer not null default 1 check(version>0),
 check(due_at is null or due_at>=opened_at),
 check(closed_at is null or closed_at>=opened_at)
);
create index loans_person_time on public.loans(person_id,opened_at desc);
create index loans_due_open on public.loans(due_at) where closed_at is null;
create index loans_created_by on public.loans(created_by);
create table public.loan_items (
 id uuid primary key default gen_random_uuid(),
 loan_id uuid not null references public.loans(id) on delete restrict,
 garment_id uuid not null references public.garments(id) on delete restrict,
 code text not null,
 garment_type_id uuid not null references public.garment_types(id) on delete restrict,
 type_name text not null,
 size text not null,
 delivered_at timestamptz not null,
 returned_at timestamptz,
 returned_state public.garment_state,
 check((returned_at is null)=(returned_state is null)),
 check(returned_at is null or returned_at>=delivered_at)
);
create unique index loan_items_one_custodian on public.loan_items(garment_id) where returned_at is null;
create index loan_items_loan on public.loan_items(loan_id);
create index loan_items_garment_history on public.loan_items(garment_id,delivered_at desc);
create index loan_items_type on public.loan_items(garment_type_id);
create table public.loan_movements (
 id uuid primary key,
 loan_id uuid not null references public.loans(id) on delete restrict,
 kind text not null check(kind in ('ENTREGA','DEVOLUCION','CAMBIO')),
 actor_id uuid not null references public.admin_profiles(user_id) on delete restrict,
 actor_name text not null,
 occurred_at timestamptz not null,
 signature_confirmed boolean not null check(signature_confirmed),
 details jsonb not null,
 request_payload jsonb not null
);
create index loan_movements_loan_time on public.loan_movements(loan_id,occurred_at);
create index loan_movements_actor on public.loan_movements(actor_id);

alter table public.loans enable row level security;
alter table public.loan_items enable row level security;
alter table public.loan_movements enable row level security;
revoke all on public.loans,public.loan_items,public.loan_movements from public,anon,authenticated;
grant select on public.loans,public.loan_items,public.loan_movements to authenticated;
grant all on public.loans,public.loan_items,public.loan_movements to service_role;
create policy "Admins read loans" on public.loans for select to authenticated using((select private.is_admin()));
create policy "Admins read loan items" on public.loan_items for select to authenticated using((select private.is_admin()));
create policy "Admins read movements" on public.loan_movements for select to authenticated using((select private.is_admin()));

alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
 add column loan_id uuid generated always as(case when entity_type='loan' then entity_id end) stored references public.loans(id) on delete restrict,
 add constraint audit_log_entity_type_check check(entity_type in ('person','garment','loan')),
 add constraint audit_log_action_check check(
  (entity_type='garment' and action in ('PRENDA_CREADA','PRENDA_EDITADA','PRENDA_ARCHIVADA','PRENDA_REACTIVADA')) or
  (entity_type='person' and action in ('PERSONA_CREADA','PERSONA_EDITADA','PERSONA_ARCHIVADA','PERSONA_REACTIVADA')) or
  (entity_type='loan' and action in ('CESION_ABIERTA','DEVOLUCION_REGISTRADA','CAMBIO_REGISTRADO'))
 );
create index audit_log_loan on public.audit_log(loan_id) where loan_id is not null;

-- Existing archive RPCs already lock these rows, as does the movement RPC.
create function private.prevent_custody_archive() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.archived_at is null and new.archived_at is not null then
  if tg_table_name='garments' then
   if exists(select 1 from public.loan_items where garment_id=new.id and returned_at is null) then raise exception 'GARMENT_IN_CUSTODY' using errcode='22023'; end if;
  else
   if exists(select 1 from public.loans where person_id=new.id and closed_at is null) then raise exception 'PERSON_HAS_LOANS' using errcode='22023'; end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.prevent_custody_archive() from public,anon,authenticated;
create trigger garment_custody_archive before update on public.garments for each row execute function private.prevent_custody_archive();
create trigger person_custody_archive before update on public.people for each row execute function private.prevent_custody_archive();

create function public.record_loan_movement(
 p_request_id uuid, p_kind text, p_loan_id uuid, p_expected_version integer, p_person_id uuid,
 p_garment_ids uuid[], p_returns jsonb, p_due_local text, p_notes text, p_signature_confirmed boolean
) returns public.loans language plpgsql security definer set search_path='' as $$
declare
 v_loan public.loans; v_person public.people; v_existing public.loan_movements;
 v_before jsonb; v_payload jsonb; v_details jsonb; v_item public.loan_items;
 v_actor uuid:=auth.uid(); v_actor_name text; v_at timestamptz; v_due timestamptz; v_local timestamp;
 v_garment uuid; v_person_id uuid; v_return jsonb; v_state public.garment_state;
 v_delivered jsonb:='[]'; v_returned jsonb:='[]'; v_ids uuid[]; v_return_ids uuid[];
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_signature_confirmed is distinct from true then raise exception 'SIGNATURE_REQUIRED' using errcode='22023'; end if;
 if p_request_id is null or p_loan_id is null or p_kind is null or p_kind not in ('ENTREGA','DEVOLUCION','CAMBIO')
    or p_garment_ids is null or p_returns is null or jsonb_typeof(p_returns)<>'array' or length(p_notes)>2000 then
  raise exception 'INVALID_MOVEMENT' using errcode='22023';
 end if;
 if cardinality(p_garment_ids)>30 or jsonb_array_length(p_returns)>30 then raise exception 'INVALID_MOVEMENT' using errcode='22023'; end if;
 -- Accept only a minimal return schema: never image/blob/signature data.
 if exists(select 1 from jsonb_array_elements(p_returns) e where jsonb_typeof(e)<>'object' or not(e ? 'item_id' and e ? 'state') or e - 'item_id' - 'state'<>'{}'::jsonb
   or e->>'item_id' is null or e->>'state' is null or e->>'state' not in ('DISPONIBLE','PENDIENTE_LAVANDERIA','DANADA')) then
  raise exception 'INVALID_MOVEMENT' using errcode='22023';
 end if;
 select coalesce(array_agg((e->>'item_id')::uuid),'{}'::uuid[]) into v_return_ids from jsonb_array_elements(p_returns) e;
 if cardinality(p_garment_ids)<>(select count(distinct id) from unnest(p_garment_ids) id)
 or cardinality(v_return_ids)<>(select count(distinct id) from unnest(v_return_ids) id) then raise exception 'DUPLICATE_SELECTION' using errcode='22023'; end if;
 if (p_kind='ENTREGA' and (p_person_id is null or p_expected_version is not null or cardinality(p_garment_ids)<1 or cardinality(v_return_ids)<>0))
 or (p_kind='DEVOLUCION' and (cardinality(p_garment_ids)<>0 or cardinality(v_return_ids)<1))
 or (p_kind='CAMBIO' and (cardinality(p_garment_ids)<>1 or cardinality(v_return_ids)<>1))
 or (p_kind<>'ENTREGA' and (p_expected_version is null or p_person_id is not null or p_due_local is not null or p_notes is not null)) then
  raise exception 'INVALID_MOVEMENT' using errcode='22023';
 end if;
 v_payload:=jsonb_build_object('kind',p_kind,'loan_id',p_loan_id,'version',p_expected_version,'person_id',p_person_id,'garment_ids',p_garment_ids,'returns',p_returns,'due_local',p_due_local,'notes',nullif(btrim(p_notes),''));
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,4));
 select * into v_existing from public.loan_movements where id=p_request_id;
 if found then
  if v_existing.request_payload<>v_payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
  select * into v_loan from public.loans where id=v_existing.loan_id; return v_loan;
 end if;
 -- Lock order: person, loan, then every affected garment in UUID order.
 if p_kind='ENTREGA' then v_person_id:=p_person_id;
 else select person_id into v_person_id from public.loans where id=p_loan_id;
  if not found then raise exception 'LOAN_NOT_FOUND' using errcode='P0002'; end if;
 end if;
 select * into v_person from public.people where id=v_person_id for update;
 if not found then raise exception 'PERSON_NOT_FOUND' using errcode='P0002'; end if;
 if p_kind='ENTREGA' then
  if v_person.archived_at is not null then raise exception 'PERSON_ARCHIVED' using errcode='22023'; end if;
  if exists(select 1 from public.loans where id=p_loan_id) then raise exception 'LOAN_CHANGED' using errcode='PT409'; end if;
 else
  select * into v_loan from public.loans where id=p_loan_id for update;
  if v_loan.version<>p_expected_version or v_loan.closed_at is not null then raise exception 'LOAN_CHANGED' using errcode='PT409'; end if;
  if (select count(*) from public.loan_items where id=any(v_return_ids) and loan_id=p_loan_id and returned_at is null)<>cardinality(v_return_ids) then raise exception 'ITEM_NOT_OPEN' using errcode='PT409'; end if;
  v_before:=to_jsonb(v_loan);
 end if;
 select array_agg(id order by id) into v_ids from (
  select unnest(p_garment_ids) id union select garment_id from public.loan_items where id=any(v_return_ids)
 ) affected;
 perform id from public.garments where id=any(v_ids) order by id for update;
 if (select count(*) from public.garments where id=any(p_garment_ids) and archived_at is null and physical_state='DISPONIBLE')<>cardinality(p_garment_ids) then
  raise exception 'GARMENT_NOT_READY' using errcode='22023';
 end if;
 if exists(select 1 from public.loan_items where garment_id=any(p_garment_ids) and returned_at is null) then raise exception 'GARMENT_IN_CUSTODY' using errcode='PT409'; end if;
 if p_kind='CAMBIO' and (select garment_type_id from public.garments where id=p_garment_ids[1])<>(select garment_type_id from public.loan_items where id=v_return_ids[1]) then raise exception 'EXCHANGE_TYPE_MISMATCH' using errcode='22023'; end if;
 v_at:=clock_timestamp();
 if p_kind='ENTREGA' then
  if nullif(p_due_local,'') is not null then
   if p_due_local!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_DUE_DATE' using errcode='22023'; end if;
   v_local:=p_due_local::timestamp; v_due:=v_local at time zone 'Europe/Madrid';
   if v_due at time zone 'Europe/Madrid'<>v_local or (v_due-interval '1 hour') at time zone 'Europe/Madrid'=v_local
     or (v_due+interval '1 hour') at time zone 'Europe/Madrid'=v_local or v_due<v_at then raise exception 'INVALID_DUE_DATE' using errcode='22023'; end if;
  end if;
  insert into public.loans(id,person_id,person_name,opened_at,due_at,notes,created_by)
   values(p_loan_id,v_person.id,v_person.full_name,v_at,v_due,nullif(btrim(p_notes),''),v_actor) returning * into v_loan;
 end if;
 for v_return in select value from jsonb_array_elements(p_returns) loop
  v_state:=(v_return->>'state')::public.garment_state;
  update public.loan_items set returned_at=v_at,returned_state=v_state where id=(v_return->>'item_id')::uuid returning * into v_item;
  update public.garments set physical_state=v_state,version=version+1,updated_at=v_at,updated_by=v_actor
   where id=v_item.garment_id and physical_state<>v_state;
  v_returned:=v_returned||jsonb_build_array(to_jsonb(v_item));
 end loop;
 foreach v_garment in array p_garment_ids loop
  insert into public.loan_items(loan_id,garment_id,code,garment_type_id,type_name,size,delivered_at)
   select p_loan_id,g.id,g.code,g.garment_type_id,t.name,g.size,v_at from public.garments g join public.garment_types t on t.id=g.garment_type_id where g.id=v_garment
   returning * into v_item;
  v_delivered:=v_delivered||jsonb_build_array(to_jsonb(v_item));
 end loop;
 if p_kind<>'ENTREGA' then
  update public.loans set version=version+1,closed_at=case when not exists(select 1 from public.loan_items where loan_id=p_loan_id and returned_at is null) then v_at else null end
   where id=p_loan_id returning * into v_loan;
 end if;
 select display_name into v_actor_name from public.admin_profiles where user_id=v_actor;
 v_details:=jsonb_build_object('person_id',v_person.id,'person_name',v_person.full_name,'delivered',v_delivered,'returned',v_returned);
 insert into public.loan_movements(id,loan_id,kind,actor_id,actor_name,occurred_at,signature_confirmed,details,request_payload)
  values(p_request_id,p_loan_id,p_kind,v_actor,v_actor_name,v_at,true,v_details,v_payload);
 insert into public.audit_log(actor_id,actor_name,action,entity_type,entity_id,before_data,after_data)
  values(v_actor,v_actor_name,case p_kind when 'ENTREGA' then 'CESION_ABIERTA' when 'DEVOLUCION' then 'DEVOLUCION_REGISTRADA' else 'CAMBIO_REGISTRADO' end,
   'loan',p_loan_id,v_before,to_jsonb(v_loan)||jsonb_build_object('movement_id',p_request_id));
 return v_loan;
end;
$$;
revoke all on function public.record_loan_movement(uuid,text,uuid,integer,uuid,uuid[],jsonb,text,text,boolean) from public,anon;
grant execute on function public.record_loan_movement(uuid,text,uuid,integer,uuid,uuid[],jsonb,text,text,boolean) to authenticated;

create view public.loan_overview with(security_invoker=true) as
 select l.*, (select count(*) from public.loan_items i where i.loan_id=l.id and i.returned_at is null) as held_count,
 (select count(*) from public.loan_items i where i.loan_id=l.id) as item_count,
 (select array_agg(distinct i.garment_id) from public.loan_items i where i.loan_id=l.id) as garment_ids
 from public.loans l;
create view public.garment_inventory with(security_invoker=true) as
 select g.*, t.name as type_name, i.loan_id, l.person_id as holder_id, p.full_name as holder_name
 from public.garments g join public.garment_types t on t.id=g.garment_type_id
 left join public.loan_items i on i.garment_id=g.id and i.returned_at is null
 left join public.loans l on l.id=i.loan_id left join public.people p on p.id=l.person_id;
revoke all on public.loan_overview,public.garment_inventory from public,anon,authenticated;
grant select on public.loan_overview,public.garment_inventory to authenticated;

-- The physical state remains separate. Available here means ready and actually in the band.
drop function public.inventory_summary();
create function public.inventory_summary()
returns table(active_count bigint,available_count bigint,laundry_count bigint,damaged_count bigint,archived_count bigint,held_count bigint)
language sql stable security invoker set search_path='' as $$
 select count(*) filter(where archived_at is null),
 count(*) filter(where archived_at is null and physical_state='DISPONIBLE' and loan_id is null),
 count(*) filter(where archived_at is null and physical_state='PENDIENTE_LAVANDERIA'),
 count(*) filter(where archived_at is null and physical_state='DANADA'),
 count(*) filter(where archived_at is not null),count(*) filter(where loan_id is not null)
 from public.garment_inventory;
$$;
revoke all on function public.inventory_summary() from public,anon;
grant execute on function public.inventory_summary() to authenticated;
