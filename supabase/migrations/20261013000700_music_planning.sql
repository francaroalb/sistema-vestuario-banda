-- Music planning remains independent of wardrobe blocks and physical custody.
create table public.music_event_settings (
 event_id uuid primary key references public.events(id) on delete cascade, repertoires text[] not null default '{}', planned_from timestamptz, planned_until timestamptz, version integer not null default 1,
 check(repertoires <@ array['PRO','PMM']::text[] and cardinality(repertoires)<=2)
);
create table public.music_participations (
 event_id uuid not null, person_id uuid not null, voice_id uuid references public.musical_voices(id), required boolean not null,
 version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(event_id,person_id), foreign key(event_id,person_id) references public.event_participants(event_id,person_id) on delete cascade
);
create index music_participation_history on public.music_participations(person_id,updated_at desc) where voice_id is not null;
create table public.music_series_choices (
 series_id uuid references public.event_series(id) on delete cascade, person_id uuid references public.people(id) on delete cascade, choice text not null check(choice in ('KEEP','SPLIT')),
 primary key(series_id,person_id)
);
create table public.music_plan_assignments (
 id uuid primary key, need_key text not null unique, scope text not null check(scope in ('event','series')), scope_id uuid not null,
 person_id uuid not null references public.people(id), repertoire_code text not null references public.music_repertoires(code), voice_id uuid not null references public.musical_voices(id),
 event_ids uuid[] not null, starts_at timestamptz not null, due_at timestamptz not null,
 folder_id uuid not null references public.music_folders(id), reservation_id uuid references public.folder_reservations(id), owned_loan_id uuid references public.folder_loans(id),
 active boolean not null default true, version integer not null default 1, check(starts_at<due_at),
 check((reservation_id is null)<>(owned_loan_id is null))
);
create index music_plan_scope on public.music_plan_assignments(scope,scope_id) where active;
create table public.music_planning_requests (
 id uuid primary key, actor_id uuid not null references public.admin_profiles(user_id), payload jsonb not null,result jsonb not null,
 occurred_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['music_event_settings','music_participations','music_series_choices','music_plan_assignments','music_planning_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using(private.is_admin())',t);
 end loop;
end $$;
create function private.music_participation_default() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.music_participations(event_id,person_id,required) select new.event_id,new.person_id,kind='REFUERZO' from public.people where id=new.person_id on conflict do nothing;
 return new;
end $$;
revoke all on function private.music_participation_default() from public,anon,authenticated;
create trigger music_participation_default after insert on public.event_participants for each row execute function private.music_participation_default();
insert into public.music_participations(event_id,person_id,required) select ep.event_id,ep.person_id,p.kind='REFUERZO' from public.event_participants ep join public.people p on p.id=ep.person_id;

create view public.music_need_periods with(security_invoker=true) as
with needs as (
 select case when e.series_id is null then 'event' else 'series' end scope,coalesce(e.series_id,e.id) scope_id,
 e.id event_id,e.starts_at, (coalesce(settings.planned_from,e.starts_at)<=e.starts_at and coalesce(settings.planned_until,e.ends_at)>=e.ends_at) window_valid,coalesce(settings.planned_from,e.starts_at) planned_from,coalesce(settings.planned_until,e.ends_at) planned_until,e.series_id,ep.person_id,p.full_name,m.voice_id,v.name voice_name,rep.code repertoire_code,c.choice,
 case when c.choice='SPLIT' then (select count(*) from public.events gap where gap.series_id=e.series_id and not gap.cancelled and (gap.starts_at,gap.id)<(e.starts_at,e.id)
  and not exists(select 1 from public.event_participants gp where gp.event_id=gap.id and gp.person_id=ep.person_id and gp.active)) else 0 end segment
 from public.events e join public.event_participants ep on ep.event_id=e.id and ep.active
 join public.people p on p.id=ep.person_id join public.music_participations m on m.event_id=e.id and m.person_id=ep.person_id and m.required
 join public.music_event_settings settings on settings.event_id=e.id cross join lateral unnest(settings.repertoires) rep(code)
 left join public.musical_voices v on v.id=m.voice_id left join public.music_series_choices c on c.series_id=e.series_id and c.person_id=ep.person_id
 where not e.cancelled
), periods as (
 select scope,scope_id,person_id,full_name,voice_id,voice_name,repertoire_code,choice,segment,
 array_agg(event_id order by starts_at,event_id) event_ids,min(planned_from) planned_from,max(planned_until) planned_until,
 bool_and(window_valid) window_valid,min(starts_at) first_event,max(starts_at) last_event
 from needs group by scope,scope_id,person_id,full_name,voice_id,voice_name,repertoire_code,choice,segment
)
select md5(scope||scope_id::text||person_id::text||coalesce(voice_id::text,'?')||repertoire_code||array_to_string(event_ids,',')) need_key,periods.*,
 (scope='series' and exists(select 1 from public.events e where e.series_id=scope_id and not e.cancelled and e.starts_at between first_event and last_event
 and not exists(select 1 from public.event_participants ep where ep.event_id=e.id and ep.person_id=periods.person_id and ep.active))) has_gap
from periods;
grant select on public.music_need_periods to authenticated;

create view public.music_preparation with(security_invoker=true) as
select n.*,a.id assignment_id,a.version assignment_version,a.folder_id,f.code folder_code,a.reservation_id,a.owned_loan_id,
 coalesce(a.owned_loan_id,l.id) loan_id,f.holder_name,f.holder_due_at,
 (f.holder_id=n.person_id and f.holder_due_at<n.planned_until) own_due_warning,
 case when n.voice_id is null then 'VOICE_PENDING'
 when n.has_gap and n.choice is null then 'GAP_PENDING'
 when not n.window_valid or exists(select 1 from public.people where id=n.person_id and archived_at is not null) or exists(select 1 from public.musical_voices where id=n.voice_id and archived) then 'CONFLICT'
 when a.id is null then 'UNASSIGNED'
 when a.starts_at<>n.planned_from or a.due_at<>n.planned_until or not f.usable then 'CONFLICT'
 when r.cancelled_at is not null then 'CONFLICT'
 when a.owned_loan_id is not null and owned_item.returned_at is not null then 'CONFLICT'
 when l.id is not null and l.closed_at is not null then 'RETURNED'
 when (a.owned_loan_id is not null or l.id is not null) and f.holder_id=n.person_id then 'HELD'
 when r.fulfilled_at is not null then 'CONFLICT'
 when f.loan_id is not null and (f.holder_due_at is null or f.holder_due_at<=now() or f.holder_due_at>n.planned_from) then 'CONFLICT'
 when f.loan_id is not null then 'AWAIT_RETURN'
 else 'ASSIGNED' end status,
 (f.missing_count+f.pending_add_count+f.pending_remove_count+f.physical_issue_count+f.score_issue_count) maintenance_count
from public.music_need_periods n left join public.music_plan_assignments a on a.need_key=n.need_key and a.active
left join public.music_folder_inventory f on f.id=a.folder_id left join public.folder_reservations r on r.id=a.reservation_id
left join public.folder_loans l on l.reservation_id=r.id
left join public.folder_loan_items owned_item on owned_item.loan_id=a.owned_loan_id and owned_item.folder_id=a.folder_id;
grant select on public.music_preparation to authenticated;

create function public.music_voice_suggestion(p_person uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select jsonb_build_object('id',v.id,'name',v.name) into result from public.music_participations m join public.musical_voices v on v.id=m.voice_id and not v.archived
 where m.person_id=p_person order by m.updated_at desc,m.event_id limit 1;return result;
end $$;

create function public.music_planning_detail(p_scope text,p_id uuid,p_page integer default 1,p_person uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; paged_ids uuid[];begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('event','series') or p_page is null or p_page<1 or p_page>10000 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if (p_scope='event' and not exists(select 1 from public.events where id=p_id)) or (p_scope='series' and not exists(select 1 from public.event_series where id=p_id)) then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 select coalesce(array_agg(id),'{}') into paged_ids from (select p.id from public.people p where (p_person is null or p.id=p_person) and exists(select 1 from public.event_participants ep join public.events e on e.id=ep.event_id where ep.person_id=p.id and ep.active and not e.cancelled and ((p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id))) order by p.full_name,p.id limit 24 offset (p_page-1)*24)x;
 select jsonb_build_object(
 'title',case when p_scope='event' then (select title from public.events where id=p_id) else (select name from public.event_series where id=p_id) end,
 'series_id',case when p_scope='event' then (select series_id from public.events where id=p_id) end,
 'events',(select coalesce(jsonb_agg(x order by x.starts_at,x.id),'[]') from (select e.id,e.title,e.starts_at,coalesce(s.planned_from,e.starts_at) planned_from,coalesce(s.planned_until,e.ends_at) planned_until,e.cancelled,coalesce(s.repertoires,'{}') repertoires,coalesce(s.version,0) version from public.events e left join public.music_event_settings s on s.event_id=e.id where (p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id))x),
 'people',(select coalesce(jsonb_agg(x order by x.full_name,x.id),'[]') from (select p.id,p.full_name,p.instrument,p.kind from public.people p where p.id=any(paged_ids))x),
 'count',(select count(distinct ep.person_id) from public.event_participants ep join public.events e on e.id=ep.event_id where ep.active and not e.cancelled and ((p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id))),
 'participations',(select coalesce(jsonb_agg(x order by x.event_id,x.person_id),'[]') from (select m.*,v.name voice_name from public.music_participations m join public.events e on e.id=m.event_id join public.event_participants ep on ep.event_id=m.event_id and ep.person_id=m.person_id and ep.active left join public.musical_voices v on v.id=m.voice_id where ((p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id)) and m.person_id=any(paged_ids))x),
 'needs',(select coalesce(jsonb_agg(n order by full_name,repertoire_code,planned_from),'[]') from public.music_preparation n where scope=p_scope and scope_id=p_id and n.person_id=any(paged_ids)),
 'stale',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('folder_code',f.code,'person_name',p.full_name)),'[]') from public.music_plan_assignments a join public.music_folders f on f.id=a.folder_id join public.people p on p.id=a.person_id where a.active and a.scope=p_scope and a.scope_id=p_id and not exists(select 1 from public.music_need_periods n where n.need_key=a.need_key)),
 'choices',(select coalesce(jsonb_agg(c),'[]') from public.music_series_choices c where p_scope='series' and c.series_id=p_id and c.person_id=any(paged_ids))
 ) into result;return result;
