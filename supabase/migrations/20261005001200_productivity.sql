-- Phase 9: reviewed, atomic and idempotent bulk creation; no physical movements.
create function public.preview_import(p_kind text,p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n integer:=0; errors jsonb:='[]'; seen text[]:='{}'; k text; label text; typ uuid;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('people','garments') or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'INVALID_IMPORT' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;label:=null;typ:=null;
  if jsonb_typeof(r)<>'object' then label:='Fila inválida';
  elsif exists(select 1 from jsonb_each(r) x where jsonb_typeof(x.value)<>'string') then label:='Las celdas deben ser texto';
  elsif length(coalesce(r->>'notes',''))>2000 then label:='Observaciones: máximo 2000 caracteres';
  elsif p_kind='people' then
   k:=lower(btrim(regexp_replace(coalesce(r->>'name',''),'\s+',' ','g')));
   if r-array['name','kind','instrument','phone','notes']<>'{}' then label:='Columnas no reconocidas';
   elsif length(k) not between 1 and 120 then label:='Nombre obligatorio, máximo 120 caracteres';
   elsif coalesce(r->>'kind','') not in ('BANDA','REFUERZO') then label:='Tipo: Componente o Refuerzo';
   elsif length(coalesce(r->>'instrument',''))>80 or length(coalesce(r->>'phone',''))>40 then label:='Instrumento o teléfono demasiado largo';
   elsif k=any(seen) or exists(select 1 from public.people where lower(full_name)=k) then label:='Nombre repetido: revisar la ficha existente o crear el homónimo manualmente';
   end if;
   seen:=array_append(seen,k);
  else
   k:=upper(btrim(coalesce(r->>'code','')));
   select id into typ from public.garment_types where active and lower(name)=lower(btrim(r->>'type'));
   if r-array['code','type','size','state','notes']<>'{}' then label:='Columnas no reconocidas';
   elsif length(k) not between 1 and 60 or length(btrim(coalesce(r->>'size',''))) not between 1 and 20 then label:='Código y talla obligatorios (máximos 60 y 20 caracteres)';
   elsif typ is null then label:='Tipo de prenda no reconocido o inactivo';
   elsif coalesce(r->>'state','') not in ('DISPONIBLE','PENDIENTE_LAVANDERIA','DANADA') then label:='Estado físico no válido';
   elsif k=any(seen) or exists(select 1 from public.garments where code=k) then label:='Código repetido, incluido el archivo';
   end if;
   seen:=array_append(seen,k);
  end if;
  if label is not null then errors:=errors||jsonb_build_array(jsonb_build_object('row',n+1,'message',label));end if;
 end loop;
 return jsonb_build_object('kind',p_kind,'rows',p_rows,'errors',errors);
end $$;
revoke all on function public.preview_import(text,jsonb) from public,anon;
grant execute on function public.preview_import(text,jsonb) to authenticated;

create function public.apply_import(p_request uuid,p_preview jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prev public.planning_requests; fresh jsonb; r jsonb; ids uuid[]:='{}'; new_id uuid; typ uuid; result jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_preview is null then raise exception 'INVALID_IMPORT' using errcode='22023';end if;
 perform pg_advisory_xact_lock(65005);
 select * into prev from public.planning_requests where id=p_request;
 if found then
  if prev.actor_id<>auth.uid() or prev.payload<>jsonb_build_object('import',p_preview) then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409';end if;
  return prev.result;
 end if;
 -- Coordinate duplicate checks with individual edits and other imports.
 lock table public.people,public.garments in share row exclusive mode;
 fresh:=public.preview_import(p_preview->>'kind',p_preview->'rows');
 if fresh<>p_preview or jsonb_array_length(fresh->'errors')>0 then raise exception 'IMPORT_CHANGED' using errcode='PT409';end if;
 for r in select value from jsonb_array_elements(fresh->'rows') loop
  new_id:=gen_random_uuid();
  if fresh->>'kind'='people' then
   perform public.save_person(new_id,null,r->>'name',(r->>'kind')::public.person_kind,r->>'instrument',r->>'phone',r->>'notes');
  else
   select t.id into typ from public.garment_types t where active and lower(name)=lower(btrim(r->>'type'));
   perform public.save_garment(new_id,null,r->>'code',typ,r->>'size',(r->>'state')::public.garment_state,r->>'notes');
  end if;
  ids:=array_append(ids,new_id);
 end loop;
 result:=jsonb_build_object('count',cardinality(ids),'ids',ids);
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request,jsonb_build_object('import',p_preview),result,auth.uid());
 return result;
end $$;
revoke all on function public.apply_import(uuid,jsonb) from public,anon;
grant execute on function public.apply_import(uuid,jsonb) to authenticated;

create function public.preview_series_copy(p_source uuid,p_name text,p_first_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.event_series; e record; first_day date; days integer; rows jsonb:='[]'; starts text; ends text; from_local text; until_local text;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 select * into s from public.event_series where id=p_source;
 if s.id is null or p_name is null or length(btrim(p_name)) not between 1 and 160 or p_first_date is null then raise exception 'INVALID_COPY' using errcode='22023';end if;
 select min((starts_at at time zone 'Europe/Madrid')::date) into first_day from public.events where series_id=p_source and not cancelled;
 if first_day is null then raise exception 'EMPTY_SERIES' using errcode='22023';end if;
 days:=p_first_date-first_day;
 if abs(days)>36525 then raise exception 'INVALID_COPY' using errcode='22023';end if;
 for e in select ev.*,u.version uniform_version,u.name current_uniform,u.type_ids current_types,u.archived uniform_archived from public.events ev join public.uniforms u on u.id=ev.uniform_id where series_id=p_source and not cancelled order by starts_at,id loop
  if e.uniform_archived then raise exception 'UNIFORM_ARCHIVED' using errcode='22023';end if;
  starts:=to_char((e.starts_at at time zone 'Europe/Madrid')+days*interval '1 day','YYYY-MM-DD"T"HH24:MI');
  ends:=to_char((e.ends_at at time zone 'Europe/Madrid')+days*interval '1 day','YYYY-MM-DD"T"HH24:MI');
  from_local:=to_char((e.planned_from at time zone 'Europe/Madrid')+days*interval '1 day','YYYY-MM-DD"T"HH24:MI');
  until_local:=to_char((e.planned_until at time zone 'Europe/Madrid')+days*interval '1 day','YYYY-MM-DD"T"HH24:MI');
  if private.madrid_time(starts)>=private.madrid_time(ends) or private.madrid_time(from_local)>private.madrid_time(starts) or private.madrid_time(until_local)<private.madrid_time(ends) then raise exception 'INVALID_EVENT_DATE' using errcode='22023';end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('source_id',e.id,'version',e.version,'uniform_version',e.uniform_version,'uniform_name',e.current_uniform,'type_ids',e.current_types,'data',jsonb_build_object('title',e.title,'uniform_id',e.uniform_id,'starts',starts,'ends',ends,'from',from_local,'until',until_local,'notes',e.notes)));
 end loop;
 if jsonb_array_length(rows)>60 then raise exception 'SERIES_LIMIT' using errcode='22023';end if;
 return jsonb_build_object('source',p_source,'source_version',s.version,'name',btrim(p_name),'first_date',p_first_date,'events',rows);
end $$;
revoke all on function public.preview_series_copy(uuid,text,date) from public,anon;
grant execute on function public.preview_series_copy(uuid,text,date) to authenticated;

create function public.apply_series_copy(p_request uuid,p_preview jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prev public.planning_requests; fresh jsonb; s public.event_series; e public.events; r jsonb; result jsonb; sid uuid:=gen_random_uuid(); eid uuid;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_request is null or p_preview is null then raise exception 'INVALID_COPY' using errcode='22023';end if;
 perform pg_advisory_xact_lock(65005);
 select * into prev from public.planning_requests where id=p_request;
 if found then
  if prev.actor_id<>auth.uid() or prev.payload<>jsonb_build_object('copy',p_preview) then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409';end if;
  return prev.result;
 end if;
 fresh:=public.preview_series_copy((p_preview->>'source')::uuid,p_preview->>'name',(p_preview->>'first_date')::date);
 if fresh<>p_preview then raise exception 'COPY_CHANGED' using errcode='PT409';end if;
 perform public.plan_series(gen_random_uuid(),'SERIES',sid,null,jsonb_build_object('name',fresh->>'name'));
 for r in select value from jsonb_array_elements(fresh->'events') loop
  eid:=gen_random_uuid();
  perform public.plan_event(gen_random_uuid(),'EVENT',eid,null,r->'data');
  select * into e from public.events where id=eid;
  select * into s from public.event_series where id=sid;
  perform public.plan_series(gen_random_uuid(),'MEMBERSHIP',sid,s.version,jsonb_build_object('event_id',eid,'event_version',e.version,'active',true));
 end loop;
 result:=jsonb_build_object('id',sid,'count',jsonb_array_length(fresh->'events'));
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request,jsonb_build_object('copy',p_preview),result,auth.uid());
 return result;
end $$;
revoke all on function public.apply_series_copy(uuid,jsonb) from public,anon;
grant execute on function public.apply_series_copy(uuid,jsonb) to authenticated;
