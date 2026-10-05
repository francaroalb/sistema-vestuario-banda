-- Reuse unambiguous current custody when registering attendance, without a delivery.
-- Called inside the existing planning transaction after the person lock.
create function private.assign_owned_garments(p_event uuid,p_person uuid) returns void
language plpgsql set search_path='' as $$
declare e public.events; b public.series_blocks; typ uuid; chosen uuid; n integer; event_ids uuid[]; from_at timestamptz; until_at timestamptz;
begin
 select * into e from public.events where id=p_event;
 if e.id is null or e.cancelled then return; end if;
 select sb.* into b from public.series_blocks sb join public.event_participants ep on ep.block_id=sb.id where ep.event_id=p_event and ep.person_id=p_person and ep.active;
 event_ids:=coalesce(b.event_ids,array[p_event]);
 from_at:=coalesce(b.planned_from,e.planned_from);until_at:=coalesce(b.planned_until,e.planned_until);
 for typ in select unnest(coalesce(b.type_ids,e.type_ids)) loop
  if exists(select 1 from public.event_assignments a where a.event_id=any(event_ids) and a.person_id=p_person and a.type_id=typ and a.garment_id is not null) then continue; end if;
  select count(*),min(g.id::text)::uuid into n,chosen
  from public.loan_items i join public.loans l on l.id=i.loan_id join public.garments g on g.id=i.garment_id
  where l.person_id=p_person and i.returned_at is null and g.garment_type_id=typ
  and g.archived_at is null and g.physical_state='DISPONIBLE';
  -- Do not guess between two garments of the same type, or displace another reservation.
  if n<>1 then continue; end if;
  perform 1 from public.garments where id=chosen for update;
  if exists(select 1 from public.planning_occupancy r where r.garment_id=chosen
   and not(r.event_id=any(event_ids) and r.person_id=p_person)
   and r.planned_from<until_at and from_at<r.planned_until) then continue; end if;
  insert into public.event_assignments(event_id,person_id,type_id,garment_id)
  select unnest(event_ids),p_person,typ,chosen
  on conflict(event_id,person_id,type_id) do update set garment_id=excluded.garment_id,fulfilled_item_id=null
  where public.event_assignments.garment_id is null;
 end loop;
end $$;
revoke all on function private.assign_owned_garments(uuid,uuid) from public,anon,authenticated;