end $$;

create function private.music_folder_candidates(p_key text) returns setof jsonb language sql stable set search_path='' as $$
 select to_jsonb(f)||jsonb_build_object('warnings',
 (case when f.holder_id is not null and f.holder_id<>n.person_id then '["AWAIT_RETURN"]'::jsonb else '[]'::jsonb end)||
 (case when f.holder_id=n.person_id and f.holder_due_at<n.planned_until then '["OWN_DUE"]'::jsonb else '[]'::jsonb end)||
 (case when f.missing_count+f.pending_add_count+f.pending_remove_count>0 then '["REPERTOIRE_PENDING"]'::jsonb else '[]'::jsonb end)||
 (case when f.physical_issue_count+f.score_issue_count>0 then '["MAINTENANCE_PENDING"]'::jsonb else '[]'::jsonb end))
 from public.music_need_periods n join public.music_folder_inventory f on f.voice_id=n.voice_id and f.repertoire_code=n.repertoire_code and f.usable
 join public.musical_voices v on v.id=n.voice_id and not v.archived
 where n.need_key=p_key and n.window_valid and not exists(select 1 from public.people where id=n.person_id and archived_at is not null) and n.planned_until>now() and not(n.has_gap and n.choice is null)
 and (f.holder_id is null or f.holder_id=n.person_id or (f.holder_due_at>now() and f.holder_due_at<=n.planned_from))
 and not exists(select 1 from public.music_plan_assignments a where a.active and a.folder_id=f.id and a.person_id<>n.person_id and tstzrange(a.starts_at,a.due_at,'[)')&&tstzrange(n.planned_from,n.planned_until,'[)'))
 and not exists(select 1 from public.folder_reservations r where r.folder_id=f.id and r.cancelled_at is null and r.fulfilled_at is null and tstzrange(r.starts_at,r.due_at,'[)')&&tstzrange(n.planned_from,n.planned_until,'[)'))
 order by (f.holder_id is not null and f.holder_id<>n.person_id),
 (f.missing_count+f.pending_add_count+f.pending_remove_count>0), (f.physical_issue_count+f.score_issue_count>0),
 f.missing_count+f.pending_add_count+f.pending_remove_count+f.physical_issue_count+f.score_issue_count,f.code,f.id;
