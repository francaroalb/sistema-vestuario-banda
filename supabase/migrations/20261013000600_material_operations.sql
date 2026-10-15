-- Phase 6: atomic, person-scoped operations over the existing specialized domains.
alter table public.material_operations add column parent_operation_id uuid references public.material_operations(id);
create index material_operations_parent on public.material_operations(parent_operation_id) where parent_operation_id is not null;
alter table public.loan_movements add column material_operation_id uuid references public.material_operations(id);
create index loan_movements_material on public.loan_movements(material_operation_id) where material_operation_id is not null;

create view public.material_held with(security_invoker=true) as
select 'GARMENT'::text domain,i.id,i.garment_id asset_id,i.code,i.type_name label,l.id loan_id,l.person_id,l.version,g.version asset_version,l.due_at
from public.loan_items i join public.loans l on l.id=i.loan_id join public.garments g on g.id=i.garment_id where i.returned_at is null
union all
select 'FOLDER',l.id,i.folder_id,i.code,v.name,l.id,l.person_id,l.version,f.version,i.due_at
from public.folder_loan_items i join public.folder_loans l on l.id=i.loan_id join public.music_folders f on f.id=i.folder_id join public.musical_voices v on v.id=f.voice_id where i.returned_at is null;
grant select on public.material_held to authenticated;