create or replace function public.plan_event(p_request_id uuid,p_action text,p_id uuid,p_expected_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events; u public.uniforms; old_data jsonb; result jsonb; payload jsonb; prev public.planning_requests;
 types uuid[]; person uuid; garment uuid; typ uuid; g public.garments; holder public.loans; v_active boolean;
 actor_name text; loan public.loans; ids uuid[]; cmd jsonb; block public.series_blocks;
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
  if e.series_id is not null and p_action in ('PARTICIPANT','ASSIGN') then raise exception 'USE_SERIES' using errcode='22023'; end if;
  if p_action in ('EVENT','CANCEL') and exists(select 1 from public.series_blocks where series_id=e.series_id or e.id=any(event_ids)) then raise exception 'SERIES_PLAN_EXISTS' using errcode='22023'; end if;
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
    insert into public.event_participants(event_id,person_id,active) values(p_id,person,v_active) on conflict(event_id,person_id) do update set active=excluded.active;
    if v_active then perform private.assign_owned_garments(p_id,person); end if;
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
      if holder.id is not null and holder.person_id<>person and (exists(select 1 from public.loan_items held where held.loan_id=holder.id and held.garment_id=garment and held.returned_at is null and held.retained_at is not null) or holder.due_at is null or holder.due_at>e.planned_from or holder.due_at<=now()) then raise exception 'GARMENT_IN_CUSTODY' using errcode='22023'; end if;
     end if;
     insert into public.event_assignments(event_id,person_id,type_id,garment_id) values(p_id,person,typ,garment)
     on conflict(event_id,person_id,type_id) do update set garment_id=excluded.garment_id,fulfilled_item_id=null;
     perform private.check_event_assignments(e);
    elsif p_action='DELIVER' then
     select b.* into block from public.series_blocks b join public.event_participants ep on ep.block_id=b.id where ep.event_id=p_id and ep.person_id=person and ep.active;
     if block.id is not null then e.planned_from:=block.planned_from; e.planned_until:=block.planned_until; end if;
     if (p_data->>'signed')::boolean is distinct from true then raise exception 'SIGNATURE_REQUIRED' using errcode='22023'; end if;
     select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_data->'garment_ids');
     if ids is null or cardinality(ids)>30 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.event_assignments a where a.event_id=p_id and a.person_id=person and a.garment_id=x)) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
     if e.planned_until<=now() then raise exception 'EVENT_FINISHED' using errcode='22023'; end if;
     -- Early collection must also respect reservations between now and the planned start.
     if exists(select 1 from public.planning_occupancy r where r.garment_id=any(ids)
      and not(r.event_id=p_id and r.person_id=person) and not(coalesce(r.block_id=block.id,false))
      and r.planned_from<e.planned_until and r.planned_until>now()) then raise exception 'RESERVATION_OVERLAP' using errcode='PT409'; end if;
     select * into loan from public.record_loan_movement(p_request_id,'ENTREGA',(p_data->>'loan_id')::uuid,null,person,ids,'[]',to_char(e.planned_until at time zone 'Europe/Madrid','YYYY-MM-DD"T"HH24:MI'),'Actuación: '||e.title,true);
     update public.event_assignments a set fulfilled_item_id=i.id from public.loan_items i where (a.event_id=p_id or a.event_id=any(block.event_ids)) and a.person_id=person and i.loan_id=loan.id and i.garment_id=a.garment_id;
     if block.id is not null then
      update public.events set version=version+1,updated_at=now(),updated_by=auth.uid() where id=any(block.event_ids) and id<>p_id;
      update public.event_series set version=version+1,updated_at=now(),updated_by=auth.uid() where id=block.series_id;
     end if;
    end if;
   end if;
  end if;
  if p_action<>'EVENT' then update public.events set version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into e; end if;
  if e.series_id is not null and p_action in ('EVENT','CANCEL') then update public.event_series set version=version+1,updated_at=now(),updated_by=auth.uid() where id=e.series_id; end if;
  result:=to_jsonb(e);
 end if;
 select display_name into actor_name from public.admin_profiles where user_id=auth.uid();
 insert into public.audit_log(actor_id,actor_name,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),actor_name,p_action,case when p_action='UNIFORM' then 'uniform' else 'event' end,p_id,old_data,jsonb_build_object('record',result,'change',p_data));
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request_id,payload,result,auth.uid());
 return result;
end $$;