$$;
revoke all on function private.music_folder_candidates(text) from public,anon,authenticated;
create function public.recommend_music_folders(p_key text,p_page integer default 1,p_q text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.music_need_periods; result jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_page is null or p_page<1 or p_page>10000 or length(p_q)>60 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 select * into n from public.music_need_periods where need_key=p_key;
 if n.need_key is null then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 with candidates as materialized (select c,row_number() over() ord from private.music_folder_candidates(p_key) c where position(lower(coalesce(p_q,'')) in lower(c->>'code'))>0)
 select jsonb_build_object('need',to_jsonb(n),'count',(select count(*) from candidates),'rows',coalesce(jsonb_agg(c order by ord),'[]')) into result
 from (select * from candidates order by ord limit 24 offset (p_page-1)*24)x;
 return result;
end $$;

create function public.music_planning_command(p_request uuid,p_action text,p_scope text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if ids is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
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
revoke all on function public.music_voice_suggestion(uuid),public.music_planning_detail(text,uuid,integer,uuid),public.recommend_music_folders(text,integer,text),public.music_planning_command(uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function public.music_voice_suggestion(uuid),public.music_planning_detail(text,uuid,integer,uuid),public.recommend_music_folders(text,integer,text),public.music_planning_command(uuid,text,text,uuid,jsonb) to authenticated;

create function public.plan_music_participant(p_request uuid,p_scope text,p_id uuid,p_version integer,p_data jsonb,p_voice uuid,p_apply_voice boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare prev public.music_planning_requests; payload jsonb; result jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_request is null or p_scope is null or p_scope not in ('event','series') or p_apply_voice is null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
 perform pg_advisory_xact_lock(65005);perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('action','PARTICIPANT','scope',p_scope,'id',p_id,'version',p_version,'data',p_data,'voice',p_voice,'apply_voice',p_apply_voice);
 select * into prev from public.music_planning_requests where id=p_request;
 if found then if prev.actor_id<>auth.uid() or prev.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409';end if;return prev.result;end if;
 if p_voice is not null and not exists(select 1 from public.musical_voices where id=p_voice and not archived) then raise exception 'MUSIC_VOICE_UNAVAILABLE' using errcode='22023';end if;
 if p_scope='event' then
  if p_data->>'active' is distinct from 'true' then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
  result:=public.plan_event(p_request,'PARTICIPANT',p_id,p_version,p_data);
 else result:=public.plan_series(p_request,'ATTENDANCE',p_id,p_version,p_data);end if;
 if p_apply_voice then
  update public.music_participations m set voice_id=p_voice,version=m.version+1,updated_at=clock_timestamp()
  where m.person_id=(p_data->>'person_id')::uuid and exists(select 1 from public.event_participants ep join public.events e on e.id=ep.event_id where ep.event_id=m.event_id and ep.person_id=m.person_id and ep.active and ((p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id and e.id in(select value::uuid from jsonb_array_elements_text(p_data->'event_ids')))));
 end if;
 insert into public.music_planning_requests(id,actor_id,payload,result) values(p_request,auth.uid(),payload,result);return result;
end $$;
revoke all on function public.plan_music_participant(uuid,text,uuid,integer,jsonb,uuid,boolean) from public,anon;
grant execute on function public.plan_music_participant(uuid,text,uuid,integer,jsonb,uuid,boolean) to authenticated;

create function public.music_planning_alerts(p_event uuid default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_page is null or p_page<1 or p_page>10000 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023';end if;
 with alerts as (
 select scope,scope_id,status,maintenance_count,own_due_warning from public.music_preparation where planned_until>now() and (p_event is null or p_event=any(event_ids))
 union all select scope,scope_id,'STALE',0,false from public.music_plan_assignments a where active and due_at>now() and (p_event is null or p_event=any(event_ids)) and not exists(select 1 from public.music_need_periods n where n.need_key=a.need_key)
 ), groups as (
 select scope,scope_id,count(*) filter(where status in ('VOICE_PENDING','GAP_PENDING','UNASSIGNED')) pending,
 count(*) filter(where status in ('CONFLICT','STALE','RETURNED')) conflicts,
 count(*) filter(where status='AWAIT_RETURN' or own_due_warning or coalesce(maintenance_count,0)>0) warnings
 from alerts group by scope,scope_id
 ), rows as (
 select g.*,coalesce(e.title,s.name) title from groups g left join public.events e on g.scope='event' and e.id=g.scope_id left join public.event_series s on g.scope='series' and s.id=g.scope_id
 where pending+conflicts+warnings>0
 )
 select jsonb_build_object('pending',coalesce((select sum(pending) from rows),0),'conflicts',coalesce((select sum(conflicts) from rows),0),'warnings',coalesce((select sum(warnings) from rows),0),
 'count',(select count(*) from rows),'rows',coalesce((select jsonb_agg(r) from (select * from rows order by conflicts desc,pending desc,title,scope_id limit 24 offset (p_page-1)*24)r),'[]')) into result;return result;
end $$;
revoke all on function public.music_planning_alerts(uuid,integer) from public,anon;
grant execute on function public.music_planning_alerts(uuid,integer) to authenticated;

-- A folder already held can be reused without a second delivery. Its planned
-- use must still prevent reservations for other people, including manual ones.
create function private.music_reserved_use_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(65013);
 if new.cancelled_at is null and new.fulfilled_at is null and exists(
 select 1 from public.music_plan_assignments a where a.active and a.folder_id=new.folder_id and a.person_id<>new.person_id
 and tstzrange(a.starts_at,a.due_at,'[)')&&tstzrange(new.starts_at,new.due_at,'[)')) then
 raise exception 'FOLDER_UNAVAILABLE' using errcode='PT409';end if;
 return new;
end $$;
revoke all on function private.music_reserved_use_guard() from public,anon,authenticated;
create trigger music_reserved_use_guard before insert or update on public.folder_reservations for each row execute function private.music_reserved_use_guard();