create function public.preview_material_operation(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare person public.people; line jsonb; g public.garment_inventory; held public.material_held;
 folders jsonb:='[]'; garments jsonb:='[]'; warnings jsonb:='[]'; conflicts jsonb:='[]'; f jsonb; reservations jsonb; due timestamptz; action text;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 perform private.music_fields(p_data,array['action','person_id','notes','garments','folders']);
 action:=p_data->>'action';
 if action is null or action not in ('DELIVER','RETURN') or jsonb_typeof(p_data->'garments') is distinct from 'array' or jsonb_typeof(p_data->'folders') is distinct from 'array'
 or jsonb_array_length(p_data->'garments')+jsonb_array_length(p_data->'folders') not between 1 and 30 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_text(p_data,'notes',2000);
 select * into person from public.people where id=(p_data->>'person_id')::uuid;
 if person.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 if action='DELIVER' and person.archived_at is not null then raise exception 'PERSON_ARCHIVED' using errcode='22023'; end if;
 if (select count(distinct e->>'id') from jsonb_array_elements(p_data->'garments') e)<>jsonb_array_length(p_data->'garments')
 or (select count(distinct e->>'id') from jsonb_array_elements(p_data->'folders') e)<>jsonb_array_length(p_data->'folders') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 for line in select value from jsonb_array_elements(p_data->'garments') loop
  if action='DELIVER' then
   perform private.music_fields(line,array['id','version','due_local']);
   select * into g from public.garment_inventory where id=(line->>'id')::uuid;
   if g.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
   perform private.music_version(g.version,(line->>'version')::integer);
   if g.archived_at is not null or g.physical_state<>'DISPONIBLE' or g.loan_id is not null then raise exception 'GARMENT_NOT_READY' using errcode='PT409'; end if;
   due:=private.folder_local_time(private.music_text(line,'due_local',16));
   if due<=clock_timestamp() then raise exception 'FOLDER_INVALID_DATE' using errcode='22023'; end if;
   select coalesce(jsonb_agg(to_jsonb(r) order by r.planned_from,r.event_id),'[]') into reservations from public.garment_reservations r
    where r.garment_id=g.id and r.person_id<>person.id and r.planned_until>clock_timestamp();
   if jsonb_array_length(reservations)>0 then warnings:=warnings||jsonb_build_array(g.code||': hay actuaciones previstas para otra persona. Comprueba las fechas antes de entregar.'); end if;
   garments:=garments||jsonb_build_array(jsonb_build_object('id',g.id,'code',g.code,'label',g.type_name,'version',g.version,'due_local',line->'due_local','reservations',reservations));
  else
   perform private.music_fields(line,array['id','version','state']);
   select * into held from public.material_held where domain='GARMENT' and id=(line->>'id')::uuid;
   if held.id is null or held.person_id<>person.id then raise exception 'ITEM_NOT_OPEN' using errcode='PT409'; end if;
   perform private.music_version(held.version,(line->>'version')::integer);
   if line->>'state' is null or line->>'state' not in ('DISPONIBLE','PENDIENTE_LAVANDERIA','DANADA') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
   garments:=garments||jsonb_build_array(to_jsonb(held)||jsonb_build_object('state',line->'state'));
  end if;
 end loop;
 for line in select value from jsonb_array_elements(p_data->'folders') loop
  perform private.music_fields(line,array['id','version','data']);
  if action='DELIVER' and (line->'data'->>'person_id')::uuid is distinct from person.id then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
  if action='RETURN' and not exists(select 1 from public.folder_loans where id=(line->>'id')::uuid and person_id=person.id) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
  f:=public.preview_folder_loan(action,(line->>'id')::uuid,(line->>'version')::integer,line->'data');
  folders:=folders||jsonb_build_array(f);
  warnings:=warnings||coalesce((select jsonb_agg((f->>'folder_code')||': '||w) from jsonb_array_elements_text(f->'warnings') w),'[]');
  conflicts:=conflicts||coalesce((select jsonb_agg((f->>'folder_code')||': '||w) from jsonb_array_elements_text(f->'conflicts') w),'[]');
 end loop;
 if (select count(distinct e->'data'->>'folder_id') from jsonb_array_elements(folders) e)<>jsonb_array_length(folders) and action='DELIVER' then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 return jsonb_build_object('data',p_data,'person_name',person.full_name,'person_version',person.version,'garments',garments,'folders',folders,'warnings',warnings,'conflicts',conflicts);
end $$;

create function public.apply_material_operation(p_request uuid,p_preview jsonb,p_signature boolean,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
<<op>>
declare previous public.material_operations; payload jsonb; fresh jsonb; d jsonb; line jsonb; grp record; child uuid; result jsonb:='[]'; r jsonb; l public.loans; actor_name text; action text; person uuid;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_signature is distinct from true then raise exception 'SIGNATURE_REQUIRED' using errcode='22023'; end if;
 if p_acknowledged is null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_fields(p_preview,array['data','person_name','person_version','garments','folders','warnings','conflicts']);
 -- Global planning lock precedes music lock; then person, loans and garments.
 perform pg_advisory_xact_lock(65005);
 perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('preview',p_preview,'signature',p_signature,'acknowledged',p_acknowledged);
 select * into previous from public.material_operations where id=p_request;
 if found then
  if previous.actor_id<>auth.uid() or previous.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
  return previous.result;
 end if;
 d:=p_preview->'data'; action:=d->>'action'; person:=(d->>'person_id')::uuid;
 perform 1 from public.people where id=person for update;
 perform 1 from public.loans where person_id=person order by id for update;
 perform 1 from public.garments where id in (
  select case when action='DELIVER' then (e->>'id')::uuid else (select garment_id from public.loan_items where id=(e->>'id')::uuid) end from jsonb_array_elements(d->'garments') e
 ) order by id for update;
 fresh:=public.preview_material_operation(d);
 if fresh<>p_preview then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 if jsonb_array_length(fresh->'conflicts')>0 then raise exception 'FOLDER_UNAVAILABLE' using errcode='PT409'; end if;
 if jsonb_array_length(fresh->'warnings')>0 and not p_acknowledged then raise exception 'FOLDER_ACK_REQUIRED' using errcode='22023'; end if;
 select display_name into actor_name from public.admin_profiles where user_id=auth.uid();
 insert into public.material_operations(id,actor_id,actor_name,action,signature_confirmed,payload,result) values(p_request,auth.uid(),actor_name,action,true,payload,'{}');
 if action='DELIVER' then
  -- Separate loans preserve an independent due date for every garment without rewriting legacy loans.
  for line in select value from jsonb_array_elements(d->'garments') loop
   child:=gen_random_uuid();
   l:=public.record_loan_movement(child,'ENTREGA',gen_random_uuid(),null,person,array[(line->>'id')::uuid],'[]',line->>'due_local',d->>'notes',true);
   update public.loan_movements set material_operation_id=p_request where id=child;
   result:=result||jsonb_build_array(jsonb_build_object('domain','GARMENT','loan_id',l.id));
  end loop;
 else
  -- Group returns from legacy multi-item loans so their version is checked only once.
  for grp in select (e->>'loan_id')::uuid loan_id,(e->>'version')::integer version,
   jsonb_agg(jsonb_build_object('item_id',e->'id','state',e->'state')) items from jsonb_array_elements(fresh->'garments') e group by e->>'loan_id',e->>'version' order by e->>'loan_id' loop
   child:=gen_random_uuid();
   l:=public.record_loan_movement(child,'DEVOLUCION',grp.loan_id,grp.version,null,'{}',grp.items,null,null,true);
   update public.loan_movements set material_operation_id=p_request where id=child;
   result:=result||jsonb_build_array(jsonb_build_object('domain','GARMENT','loan_id',l.id));
  end loop;
 end if;
 for line in select value from jsonb_array_elements(fresh->'folders') loop
  child:=gen_random_uuid();
  r:=public.apply_folder_loan(child,line,true,p_acknowledged);
  update public.material_operations set parent_operation_id=p_request where id=child;
  result:=result||jsonb_build_array(jsonb_build_object('domain','FOLDER','loan_id',r->'id'));
 end loop;
 r:=jsonb_build_object('id',p_request,'action',action,'loans',result);
 update public.material_operations set result=r where id=p_request;
 return r;
end $$;
revoke all on function public.preview_material_operation(jsonb),public.apply_material_operation(uuid,jsonb,boolean,boolean) from public,anon;
grant execute on function public.preview_material_operation(jsonb),public.apply_material_operation(uuid,jsonb,boolean,boolean) to authenticated;
