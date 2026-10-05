-- Individual events. Planned occupation and actual custody remain independent.
create table public.uniforms (
 id uuid primary key, name text not null check(length(btrim(name)) between 1 and 100),
 type_ids uuid[] not null check(cardinality(type_ids) between 1 and 30),
 archived boolean not null default false, version integer not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid not null references public.admin_profiles(user_id)
);
create table public.events (
 id uuid primary key, title text not null check(length(btrim(title)) between 1 and 160),
 starts_at timestamptz not null, ends_at timestamptz not null,
 planned_from timestamptz not null, planned_until timestamptz not null,
 uniform_id uuid not null references public.uniforms(id), uniform_name text not null,
 type_ids uuid[] not null, notes text check(length(notes)<=2000), cancelled boolean not null default false,
 version integer not null default 1, updated_at timestamptz not null default now(),
 updated_by uuid not null references public.admin_profiles(user_id),
 check(planned_from<=starts_at and starts_at<ends_at and ends_at<=planned_until)
);
create index events_start on public.events(starts_at,id);
create table public.event_participants (
 event_id uuid references public.events(id), person_id uuid references public.people(id),
 active boolean not null default true, primary key(event_id,person_id)
);
create table public.event_assignments (
 event_id uuid not null, person_id uuid not null, type_id uuid references public.garment_types(id),
 garment_id uuid references public.garments(id), fulfilled_item_id uuid references public.loan_items(id),
 primary key(event_id,person_id,type_id),
 foreign key(event_id,person_id) references public.event_participants(event_id,person_id)
);
create index event_assignments_garment on public.event_assignments(garment_id);
-- Deduplicates commands, including a retry after a response was lost. No signature bitmap.
create table public.planning_requests (
 id uuid primary key, payload jsonb not null, result jsonb not null,
 actor_id uuid not null references public.admin_profiles(user_id), occurred_at timestamptz not null default now()
);
do $$ declare tab text; begin
 foreach tab in array array['uniforms','events','event_participants','event_assignments','planning_requests'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('grant all on public.%I to service_role',tab);
  execute format('create policy "Admins read planning" on public.%I for select to authenticated using((select private.is_admin()))',tab);
 end loop;
end $$;

alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
 add column event_id uuid generated always as(case when entity_type='event' then entity_id end) stored references public.events(id),
 add column uniform_id uuid generated always as(case when entity_type='uniform' then entity_id end) stored references public.uniforms(id),
 add constraint audit_log_entity_type_check check(entity_type in ('person','garment','loan','event','uniform')),
 add constraint audit_log_action_check check(
  (entity_type='garment' and action in ('PRENDA_CREADA','PRENDA_EDITADA','PRENDA_ARCHIVADA','PRENDA_REACTIVADA')) or
  (entity_type='person' and action in ('PERSONA_CREADA','PERSONA_EDITADA','PERSONA_ARCHIVADA','PERSONA_REACTIVADA')) or
  (entity_type='loan' and action in ('CESION_ABIERTA','DEVOLUCION_REGISTRADA','CAMBIO_REGISTRADO')) or
  (entity_type in ('event','uniform') and action in ('UNIFORM','EVENT','CANCEL','PARTICIPANT','ASSIGN','DELIVER'))
 );
create index audit_log_event on public.audit_log(event_id) where event_id is not null;
create index audit_log_uniform on public.audit_log(uniform_id) where uniform_id is not null;

create function private.madrid_time(value text) returns timestamptz language plpgsql set search_path='' as $$
declare l timestamp; v timestamptz;
begin
 if value is null or value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'INVALID_EVENT_DATE' using errcode='22023'; end if;
 begin l:=value::timestamp; exception when others then raise exception 'INVALID_EVENT_DATE' using errcode='22023'; end;
 v:=l at time zone 'Europe/Madrid';
 if to_char(l,'YYYY-MM-DD"T"HH24:MI')<>value or v at time zone 'Europe/Madrid'<>l
 or (v-interval '1 hour') at time zone 'Europe/Madrid'=l or (v+interval '1 hour') at time zone 'Europe/Madrid'=l then
 raise exception 'INVALID_EVENT_DATE' using errcode='22023'; end if;
 return v;
end $$;
revoke all on function private.madrid_time(text) from public,anon,authenticated;

create view public.event_preparation with(security_invoker=true) as
select e.id event_id,p.id person_id,p.full_name,p.instrument,p.kind,p.archived_at person_archived_at,
 t.id type_id,t.name type_name,a.garment_id,g.code,g.size,g.physical_state,g.archived_at,
 l.person_id holder_id,l.person_name holder_name,li.loan_id,l.due_at,fi.returned_at,
 case when a.garment_id is null then 'SIN_ASIGNAR'
 when g.archived_at is not null or p.archived_at is not null or g.garment_type_id<>t.id or g.physical_state<>'DISPONIBLE' then 'CONFLICTO'
 when l.person_id=p.id then 'EN_SU_PODER'
 when l.person_id is not null and l.due_at<=e.planned_from and l.due_at>now() then 'PENDIENTE_DEVOLUCION'
 when l.person_id is not null then 'CONFLICTO'
 when fi.returned_at is not null then 'DEVUELTA'
 else 'ASIGNADA' end status
from public.events e join public.event_participants ep on ep.event_id=e.id and ep.active
join public.people p on p.id=ep.person_id
cross join lateral unnest(e.type_ids) required(type_id)
join public.garment_types t on t.id=required.type_id
left join public.event_assignments a on a.event_id=e.id and a.person_id=p.id and a.type_id=t.id
left join public.garments g on g.id=a.garment_id
left join public.loan_items li on li.garment_id=g.id and li.returned_at is null
left join public.loans l on l.id=li.loan_id
left join public.loan_items fi on fi.id=a.fulfilled_item_id;
grant select on public.event_preparation to authenticated;

create function private.check_event_assignments(e public.events) returns void language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.event_assignments a join public.event_participants p using(event_id,person_id)
 join public.event_assignments b on b.garment_id=a.garment_id and b.event_id<>a.event_id
 join public.event_participants bp on bp.event_id=b.event_id and bp.person_id=b.person_id and bp.active
 join public.events other on other.id=b.event_id and not other.cancelled
 where a.event_id=e.id and p.active and e.planned_from<other.planned_until and other.planned_from<e.planned_until) then
 raise exception 'RESERVATION_OVERLAP' using errcode='PT409'; end if;
 if exists(select garment_id from public.event_assignments a join public.event_participants p using(event_id,person_id)
 where a.event_id=e.id and p.active and garment_id is not null group by garment_id having count(*)>1) then
 raise exception 'RESERVATION_OVERLAP' using errcode='PT409'; end if;
