-- Phase 5: individual folder reservations and physical custody. No wardrobe writes.
create table public.material_operations (
 id uuid primary key, actor_id uuid not null references public.admin_profiles(user_id),
 actor_name text not null, occurred_at timestamptz not null default clock_timestamp(),
 action text not null check(action in ('RESERVE','CANCEL','DELIVER','RETURN')),
 signature_confirmed boolean not null,
 payload jsonb not null, result jsonb not null,
 check(action not in ('DELIVER','RETURN') or signature_confirmed)
);
create table public.folder_reservations (
 id uuid primary key, folder_id uuid not null references public.music_folders(id),
 person_id uuid not null references public.people(id), person_name text not null,
 starts_at timestamptz not null, due_at timestamptz, notes text,
 cancelled_at timestamptz, fulfilled_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 created_by uuid not null references public.admin_profiles(user_id), updated_by uuid not null references public.admin_profiles(user_id),
 check(due_at is null or due_at>starts_at), check(cancelled_at is null or fulfilled_at is null),
 check(length(notes)<=2000)
);
create index folder_reservations_period on public.folder_reservations(folder_id,starts_at,due_at) where cancelled_at is null and fulfilled_at is null;
create index folder_reservations_person on public.folder_reservations(person_id,created_at desc);
create table public.folder_loans (
 id uuid primary key, person_id uuid not null references public.people(id), person_name text not null,
 reservation_id uuid unique references public.folder_reservations(id),
 opened_at timestamptz not null default clock_timestamp(), closed_at timestamptz,
 notes text check(length(notes)<=2000), version integer not null default 1 check(version>0),
 created_by uuid not null references public.admin_profiles(user_id)
);
create index folder_loans_person on public.folder_loans(person_id,opened_at desc);
create table public.folder_loan_items (
 id uuid primary key, loan_id uuid not null references public.folder_loans(id),
 folder_id uuid not null references public.music_folders(id), code text not null,
 due_at timestamptz, delivered_at timestamptz not null, returned_at timestamptz,
 check(returned_at is null or returned_at>=delivered_at), check(due_at is null or due_at>delivered_at)
);
create unique index folder_one_holder on public.folder_loan_items(folder_id) where returned_at is null;
create index folder_items_loan on public.folder_loan_items(loan_id);
create index folder_items_history on public.folder_loan_items(folder_id,delivered_at desc);
create table public.folder_loan_movements (
 id uuid primary key, loan_id uuid not null references public.folder_loans(id),
 item_id uuid not null references public.folder_loan_items(id),
 operation_id uuid not null references public.material_operations(id),
 kind text not null check(kind in ('DELIVER','RETURN')),
 occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid not null references public.admin_profiles(user_id), actor_name text not null,
 signature_confirmed boolean not null check(signature_confirmed),
 notes text check(length(notes)<=2000)
);
create index folder_movements_history on public.folder_loan_movements(loan_id,occurred_at,id);
do $$ declare t text; begin
 foreach t in array array['material_operations','folder_reservations','folder_loans','folder_loan_items','folder_loan_movements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using (private.is_admin())',t);
 end loop;
end $$;

create function private.folder_local_time(v text) returns timestamptz language plpgsql stable set search_path='' as $$
declare local_time timestamp; instant timestamptz;
begin
 if nullif(v,'') is null then return null; end if;
 if v !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'FOLDER_INVALID_DATE' using errcode='22023'; end if;
 local_time:=v::timestamp; instant:=local_time at time zone 'Europe/Madrid';
 if instant at time zone 'Europe/Madrid'<>local_time or (instant-interval '1 hour') at time zone 'Europe/Madrid'=local_time
 or (instant+interval '1 hour') at time zone 'Europe/Madrid'=local_time then raise exception 'FOLDER_INVALID_DATE' using errcode='22023'; end if;
 return instant;
end $$;