create or replace function public.plan_series(p_request_id uuid,p_action text,p_id uuid,p_expected_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.event_series; prev public.planning_requests; payload jsonb; old_data jsonb; result jsonb;
 person uuid; ids uuid[]; ordered uuid[]; runs uuid[][]; current_run uuid[]; ev uuid; block public.series_blocks;
 typ uuid; garment uuid; g public.garments; holder public.loans; gap boolean:=false; last_pos integer; pos integer;
 choice text; actor_name text; e public.events; b_id uuid; row_count integer;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object'
 or p_action not in ('SERIES','MEMBERSHIP','ATTENDANCE','BLOCK_ASSIGN','EVENT_CREATE')
 or (p_action='EVENT_CREATE' and p_data-array['event_id','event_data']<>'{}')
 or (p_action='SERIES' and p_data-array['name']<>'{}')
 or (p_action='MEMBERSHIP' and p_data-array['event_id','active','event_version']<>'{}')
 or (p_action='ATTENDANCE' and p_data-array['person_id','event_ids','gap_choice','name','instrument']<>'{}')
 or (p_action='BLOCK_ASSIGN' and p_data-array['block_id','type_id','garment_id']<>'{}') then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(65005);
 payload:=jsonb_build_object('series_action',p_action,'id',p_id,'version',p_expected_version,'data',p_data);
 select * into prev from public.planning_requests where id=p_request_id;
 if found then
 if prev.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
 return prev.result; end if;
 select * into s from public.event_series where id=p_id for update;
 if (s.id is null and (p_action<>'SERIES' or p_expected_version is not null)) or (s.id is not null and s.version is distinct from p_expected_version) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
 old_data:=jsonb_build_object('series',to_jsonb(s),'blocks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from public.series_blocks b where series_id=p_id),
 'events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.events x where series_id=p_id),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.event_assignments a join public.events x on x.id=a.event_id where x.series_id=p_id));
 if p_action='SERIES' then
 if length(btrim(coalesce(p_data->>'name',''))) not between 1 and 160 then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 insert into public.event_series(id,name,updated_by) values(p_id,btrim(p_data->>'name'),auth.uid())
 on conflict(id) do update set name=excluded.name,version=event_series.version+1,updated_at=now(),updated_by=auth.uid() returning * into s;
 elsif p_action='EVENT_CREATE' then
 if exists(select 1 from public.series_blocks where series_id=p_id) then raise exception 'SERIES_PLAN_EXISTS' using errcode='22023'; end if;
 if (select count(*) from public.events where series_id=p_id)>=60 then raise exception 'SERIES_LIMIT' using errcode='22023'; end if;
 ev:=(p_data->>'event_id')::uuid;
 if ev is null or exists(select 1 from public.events where id=ev) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
 perform public.plan_event(gen_random_uuid(),'EVENT',ev,null,p_data->'event_data');
 update public.events set series_id=p_id where id=ev;
 elsif p_action='MEMBERSHIP' then
 -- Changing the ordered series invalidates all gap decisions, so require clearing plans explicitly.
 if exists(select 1 from public.series_blocks where series_id=p_id) then raise exception 'SERIES_PLAN_EXISTS' using errcode='22023'; end if;
 select * into e from public.events where id=(p_data->>'event_id')::uuid for update;
 if e.id is null or e.version is distinct from (p_data->>'event_version')::integer then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
 if e.cancelled or exists(select 1 from public.event_participants where event_id=e.id and active)
 or (e.series_id is not null and e.series_id<>p_id) then raise exception 'EVENT_HAS_PLAN' using errcode='22023'; end if;
 if (p_data->>'active')::boolean is null then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if (p_data->>'active')::boolean and (select count(*) from public.events where series_id=p_id)>=60 then raise exception 'SERIES_LIMIT' using errcode='22023'; end if;
 update public.events set series_id=case when (p_data->>'active')::boolean then p_id else null end,version=version+1,updated_at=now(),updated_by=auth.uid() where id=e.id;
 elsif p_action='ATTENDANCE' then
 person:=(p_data->>'person_id')::uuid;
 if person is null or jsonb_typeof(p_data->'event_ids') is distinct from 'array' then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if p_data ? 'name' then
 if exists(select 1 from public.people where id=person) then raise exception 'PLAN_CHANGED' using errcode='PT409'; end if;
 if length(btrim(coalesce(p_data->>'instrument','')))=0 then raise exception 'INSTRUMENT_REQUIRED' using errcode='22023'; end if;
 perform public.save_person(person,null,p_data->>'name','REFUERZO',p_data->>'instrument',null,null); end if;
 perform 1 from public.people where id=person and archived_at is null for update;
 if not found then raise exception 'PERSON_ARCHIVED' using errcode='22023'; end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p_data->'event_ids');
 if cardinality(ids)<>jsonb_array_length(p_data->'event_ids') or exists(select 1 from unnest(ids) x where not exists(select 1 from public.events where id=x and series_id=p_id and not cancelled)) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if not exists(select 1 from public.series_blocks where series_id=p_id and person_id=person) and (select count(distinct person_id) from public.series_blocks where series_id=p_id)>=200 then raise exception 'SERIES_LIMIT' using errcode='22023'; end if;
 if exists(select 1 from public.event_assignments a join public.events event_row on event_row.id=a.event_id join public.loan_items li on li.id=a.fulfilled_item_id where event_row.series_id=p_id and a.person_id=person and li.returned_at is null) then raise exception 'SERIES_IN_CUSTODY' using errcode='22023'; end if;
 select coalesce(array_agg(id order by starts_at,id),'{}') into ordered from public.events where series_id=p_id and not cancelled;
 for pos in 1..cardinality(ordered) loop
 if ordered[pos]=any(ids) then
 if last_pos is not null and pos>last_pos+1 then gap:=true; end if;
 last_pos:=pos;
 end if;
 end loop;
 choice:=case when gap then p_data->>'gap_choice' else 'CONSECUTIVE' end;
 if gap and (choice is null or choice not in ('KEEP','SPLIT')) then raise exception 'GAP_DECISION_REQUIRED' using errcode='22023'; end if;
 -- Clearing/replacing a plan never returns garments. Old assignments remain in the audit snapshot.
 delete from public.event_assignments a using public.events event_row where a.event_id=event_row.id and event_row.series_id=p_id and a.person_id=person;
 update public.event_participants ep set active=false,block_id=null from public.events event_row where event_row.id=ep.event_id and event_row.series_id=p_id and ep.person_id=person;
 delete from public.series_blocks where series_id=p_id and person_id=person;
 current_run:='{}'; last_pos:=null;
 for pos in 1..cardinality(ordered)+1 loop
 if (pos>cardinality(ordered) or (choice='SPLIT' and not(ordered[pos]=any(ids)))) and cardinality(current_run)>0 then
 insert into public.series_blocks(series_id,person_id,event_ids,type_ids,planned_from,planned_until,gap_choice)
 select p_id,person,current_run,array(select distinct unnest(type_ids) from public.events where id=any(current_run)),min(planned_from),max(planned_until),choice
 from public.events where id=any(current_run) returning id into b_id;
 insert into public.event_participants(event_id,person_id,active,block_id) select unnest(current_run),person,true,b_id
 on conflict(event_id,person_id) do update set active=true,block_id=excluded.block_id;
 perform private.assign_owned_garments(current_run[1],person);
 current_run:='{}';
 end if;
 if pos<=cardinality(ordered) and ordered[pos]=any(ids) then current_run:=array_append(current_run,ordered[pos]); end if;
 end loop;
 -- Split blocks must be physically separable (a return cannot occur after the next collection).
 if exists(select 1 from public.series_blocks a join public.series_blocks b on a.series_id=b.series_id and a.person_id=b.person_id and a.id<>b.id where a.series_id=p_id and a.person_id=person and a.planned_from<b.planned_until and b.planned_from<a.planned_until) then raise exception 'SPLIT_PERIOD_OVERLAP' using errcode='22023'; end if;
 update public.events set version=version+1,updated_at=now(),updated_by=auth.uid() where series_id=p_id;
 elsif p_action='BLOCK_ASSIGN' then
 select * into block from public.series_blocks where id=(p_data->>'block_id')::uuid and series_id=p_id;
 typ:=(p_data->>'type_id')::uuid;garment:=(p_data->>'garment_id')::uuid;
 if block.id is null or typ is null or not(typ=any(block.type_ids)) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 perform 1 from public.people where id=block.person_id and archived_at is null for update;
 if not found then raise exception 'PERSON_ARCHIVED' using errcode='22023'; end if;
 if garment is not null then
 select * into g from public.garments where id=garment for update;
 if g.id is null or g.archived_at is not null or g.physical_state<>'DISPONIBLE' or g.garment_type_id<>typ then raise exception 'GARMENT_NOT_READY' using errcode='22023'; end if;
 select l.* into holder from public.loan_items i join public.loans l on l.id=i.loan_id where i.garment_id=garment and i.returned_at is null;
 if holder.id is not null and holder.person_id<>block.person_id and (exists(select 1 from public.loan_items held where held.loan_id=holder.id and held.garment_id=garment and held.returned_at is null and held.retained_at is not null) or holder.due_at is null or holder.due_at>block.planned_from or holder.due_at<=now()) then raise exception 'GARMENT_IN_CUSTODY' using errcode='22023'; end if;
 end if;
 insert into public.event_assignments(event_id,person_id,type_id,garment_id)
 select unnest(block.event_ids),block.person_id,typ,garment
 on conflict(event_id,person_id,type_id) do update set garment_id=excluded.garment_id,fulfilled_item_id=case when event_assignments.garment_id is not distinct from excluded.garment_id then event_assignments.fulfilled_item_id else null end;
 for e in select * from public.events where id=any(block.event_ids) loop perform private.check_event_assignments(e); end loop;
 update public.events set version=version+1,updated_at=now(),updated_by=auth.uid() where id=any(block.event_ids);
 end if;
 if p_action<>'SERIES' then update public.event_series set version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into s; end if;
 result:=to_jsonb(s);
 select display_name into actor_name from public.admin_profiles where user_id=auth.uid();
 insert into public.audit_log(actor_id,actor_name,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),actor_name,p_action,'series',p_id,old_data,jsonb_build_object('record',result,'change',p_data));
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request_id,payload,result,auth.uid());
 return result;
end $$;