end $$;
revoke all on function private.check_event_assignments(public.events) from public,anon,authenticated;

create function public.plan_event(p_request_id uuid,p_action text,p_id uuid,p_expected_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; u public.uniforms; old_data jsonb; result jsonb; payload jsonb; prev public.planning_requests;
 types uuid[]; person uuid; garment uuid; typ uuid; g public.garments; holder public.loans; v_active boolean;
 actor_name text; loan public.loans; ids uuid[]; cmd jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request_id is null or p_id is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object'
 or p_action not in ('UNIFORM','EVENT','CANCEL','PARTICIPANT','ASSIGN','DELIVER') then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 -- Only bounded fields for each command; never accept image or trace data.
 if (p_action='UNIFORM' and p_data-array['name','type_ids','archived']<>'{}')
 or (p_action='EVENT' and p_data-array['title','starts','ends','from','until','uniform_id','notes']<>'{}')
 or (p_action='CANCEL' and p_data<>'{}')
 or (p_action='PARTICIPANT' and p_data-array['person_id','active','name','instrument']<>'{}')
 or (p_action='ASSIGN' and p_data-array['person_id','type_id','garment_id']<>'{}')
 or (p_action='DELIVER' and p_data-array['person_id','loan_id','garment_ids','signed']<>'{}') then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 -- Small admin workload: serialize planning to prevent write skew across different events.
 -- No existing movement RPC takes this lock; locks below follow person -> loan -> garment.
 perform pg_advisory_xact_lock(65005);
 payload:=jsonb_build_object('action',p_action,'id',p_id,'version',p_expected_version,'data',p_data);
 select * into prev from public.planning_requests where id=p_request_id;
 if found then
  if prev.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
  return prev.result;
 end if;
 if p_action='UNIFORM' then
  select * into u from public.uniforms where id=p_id for update; old_data:=to_jsonb(u);
  if (u.id is null and p_expected_version is not null) or (u.id is not null and u.version is distinct from p_expected_version) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
  select array_agg(distinct value::uuid order by value::uuid) into types from jsonb_array_elements_text(p_data->'type_ids');
  if types is null or cardinality(types)>30 or exists(select 1 from unnest(types) x left join public.garment_types t on t.id=x where t.id is null or not t.active)
  or length(btrim(coalesce(p_data->>'name',''))) not between 1 and 100 then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
  insert into public.uniforms(id,name,type_ids,archived,updated_by) values(p_id,btrim(p_data->>'name'),types,coalesce((p_data->>'archived')::boolean,false),auth.uid())
  on conflict(id) do update set name=excluded.name,type_ids=excluded.type_ids,archived=excluded.archived,version=uniforms.version+1,updated_at=now(),updated_by=auth.uid() returning * into u;
  result:=to_jsonb(u);
 else
  select * into e from public.events where id=p_id for update; old_data:=to_jsonb(e);
  if (e.id is null and (p_action<>'EVENT' or p_expected_version is not null)) or (e.id is not null and e.version is distinct from p_expected_version) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
  if e.cancelled then raise exception 'EVENT_CANCELLED' using errcode='22023'; end if;
  old_data:=jsonb_build_object('event',old_data,'participants',(select coalesce(jsonb_agg(to_jsonb(ep)),'[]') from public.event_participants ep where ep.event_id=p_id),'assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.event_assignments a where a.event_id=p_id));
  if p_action='EVENT' then
   select * into u from public.uniforms where id=(p_data->>'uniform_id')::uuid;
   if u.id is null or (u.archived and e.uniform_id is distinct from u.id) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
   if e.id is null or e.uniform_id<>u.id then
    if exists(select 1 from public.event_assignments where event_id=p_id and garment_id is not null) then raise exception 'UNIFORM_HAS_ASSIGNMENTS' using errcode='22023'; end if;
    e.type_ids:=u.type_ids; e.uniform_name:=u.name;
   end if;
   e.title:=btrim(p_data->>'title'); e.starts_at:=private.madrid_time(p_data->>'starts'); e.ends_at:=private.madrid_time(p_data->>'ends');
   e.planned_from:=private.madrid_time(p_data->>'from'); e.planned_until:=private.madrid_time(p_data->>'until');
   if e.title is null or length(e.title) not between 1 and 160 or not(e.planned_from<=e.starts_at and e.starts_at<e.ends_at and e.ends_at<=e.planned_until)
   or length(p_data->>'notes')>2000 then raise exception 'INVALID_EVENT_DATE' using errcode='22023'; end if;
   e.id:=p_id; e.uniform_id:=u.id;
   perform private.check_event_assignments(e);
   insert into public.events(id,title,starts_at,ends_at,planned_from,planned_until,uniform_id,uniform_name,type_ids,notes,updated_by)
   values(p_id,e.title,e.starts_at,e.ends_at,e.planned_from,e.planned_until,u.id,e.uniform_name,e.type_ids,nullif(btrim(p_data->>'notes'),''),auth.uid())
   on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,planned_from=excluded.planned_from,planned_until=excluded.planned_until,
    uniform_id=excluded.uniform_id,uniform_name=excluded.uniform_name,type_ids=excluded.type_ids,notes=excluded.notes,version=events.version+1,updated_at=now(),updated_by=auth.uid() returning * into e;
  elsif p_action='CANCEL' then
   -- Cancellation releases the plan, never records fictitious physical returns.
   update public.events set cancelled=true where id=p_id;
  else
   person:=(p_data->>'person_id')::uuid;
   if person is null then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
   if p_action='PARTICIPANT' and p_data ? 'name' then
    if exists(select 1 from public.people where id=person) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
    if length(btrim(coalesce(p_data->>'instrument','')))=0 then raise exception 'INSTRUMENT_REQUIRED' using errcode='22023'; end if;
    perform public.save_person(person,null,p_data->>'name','REFUERZO',p_data->>'instrument',null,null);
   end if;
   perform 1 from public.people where id=person and archived_at is null for update;
   if not found then raise exception 'PERSON_ARCHIVED' using errcode='22023'; end if;
   if p_action='PARTICIPANT' then
    v_active:=coalesce((p_data->>'active')::boolean,true);
    insert into public.event_participants values(p_id,person,v_active) on conflict(event_id,person_id) do update set active=excluded.active;
    perform private.check_event_assignments(e);
   else
    if not exists(select 1 from public.event_participants where event_id=p_id and person_id=person and active) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
    if p_action='ASSIGN' then
     typ:=(p_data->>'type_id')::uuid; garment:=(p_data->>'garment_id')::uuid;
     if typ is null or not(typ=any(e.type_ids)) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
     if garment is not null then
      select * into g from public.garments where id=garment for update;
      if g.id is null or g.archived_at is not null or g.physical_state<>'DISPONIBLE' or g.garment_type_id<>typ then raise exception 'GARMENT_NOT_READY' using errcode='22023'; end if;
      select l.* into holder from public.loan_items i join public.loans l on l.id=i.loan_id where i.garment_id=garment and i.returned_at is null;
      if holder.id is not null and holder.person_id<>person and (holder.due_at is null or holder.due_at>e.planned_from or holder.due_at<=now()) then raise exception 'GARMENT_IN_CUSTODY' using errcode='22023'; end if;
     end if;
     insert into public.event_assignments(event_id,person_id,type_id,garment_id) values(p_id,person,typ,garment)
     on conflict(event_id,person_id,type_id) do update set garment_id=excluded.garment_id,fulfilled_item_id=null;
     perform private.check_event_assignments(e);
    elsif p_action='DELIVER' then
     if (p_data->>'signed')::boolean is distinct from true then raise exception 'SIGNATURE_REQUIRED' using errcode='22023'; end if;
     select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_data->'garment_ids');
     if ids is null or cardinality(ids)>30 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.event_assignments a where a.event_id=p_id and a.person_id=person and a.garment_id=x)) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
     if e.planned_until<=now() then raise exception 'EVENT_FINISHED' using errcode='22023'; end if;
     -- Early collection must also respect reservations between now and the planned start.
     if exists(select 1 from public.event_assignments a join public.events other on other.id=a.event_id and not other.cancelled
      join public.event_participants ep on ep.event_id=a.event_id and ep.person_id=a.person_id and ep.active
      where a.garment_id=any(ids) and a.event_id<>p_id and other.planned_from<e.planned_until and other.planned_until>now()) then raise exception 'RESERVATION_OVERLAP' using errcode='PT409'; end if;
     select * into loan from public.record_loan_movement(p_request_id,'ENTREGA',(p_data->>'loan_id')::uuid,null,person,ids,'[]',to_char(e.planned_until at time zone 'Europe/Madrid','YYYY-MM-DD"T"HH24:MI'),'Actuación: '||e.title,true);
     update public.event_assignments a set fulfilled_item_id=i.id from public.loan_items i where a.event_id=p_id and a.person_id=person and i.loan_id=loan.id and i.garment_id=a.garment_id;
    end if;
   end if;
  end if;
  if p_action<>'EVENT' then update public.events set version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into e; end if;
  result:=to_jsonb(e);
 end if;
 select display_name into actor_name from public.admin_profiles where user_id=auth.uid();
 insert into public.audit_log(actor_id,actor_name,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),actor_name,p_action,case when p_action='UNIFORM' then 'uniform' else 'event' end,p_id,old_data,jsonb_build_object('record',result,'change',p_data));
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request_id,payload,result,auth.uid());
 return result;
