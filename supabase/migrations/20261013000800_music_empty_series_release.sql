-- Keep explicit release available after the last event leaves a series.
create or replace function public.music_planning_command(p_request uuid,p_action text,p_scope text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<op>>
declare prev public.music_planning_requests; payload jsonb; result jsonb:='{}'; row jsonb; m public.music_participations; n public.music_need_periods;
 a public.music_plan_assignments; f public.music_folder_inventory; candidate jsonb; v public.musical_voices; settings public.music_event_settings;
 person public.people; ids uuid[]; event_id uuid; choice text; reservation_id uuid; version integer; cancel_preview jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_action is null or p_scope is null or p_scope not in ('event','series') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(65005);perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('action',p_action,'scope',p_scope,'id',p_id,'data',p_data);
 select * into prev from public.music_planning_requests where id=p_request;
 if found then if prev.actor_id<>auth.uid() or prev.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;return prev.result;end if;
 select array_agg(e.id order by e.id) into ids from public.events e where (p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id);
 if ids is null and not (p_action='RELEASE' and p_scope='series' and exists(select 1 from public.event_series where id=p_id)) then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.events where id=any(ids) order by id for update;
 if p_action='EVENT' then
  perform private.music_fields(p_data,array['event_id','version','repertoires']);event_id:=(p_data->>'event_id')::uuid;
  if not event_id=any(ids) or jsonb_typeof(p_data->'repertoires')<>'array' then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
  select * into settings from public.music_event_settings where music_event_settings.event_id=op.event_id;
  if coalesce(settings.version,0) is distinct from (p_data->>'version')::integer then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_data->'repertoires') r where r not in ('PRO','PMM')) or jsonb_array_length(p_data->'repertoires')<>(select count(distinct r) from jsonb_array_elements_text(p_data->'repertoires')r) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
  insert into public.music_event_settings(event_id,repertoires) values(event_id,array(select jsonb_array_elements_text(p_data->'repertoires'))) on conflict on constraint music_event_settings_pkey do update set repertoires=excluded.repertoires,version=music_event_settings.version+1;
 elsif p_action='WINDOW' then
  perform private.music_fields(p_data,array['event_id','version','from_local','until_local']);event_id:=(p_data->>'event_id')::uuid;
  if not event_id=any(ids) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
  select * into settings from public.music_event_settings where music_event_settings.event_id=op.event_id;
  if coalesce(settings.version,0) is distinct from (p_data->>'version')::integer then raise exception 'MUSIC_CHANGED' using errcode='PT409';end if;
  if private.folder_local_time(p_data->>'from_local') is null or private.folder_local_time(p_data->>'until_local') is null or not exists(select 1 from public.events e where e.id=op.event_id and private.folder_local_time(p_data->>'from_local')<=e.starts_at and private.folder_local_time(p_data->>'until_local')>=e.ends_at) then raise exception 'FOLDER_INVALID_DATE' using errcode='22023';end if;
  insert into public.music_event_settings(event_id,planned_from,planned_until) values(event_id,private.folder_local_time(p_data->>'from_local'),private.folder_local_time(p_data->>'until_local')) on conflict on constraint music_event_settings_pkey do update set planned_from=excluded.planned_from,planned_until=excluded.planned_until,version=music_event_settings.version+1;
 elsif p_action='VOICE' then
  perform private.music_fields(p_data,array['person_id','rows']);
  if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows') not between 1 and 60 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
  for row in select value from jsonb_array_elements(p_data->'rows') loop
   perform private.music_fields(row,array['event_id','version','voice_id','required']);event_id:=(row->>'event_id')::uuid;
   if not event_id=any(ids) or not exists(select 1 from public.event_participants ep where ep.event_id=op.event_id and ep.person_id=(p_data->>'person_id')::uuid and ep.active) then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
   select * into m from public.music_participations where music_participations.event_id=op.event_id and person_id=(p_data->>'person_id')::uuid;
   perform private.music_version(m.version,(row->>'version')::integer);
   if row->>'voice_id' is not null and not exists(select 1 from public.musical_voices where id=(row->>'voice_id')::uuid and not archived) then raise exception 'MUSIC_VOICE_UNAVAILABLE' using errcode='22023';end if;
   update public.music_participations set voice_id=(row->>'voice_id')::uuid,required=private.music_bool(row,'required'),version=music_participations.version+1,updated_at=clock_timestamp() where music_participations.event_id=op.event_id and person_id=(p_data->>'person_id')::uuid;
  end loop;
 elsif p_action='GAP' then
  perform private.music_fields(p_data,array['person_id','choice','previous']);
  if p_scope<>'series' or p_data->>'choice' not in ('KEEP','SPLIT') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
  select c.choice into choice from public.music_series_choices c where c.series_id=p_id and c.person_id=(p_data->>'person_id')::uuid;
  if choice is distinct from (p_data->>'previous') then raise exception 'MUSIC_CHANGED' using errcode='PT409';end if;
  insert into public.music_series_choices(series_id,person_id,choice) values(p_id,(p_data->>'person_id')::uuid,p_data->>'choice') on conflict(series_id,person_id) do update set choice=excluded.choice;
 elsif p_action='ASSIGN' then
  perform private.music_fields(p_data,array['need','folder_id','folder_version','ack']);
  select * into n from public.music_need_periods where need_key=p_data->'need'->>'need_key' and scope=p_scope and scope_id=p_id;
  if n.need_key is null or to_jsonb(n)<>p_data->'need' then raise exception 'MUSIC_CHANGED' using errcode='PT409';end if;
  if exists(select 1 from public.music_plan_assignments where need_key=n.need_key and active) then raise exception 'MUSIC_CHANGED' using errcode='PT409';end if;
  select * into person from public.people where id=n.person_id for update;
  if person.archived_at is not null then raise exception 'PERSON_ARCHIVED' using errcode='22023';end if;
  select c into candidate from private.music_folder_candidates(n.need_key) c where c->>'id'=p_data->>'folder_id';
  if candidate is null then raise exception 'FOLDER_UNAVAILABLE' using errcode='PT409';end if;
  select * into f from public.music_folder_inventory where id=(p_data->>'folder_id')::uuid;
  perform private.music_version(f.version,(p_data->>'folder_version')::integer);
  if jsonb_array_length(candidate->'warnings')>0 and not private.music_bool(p_data,'ack') then raise exception 'FOLDER_ACK_REQUIRED' using errcode='22023';end if;
  reservation_id:=null;
  if f.holder_id is distinct from n.person_id then
   reservation_id:=gen_random_uuid();
   insert into public.folder_reservations(id,folder_id,person_id,person_name,starts_at,due_at,notes,created_by,updated_by)
   values(reservation_id,f.id,n.person_id,person.full_name,n.planned_from,n.planned_until,'Preparación de actuaciones',auth.uid(),auth.uid());
   update public.music_folders set version=music_folders.version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=f.id;
   perform private.music_audit('music_folder',f.id,'MUSIC_LOAN_RESERVE',null,jsonb_build_object('id',reservation_id,'person_id',n.person_id,'starts_at',n.planned_from,'due_at',n.planned_until),p_request);
  end if;
  insert into public.music_plan_assignments(id,need_key,scope,scope_id,person_id,repertoire_code,voice_id,event_ids,starts_at,due_at,folder_id,reservation_id,owned_loan_id)
  values(gen_random_uuid(),n.need_key,n.scope,n.scope_id,n.person_id,n.repertoire_code,n.voice_id,n.event_ids,n.planned_from,n.planned_until,f.id,reservation_id,case when reservation_id is null then f.loan_id end)
  on conflict(need_key) do update set starts_at=excluded.starts_at,due_at=excluded.due_at,folder_id=excluded.folder_id,reservation_id=excluded.reservation_id,owned_loan_id=excluded.owned_loan_id,active=true,version=music_plan_assignments.version+1 returning to_jsonb(music_plan_assignments.*) into result;
 elsif p_action='RELEASE' then
  perform private.music_fields(p_data,array['id','version']);
  select * into a from public.music_plan_assignments where id=(p_data->>'id')::uuid and scope=p_scope and scope_id=p_id and active;
  if a.id is null then raise exception 'MUSIC_CHANGED' using errcode='PT409';end if;
  perform private.music_version(a.version,(p_data->>'version')::integer);
  if a.reservation_id is not null and exists(select 1 from public.folder_reservations where id=a.reservation_id and fulfilled_at is null and cancelled_at is null) then
   select r.version into version from public.folder_reservations r where id=a.reservation_id;
   select mf.version into settings.version from public.music_folders mf where mf.id=a.folder_id;
   cancel_preview:=public.preview_folder_loan('CANCEL',a.reservation_id,version,jsonb_build_object('folder_version',settings.version,'notes','Retirada de la planificación'));
   perform public.apply_folder_loan(gen_random_uuid(),cancel_preview,false,true);
  end if;
  update public.music_plan_assignments set active=false,version=music_plan_assignments.version+1 where id=a.id;
 else raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
 insert into public.music_planning_requests(id,actor_id,payload,result) values(p_request,auth.uid(),payload,result);return result;
end $$;