-- Read-only review is rebuilt under the shared music lock at confirmation.
create function public.preview_folder_loan(p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<review>>
declare f public.music_folder_inventory; person public.people; reservation public.folder_reservations;
 loan public.folder_loans; item public.folder_loan_items; holder record;
 folder_id uuid; person_id uuid; start_at timestamptz; due_at timestamptz; at_time timestamptz:=clock_timestamp();
 warnings jsonb:='[]'; conflicts jsonb:='[]'; upcoming jsonb:='[]'; custody jsonb; incident jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_id is null or p_action is null or p_action not in ('RESERVE','CANCEL','DELIVER','RETURN') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if p_action='RESERVE' then
 perform private.music_fields(p_data,array['folder_id','folder_version','person_id','start_local','due_local','notes']);
 select * into reservation from public.folder_reservations where id=p_id;
 perform private.music_version(reservation.version,p_version);
 if reservation.id is not null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 folder_id:=(p_data->>'folder_id')::uuid; person_id:=(p_data->>'person_id')::uuid;
 start_at:=private.folder_local_time(private.music_text(p_data,'start_local',16,true));
 due_at:=private.folder_local_time(private.music_text(p_data,'due_local',16));
 if start_at<at_time then raise exception 'FOLDER_INVALID_DATE' using errcode='22023'; end if;
 elsif p_action='DELIVER' then
 perform private.music_fields(p_data,array['folder_id','folder_version','person_id','due_local','notes','reserved']);
 if private.music_bool(p_data,'reserved') then
 select * into reservation from public.folder_reservations where id=p_id;
 if reservation.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(reservation.version,p_version);
 if reservation.cancelled_at is not null or reservation.fulfilled_at is not null then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 if reservation.folder_id<>(p_data->>'folder_id')::uuid or reservation.person_id<>(p_data->>'person_id')::uuid then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 else
 perform private.music_version(null,p_version);
 end if;
 if exists(select 1 from public.folder_loans where id=p_id) then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 folder_id:=(p_data->>'folder_id')::uuid; person_id:=(p_data->>'person_id')::uuid;
 start_at:=at_time; due_at:=private.folder_local_time(private.music_text(p_data,'due_local',16));
 elsif p_action='CANCEL' then
 perform private.music_fields(p_data,array['folder_version','notes']);
 select * into reservation from public.folder_reservations where id=p_id;
 if reservation.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(reservation.version,p_version);
 if reservation.cancelled_at is not null or reservation.fulfilled_at is not null then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 folder_id:=reservation.folder_id; person_id:=reservation.person_id;
 else
 perform private.music_fields(p_data,array['folder_version','notes','incident']);
 select * into loan from public.folder_loans where id=p_id;
 if loan.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(loan.version,p_version);
 -- Phase 5 creates one item per individual loan. Future joint operations keep item dates independent.
 select * into item from public.folder_loan_items where loan_id=p_id and returned_at is null;
 if item.id is null then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 folder_id:=item.folder_id; person_id:=loan.person_id;
 incident:=p_data->'incident';
 if incident<>'null'::jsonb then
 perform private.music_fields(incident,array['family','kind','description'],array['work_id','work_version','blocks_use']);
 if incident->>'family'='SCORE' then
 perform private.music_fields(incident,array['family','kind','description','work_id','work_version']);
 if incident->>'kind' not in ('MISSING','DAMAGED','REPLACE','REPAIR') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_version((select version from public.repertoire_works where id=(incident->>'work_id')::uuid),private.music_data_version(incident,'work_version'));
 if not exists(select 1 from public.folder_work_state where folder_work_state.folder_id=review.folder_id and work_id=(incident->>'work_id')::uuid and present) then raise exception 'MUSIC_SCORE_ABSENT' using errcode='22023'; end if;
 if exists(select 1 from public.folder_score_issues where folder_score_issues.folder_id=review.folder_id and work_id=(incident->>'work_id')::uuid and kind=incident->>'kind' and resolved_at is null) then raise exception 'FOLDER_DUPLICATE_ISSUE' using errcode='22023'; end if;
 elsif incident->>'family'='PHYSICAL' then
 perform private.music_fields(incident,array['family','kind','description','blocks_use']);
 perform private.music_bool(incident,'blocks_use');
 if incident->>'kind' not in ('ELASTICS','COVER','RINGS','REPLACE_FOLDER','OTHER') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_text(incident,'description',2000,true);
 if exists(select 1 from public.folder_physical_issues where folder_physical_issues.folder_id=review.folder_id and kind=incident->>'kind' and resolved_at is null) then raise exception 'FOLDER_DUPLICATE_ISSUE' using errcode='22023'; end if;
 else raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_text(incident,'description',2000);
 end if;
 end if;
 perform private.music_text(p_data,'notes',2000);
 select * into f from public.music_folder_inventory where id=folder_id;
 if f.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(f.version,private.music_data_version(p_data,'folder_version'));
 select * into person from public.people where id=person_id;
 if person.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 if p_action in ('DELIVER','RESERVE') then
 if not f.usable then conflicts:=conflicts||'"NOT_USABLE"'::jsonb; end if;
 if person.archived_at is not null then conflicts:=conflicts||'"PERSON_ARCHIVED"'::jsonb; end if;
 if due_at is not null and due_at<=start_at then raise exception 'FOLDER_INVALID_DATE' using errcode='22023'; end if;
 if exists(select 1 from public.folder_reservations r where r.folder_id=review.folder_id and r.id<>p_id and r.cancelled_at is null and r.fulfilled_at is null
 and tstzrange(r.starts_at,r.due_at,'[)') && tstzrange(review.start_at,review.due_at,'[)')) then
 if p_action='DELIVER' and due_at is null then warnings:=warnings||'"OPEN_ENDED_RESERVATIONS"'::jsonb;
 else conflicts:=conflicts||'"RESERVATION_OVERLAP"'::jsonb; end if;
 end if;
 select i.due_at,l.person_name,l.person_id into holder from public.folder_loan_items i join public.folder_loans l on l.id=i.loan_id where i.folder_id=review.folder_id and i.returned_at is null;
 if found then
 if p_action='DELIVER' then conflicts:=conflicts||'"IN_CUSTODY"'::jsonb;
 elsif holder.due_at is null or holder.due_at<=at_time or holder.due_at>start_at then conflicts:=conflicts||'"CUSTODY_OVERLAP"'::jsonb;
 else warnings:=warnings||'"AWAIT_RETURN"'::jsonb; end if;
 end if;
 end if;
 if f.missing_count+f.pending_add_count+f.pending_remove_count>0 then warnings:=warnings||'"REPERTOIRE_PENDING"'::jsonb; end if;
 if f.conservation_issue_count+f.physical_issue_count>0 then warnings:=warnings||'"MAINTENANCE_PENDING"'::jsonb; end if;
 select coalesce(jsonb_agg(x),'[]') into upcoming from (
 select r.id,r.version,r.person_name,r.starts_at,r.due_at from public.folder_reservations r
 where r.folder_id=review.folder_id and r.id<>p_id and r.cancelled_at is null and r.fulfilled_at is null order by r.starts_at,r.id limit 24) x;
 select jsonb_build_object('person_name',l.person_name,'due_at',i.due_at) into custody from public.folder_loan_items i join public.folder_loans l on l.id=i.loan_id where i.folder_id=review.folder_id and i.returned_at is null;
 return jsonb_build_object('action',p_action,'id',p_id,'version',p_version,'data',p_data,
 'folder_code',f.code,'voice_name',f.voice_name,'person_name',person.full_name,'person_version',person.version,
 'warnings',warnings,'conflicts',conflicts,'reservations',upcoming,'custody',custody);
end $$;

create function public.apply_folder_loan(p_request uuid,p_preview jsonb,p_signature boolean,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
<<apply_op>>
declare previous public.material_operations; payload jsonb; fresh jsonb; result jsonb; d jsonb; incident jsonb;
 action text; entity uuid; person_id uuid; folder_id uuid; folder_version integer; at_time timestamptz;
 reservation public.folder_reservations; loan public.folder_loans; item public.folder_loan_items;
 actor_name text; incident_result jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_signature is null or p_acknowledged is null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_fields(p_preview,array['action','id','version','data','folder_code','voice_name','person_name','person_version','warnings','conflicts','reservations','custody']);
 perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('preview',p_preview,'signature',p_signature,'acknowledged',p_acknowledged);
 select * into previous from public.material_operations where id=p_request;
 if found then
 if previous.actor_id<>auth.uid() or previous.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
 return previous.result; end if;
 action:=p_preview->>'action'; entity:=(p_preview->>'id')::uuid; d:=p_preview->'data';
 -- Serialize with existing person archive operations before reviewing its active state.
 person_id:=case when action in ('RESERVE','DELIVER') then (d->>'person_id')::uuid when action='CANCEL' then (select r.person_id from public.folder_reservations r where id=entity) else (select l.person_id from public.folder_loans l where id=entity) end;
 perform 1 from public.people where id=person_id for update;
 fresh:=public.preview_folder_loan(action,entity,(p_preview->>'version')::integer,d);
 if fresh<>p_preview then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 if jsonb_array_length(fresh->'conflicts')>0 then raise exception 'FOLDER_UNAVAILABLE' using errcode='PT409'; end if;
 if action in ('DELIVER','RETURN') and not p_signature then raise exception 'SIGNATURE_REQUIRED' using errcode='22023'; end if;
 if jsonb_array_length(fresh->'warnings')>0 and not p_acknowledged then raise exception 'FOLDER_ACK_REQUIRED' using errcode='22023'; end if;
 at_time:=clock_timestamp();
 select display_name into actor_name from public.admin_profiles where user_id=auth.uid();
 insert into public.material_operations(id,actor_id,actor_name,action,signature_confirmed,payload,result)
 values(p_request,auth.uid(),actor_name,action,p_signature,payload,'{}');
 if action='RESERVE' then
 folder_id:=(d->>'folder_id')::uuid;
 insert into public.folder_reservations(id,folder_id,person_id,person_name,starts_at,due_at,notes,created_by,updated_by)
 values(entity,folder_id,person_id,fresh->>'person_name',private.folder_local_time(d->>'start_local'),private.folder_local_time(d->>'due_local'),nullif(btrim(d->>'notes'),''),auth.uid(),auth.uid()) returning * into reservation;
 result:=to_jsonb(reservation);
 elsif action='CANCEL' then
 update public.folder_reservations set cancelled_at=at_time,updated_at=at_time,updated_by=auth.uid(),version=version+1 where id=entity returning * into reservation;
 folder_id:=reservation.folder_id; result:=to_jsonb(reservation);
 elsif action='DELIVER' then
 folder_id:=(d->>'folder_id')::uuid;
 insert into public.folder_loans(id,person_id,person_name,reservation_id,notes,opened_at,created_by)
 values(entity,person_id,fresh->>'person_name',case when (d->>'reserved')::boolean then entity end,nullif(btrim(d->>'notes'),''),at_time,auth.uid()) returning * into loan;
 insert into public.folder_loan_items(id,loan_id,folder_id,code,due_at,delivered_at)
 values(gen_random_uuid(),entity,folder_id,fresh->>'folder_code',private.folder_local_time(d->>'due_local'),at_time) returning * into item;
 if loan.reservation_id is not null then update public.folder_reservations set fulfilled_at=at_time,updated_at=at_time,updated_by=auth.uid(),version=version+1 where id=entity; end if;
 result:=to_jsonb(loan);
 else
 select * into item from public.folder_loan_items where loan_id=entity and returned_at is null;
 folder_id:=item.folder_id;
 update public.folder_loan_items set returned_at=at_time where id=item.id;
 update public.folder_loans set closed_at=at_time,version=version+1 where id=entity returning * into loan;
 incident:=d->'incident';
 if incident<>'null'::jsonb then
 select version into folder_version from public.music_folders where id=folder_id;
 if incident->>'family'='SCORE' then
 incident_result:=public.music_command(gen_random_uuid(),'SCORE_SAVE',gen_random_uuid(),null,
 jsonb_build_object('folder_id',folder_id,'folder_version',folder_version,'work_id',incident->'work_id','work_version',incident->'work_version','kind',incident->'kind','description',incident->'description'));
 else
 incident_result:=public.music_command(gen_random_uuid(),'PHYSICAL_SAVE',gen_random_uuid(),null,
 jsonb_build_object('folder_id',folder_id,'folder_version',folder_version,'kind',incident->'kind','description',incident->'description','blocks_use',incident->'blocks_use'));
 end if;
 end if;
 result:=to_jsonb(loan);
 end if;
 if action in ('DELIVER','RETURN') then
 insert into public.folder_loan_movements(id,loan_id,item_id,operation_id,kind,occurred_at,actor_id,actor_name,signature_confirmed,notes)
 values(gen_random_uuid(),entity,item.id,p_request,action,at_time,auth.uid(),actor_name,true,nullif(btrim(d->>'notes'),''));
 end if;
 update public.music_folders set version=version+1,updated_at=at_time,updated_by=auth.uid() where id=folder_id;
 perform private.music_audit('music_folder',folder_id,'MUSIC_LOAN_'||action,null,result,p_request);
 result:=jsonb_build_object('id',entity,'action',action,'incident',incident_result);
 update public.material_operations set result=apply_op.result where id=p_request;
 return result;
end $$;

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
 add constraint audit_log_action_check check(
 (entity_type='garment' and action in ('PRENDA_CREADA','PRENDA_EDITADA','PRENDA_ARCHIVADA','PRENDA_REACTIVADA')) or
 (entity_type='person' and action in ('PERSONA_CREADA','PERSONA_EDITADA','PERSONA_ARCHIVADA','PERSONA_REACTIVADA')) or
 (entity_type='loan' and action in ('CESION_ABIERTA','DEVOLUCION_REGISTRADA','CAMBIO_REGISTRADO','PRENDAS_MANTENIDAS')) or
 (entity_type in ('event','uniform') and action in ('UNIFORM','EVENT','CANCEL','PARTICIPANT','ASSIGN','DELIVER')) or
 (entity_type='series' and action in ('SERIES','MEMBERSHIP','ATTENDANCE','BLOCK_ASSIGN','EVENT_CREATE')) or
 (entity_type='music_voice' and action='MUSIC_VOICE_SAVE') or
 (entity_type='music_work' and action='MUSIC_WORK_SAVE') or
 (entity_type='music_folder' and action in ('MUSIC_FOLDER_SAVE','MUSIC_PRESENCE','MUSIC_SCORE_SAVE','MUSIC_SCORE_RESOLVE','MUSIC_PHYSICAL_SAVE','MUSIC_PHYSICAL_RESOLVE','MUSIC_LOAN_RESERVE','MUSIC_LOAN_CANCEL','MUSIC_LOAN_DELIVER','MUSIC_LOAN_RETURN'))
 );

create or replace view public.music_folder_inventory with(security_invoker=true) as
select f.*,v.name voice_name,v.code voice_code,v.archived voice_archived,
 not f.archived and not f.manually_blocked and coalesce(physical.blocking,0)=0 usable,
 case when f.archived then 'ARCHIVED' when f.manually_blocked or coalesce(physical.blocking,0)>0 then 'UNUSABLE' else 'USABLE' end operability,
 coalesce(physical.pending,0) physical_issue_count,coalesce(physical.blocking,0) blocking_issue_count,
 coalesce(score.pending,0) score_issue_count,coalesce(score.conservation,0) conservation_issue_count,
 coalesce(content.present_count,0) present_count,coalesce(content.missing_count,0) missing_count,
 coalesce(content.add_count,0) pending_add_count,coalesce(content.remove_count,0) pending_remove_count,
 custody.loan_id, custody.person_id holder_id, custody.person_name holder_name, custody.due_at holder_due_at,
 next_reservation.id next_reservation_id, next_reservation.person_name next_assignee, next_reservation.starts_at next_reserved_from
from public.music_folders f join public.musical_voices v on v.id=f.voice_id
left join (select folder_id,count(*) pending,count(*) filter(where blocks_use) blocking
 from public.folder_physical_issues where resolved_at is null group by folder_id) physical on physical.folder_id=f.id
left join (select folder_id,count(*) pending,count(*) filter(where kind<>'MISSING') conservation
 from public.folder_score_issues where resolved_at is null group by folder_id) score on score.folder_id=f.id
left join (select folder_id,count(*) filter(where present) present_count,
 count(*) filter(where state='MISSING') missing_count,count(*) filter(where state='PENDING_ADD') add_count,
 count(*) filter(where state='PENDING_REMOVE') remove_count from public.folder_work_state group by folder_id) content on content.folder_id=f.id
left join (select i.folder_id,i.loan_id,l.person_id,l.person_name,i.due_at from public.folder_loan_items i join public.folder_loans l on l.id=i.loan_id where i.returned_at is null) custody on custody.folder_id=f.id
left join lateral(select r.id,r.person_name,r.starts_at from public.folder_reservations r where r.folder_id=f.id and r.cancelled_at is null and r.fulfilled_at is null order by r.starts_at,r.id limit 1) next_reservation on true;

create view public.folder_loan_overview with(security_invoker=true) as
with records as (
 select r.id,r.person_id,r.person_name,r.folder_id,r.starts_at,r.due_at,null::timestamptz delivered_at,null::timestamptz returned_at,
 r.cancelled_at, r.notes,r.version,r.created_at,case when r.cancelled_at is null then 'RESERVED' else 'CANCELLED' end status
 from public.folder_reservations r where r.fulfilled_at is null
 union all
 select l.id,l.person_id,l.person_name,i.folder_id,coalesce(r.starts_at,i.delivered_at),i.due_at,i.delivered_at,i.returned_at,
 null::timestamptz,l.notes,l.version,l.opened_at,case when i.returned_at is null then 'ACTIVE' else 'RETURNED' end
 from public.folder_loans l join public.folder_loan_items i on i.loan_id=l.id left join public.folder_reservations r on r.id=l.reservation_id
)
select x.*,f.code folder_code,f.voice_name,f.repertoire_code,f.version folder_version,f.usable,
 (x.status='ACTIVE' and x.due_at<now()) overdue,
 case when x.status='RESERVED' then
 not f.usable or p.archived_at is not null or (f.loan_id is not null and (f.holder_due_at is null or f.holder_due_at<=now() or f.holder_due_at>x.starts_at))
 when x.status='ACTIVE' then exists(select 1 from public.folder_reservations r where r.folder_id=x.folder_id and r.cancelled_at is null and r.fulfilled_at is null and (x.due_at is null or x.due_at<=now() or r.starts_at<x.due_at))
 else false end conflict,
 (x.status='RESERVED' and f.loan_id is not null) awaiting_return
from records x join public.music_folder_inventory f on f.id=x.folder_id join public.people p on p.id=x.person_id;
revoke all on public.folder_loan_overview from public,anon,authenticated;
grant select on public.folder_loan_overview to authenticated;

create function private.prevent_folder_custody_archive() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='people' then
 if new.archived_at is not null and old.archived_at is null and exists(select 1 from public.folder_loans l join public.folder_loan_items i on i.loan_id=l.id where l.person_id=new.id and i.returned_at is null) then
 raise exception 'PERSON_IN_CUSTODY' using errcode='PT409'; end if;
 elsif new.archived and not old.archived and exists(select 1 from public.folder_loan_items where folder_id=new.id and returned_at is null) then
 raise exception 'FOLDER_IN_CUSTODY' using errcode='PT409'; end if;
 return new;
end $$;
create trigger person_folder_custody_archive before update on public.people for each row execute function private.prevent_folder_custody_archive();
create trigger folder_custody_archive before update on public.music_folders for each row execute function private.prevent_folder_custody_archive();
revoke all on function private.folder_local_time(text),private.prevent_folder_custody_archive() from public,anon,authenticated;
revoke all on function public.preview_folder_loan(text,uuid,integer,jsonb),public.apply_folder_loan(uuid,jsonb,boolean,boolean) from public,anon;
grant execute on function public.preview_folder_loan(text,uuid,integer,jsonb),public.apply_folder_loan(uuid,jsonb,boolean,boolean) to authenticated;