end $$;
revoke all on function public.plan_event(uuid,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.plan_event(uuid,text,uuid,integer,jsonb) to authenticated;
create view public.event_people with(security_invoker=true) as
select ep.event_id,p.id person_id,p.full_name,p.instrument,p.kind,p.archived_at
from public.event_participants ep join public.people p on p.id=ep.person_id where ep.active;
create view public.garment_reservations with(security_invoker=true) as
select a.event_id,a.person_id,a.garment_id,e.title,e.planned_from,e.planned_until,p.full_name
from public.event_assignments a join public.events e on e.id=a.event_id
join public.event_participants ep on ep.event_id=a.event_id and ep.person_id=a.person_id and ep.active
join public.people p on p.id=a.person_id
where not e.cancelled and e.planned_until>now() and a.garment_id is not null;
grant select on public.event_people,public.garment_reservations to authenticated;

create function public.event_garment_choices(p_event uuid,p_person uuid,p_type uuid,p_q text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into e from public.events where id=p_event and not cancelled;
 if e.id is null or p_page not between 1 and 100000 or p_page is null or p_type is null then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 with candidates as (
  select g.id,g.code,g.size,g.holder_name,
  case when g.archived_at is not null or g.physical_state<>'DISPONIBLE' then 'Estado físico no disponible'
   when exists(select 1 from public.garment_reservations r where r.garment_id=g.id and not(r.event_id=p_event and r.person_id=p_person)
    and r.planned_from<e.planned_until and e.planned_from<r.planned_until) then 'Reservada en ese periodo'
   when g.holder_id is not null and g.holder_id<>p_person and (l.due_at is null or l.due_at>e.planned_from or l.due_at<=now()) then 'Cedida sin devolución compatible'
   else null end blocked,
  case when g.holder_id=p_person then 'Ya está en su poder' when g.holder_id is not null then 'Pendiente de devolución de '||g.holder_name else 'En la Banda' end situation
  from public.garment_inventory g left join public.loans l on l.id=g.loan_id
  where g.garment_type_id=p_type and g.archived_at is null and strpos(lower(g.code),lower(left(coalesce(p_q,''),60)))>0
 ), page as(select * from candidates order by (blocked is not null),code,id limit 12 offset (p_page-1)*12)
 select jsonb_build_object('count',(select count(*) from candidates),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]')) into result;
 return result;
end $$;
revoke all on function public.event_garment_choices(uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.event_garment_choices(uuid,uuid,uuid,text,integer) to authenticated;
-- A future reservation is supplementary information, never a physical state.
create or replace view public.garment_inventory with(security_invoker=true) as
 select g.*,t.name as type_name,i.loan_id,l.person_id as holder_id,p.full_name as holder_name,
 r.full_name as next_assignee,r.planned_from as next_reserved_from
 from public.garments g join public.garment_types t on t.id=g.garment_type_id
 left join public.loan_items i on i.garment_id=g.id and i.returned_at is null
 left join public.loans l on l.id=i.loan_id left join public.people p on p.id=l.person_id
 left join lateral(select full_name,planned_from from public.garment_reservations where garment_id=g.id order by planned_from,event_id limit 1) r on true;
