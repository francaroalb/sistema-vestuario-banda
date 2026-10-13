-- Carpetas · phase 1. Specialized models; no wardrobe movements or UI changes.
create table public.music_repertoires (
 code text primary key check(code in ('PRO','PMM')),
 name text not null,
 revision integer not null default 0 check(revision>=0)
);
insert into public.music_repertoires(code,name) values
 ('PRO','Marchas de procesión'),('PMM','Pasodobles y marchas militares');

create table public.musical_voices (
 id uuid primary key,
 code text not null unique check(code ~ '^[A-Z][A-Z0-9]{0,11}$'),
 name text not null check(length(btrim(name)) between 1 and 120),
 instrument text check(length(instrument)<=80),
 archived boolean not null default false,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.admin_profiles(user_id),
 updated_by uuid not null references public.admin_profiles(user_id)
);
create index musical_voices_active on public.musical_voices(archived,name,id);
-- Optional per-performance voice; no inferred values, selector arrives in phase 7.
alter table public.event_participants add column voice_id uuid references public.musical_voices(id) on delete restrict;
create index event_participants_voice on public.event_participants(voice_id) where voice_id is not null;

create table public.repertoire_works (
 id uuid primary key,
 repertoire_code text not null references public.music_repertoires(code),
 title text not null check(length(btrim(title)) between 1 and 200),
 author text check(length(author)<=160),
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.admin_profiles(user_id),
 updated_by uuid not null references public.admin_profiles(user_id),
 unique(id,repertoire_code)
);
create index repertoire_works_catalog on public.repertoire_works(repertoire_code,active,title,id);
create table public.repertoire_work_periods (
 work_id uuid not null references public.repertoire_works(id) on delete restrict,
 from_revision integer not null check(from_revision>0),
 until_revision integer check(until_revision>from_revision),
 opened_at timestamptz not null default now(), closed_at timestamptz,
 opened_by uuid not null references public.admin_profiles(user_id),
 closed_by uuid references public.admin_profiles(user_id),
 primary key(work_id,from_revision),
 check((until_revision is null)=(closed_at is null) and (until_revision is null)=(closed_by is null))
);
create unique index repertoire_work_open_period on public.repertoire_work_periods(work_id) where until_revision is null;

create table public.music_folders (
 id uuid primary key,
 code text not null unique check(code ~ '^(PRO|PMM)-[A-Z][A-Z0-9]{0,11}-[0-9]{1,6}$'),
 repertoire_code text not null references public.music_repertoires(code),
 voice_id uuid not null references public.musical_voices(id) on delete restrict,
 baseline_revision integer not null check(baseline_revision>=0),
 manually_blocked boolean not null default false,
 archived boolean not null default false,
 notes text check(length(notes)<=2000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.admin_profiles(user_id),
 updated_by uuid not null references public.admin_profiles(user_id),
 unique(id,repertoire_code)
);
create index music_folders_catalog on public.music_folders(repertoire_code,voice_id,archived,code);
create index music_folders_voice on public.music_folders(voice_id);

create table public.music_requests (
 id uuid primary key,
 actor_id uuid not null references public.admin_profiles(user_id),
 occurred_at timestamptz not null default now(),
 payload jsonb not null, result jsonb not null
);
create table public.folder_work_presence (
 folder_id uuid not null, work_id uuid not null, repertoire_code text not null,
 present boolean not null,
 absence_reason text check(absence_reason in ('MISSING','REMOVED')),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.admin_profiles(user_id),
 primary key(folder_id,work_id),
 foreign key(folder_id,repertoire_code) references public.music_folders(id,repertoire_code) on delete restrict,
 foreign key(work_id,repertoire_code) references public.repertoire_works(id,repertoire_code) on delete restrict,
 check((present and absence_reason is null) or (not present and absence_reason is not null))
);
create index folder_work_presence_work on public.folder_work_presence(work_id,folder_id);
create table public.folder_work_movements (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.music_requests(id),
 folder_id uuid not null, work_id uuid not null, repertoire_code text not null,
 action text not null check(action in ('INCORPORATE','REMOVE','MISSING','RECOVER','REPLACE','CONFIRM_ABSENT')),
 before_present boolean not null, after_present boolean not null,
 notes text check(length(notes)<=2000),
 occurred_at timestamptz not null default now(),
 actor_id uuid not null references public.admin_profiles(user_id),
 foreign key(folder_id,repertoire_code) references public.music_folders(id,repertoire_code) on delete restrict,
 foreign key(work_id,repertoire_code) references public.repertoire_works(id,repertoire_code) on delete restrict
);
create index folder_work_movements_history on public.folder_work_movements(folder_id,occurred_at desc,id);
create index folder_work_movements_work on public.folder_work_movements(work_id,occurred_at desc);
create index folder_work_movements_request on public.folder_work_movements(request_id);

create table public.folder_score_issues (
 id uuid primary key,
 folder_id uuid not null, work_id uuid not null, repertoire_code text not null,
 kind text not null check(kind in ('MISSING','DAMAGED','REPLACE','REPAIR')),
 description text check(length(description)<=2000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.admin_profiles(user_id),
 updated_by uuid not null references public.admin_profiles(user_id),
 resolved_at timestamptz, resolved_by uuid references public.admin_profiles(user_id),
 resolution text check(length(resolution)<=2000),
 foreign key(folder_id,repertoire_code) references public.music_folders(id,repertoire_code) on delete restrict,
 foreign key(work_id,repertoire_code) references public.repertoire_works(id,repertoire_code) on delete restrict,
 check((resolved_at is null)=(resolved_by is null)),
 check(resolved_at is null or resolved_at>=created_at),
 check(resolved_at is not null or resolution is null)
);
create unique index folder_score_issues_open on public.folder_score_issues(folder_id,work_id,kind) where resolved_at is null;
create index folder_score_issues_work on public.folder_score_issues(work_id,resolved_at,folder_id);
create index folder_score_issues_history on public.folder_score_issues(folder_id,created_at desc,id);
create table public.folder_physical_issues (
 id uuid primary key,
 folder_id uuid not null references public.music_folders(id) on delete restrict,
 kind text not null check(kind in ('ELASTICS','COVER','RINGS','REPLACE_FOLDER','OTHER')),
 description text not null check(length(btrim(description)) between 1 and 2000),
 blocks_use boolean not null default false,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.admin_profiles(user_id),
 updated_by uuid not null references public.admin_profiles(user_id),
 resolved_at timestamptz, resolved_by uuid references public.admin_profiles(user_id),
 resolution text check(length(resolution)<=2000),
 check((resolved_at is null)=(resolved_by is null)),
 check(resolved_at is null or resolved_at>=created_at),
 check(resolved_at is not null or resolution is null)
);
create unique index folder_physical_issues_open on public.folder_physical_issues(folder_id,kind) where resolved_at is null;
create index folder_physical_issues_blocks on public.folder_physical_issues(folder_id) where resolved_at is null and blocks_use;
create index folder_physical_issues_history on public.folder_physical_issues(folder_id,created_at desc,id);

do $$ declare tab text; begin
 foreach tab in array array['music_repertoires','musical_voices','repertoire_works','repertoire_work_periods',
 'music_folders','music_requests','folder_work_presence','folder_work_movements','folder_score_issues','folder_physical_issues'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('grant all on public.%I to service_role',tab);
 execute format('create policy "Admins read music" on public.%I for select to authenticated using((select private.is_admin()))',tab);
 end loop;
end $$;

-- Preserve every existing audit action while adding typed foreign keys for this module.
alter table public.audit_log drop constraint audit_log_entity_type_check;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
 add column music_folder_id uuid generated always as(case when entity_type='music_folder' then entity_id end) stored references public.music_folders(id),
 add column music_voice_id uuid generated always as(case when entity_type='music_voice' then entity_id end) stored references public.musical_voices(id),
 add column music_work_id uuid generated always as(case when entity_type='music_work' then entity_id end) stored references public.repertoire_works(id),
 add constraint audit_log_entity_type_check check(entity_type in ('garment','person','loan','event','uniform','series','music_folder','music_voice','music_work')),
 add constraint audit_log_action_check check(
 (entity_type='garment' and action in ('PRENDA_CREADA','PRENDA_EDITADA','PRENDA_ARCHIVADA','PRENDA_REACTIVADA')) or
 (entity_type='person' and action in ('PERSONA_CREADA','PERSONA_EDITADA','PERSONA_ARCHIVADA','PERSONA_REACTIVADA')) or
 (entity_type='loan' and action in ('CESION_ABIERTA','DEVOLUCION_REGISTRADA','CAMBIO_REGISTRADO','PRENDAS_MANTENIDAS')) or
 (entity_type in ('event','uniform') and action in ('UNIFORM','EVENT','CANCEL','PARTICIPANT','ASSIGN','DELIVER')) or
 (entity_type='series' and action in ('SERIES','MEMBERSHIP','ATTENDANCE','BLOCK_ASSIGN','EVENT_CREATE')) or
 (entity_type='music_voice' and action='MUSIC_VOICE_SAVE') or
 (entity_type='music_work' and action='MUSIC_WORK_SAVE') or
 (entity_type='music_folder' and action in ('MUSIC_FOLDER_SAVE','MUSIC_PRESENCE','MUSIC_SCORE_SAVE','MUSIC_SCORE_RESOLVE','MUSIC_PHYSICAL_SAVE','MUSIC_PHYSICAL_RESOLVE'))
 );
create index audit_log_music_folder on public.audit_log(music_folder_id,occurred_at desc,id) where music_folder_id is not null;
create index audit_log_music_voice on public.audit_log(music_voice_id) where music_voice_id is not null;
create index audit_log_music_work on public.audit_log(music_work_id) where music_work_id is not null;

-- Presence is derived from the historical catalog baseline, overridden only by explicit facts.
create view public.folder_work_state with(security_invoker=true) as
select x.*,
 case when not active then case when present then 'PENDING_REMOVE' else 'ABSENT_RETIRED' end
 when present then 'PRESENT' when absence_reason='MISSING' then 'MISSING' else 'PENDING_ADD' end as state
from (
 select f.id folder_id,w.id work_id,f.repertoire_code,w.title,w.author,w.active,
 w.version work_version,f.version folder_version,
 coalesce(p.present,exists(select 1 from public.repertoire_work_periods period
 where period.work_id=w.id and period.from_revision<=f.baseline_revision
 and (period.until_revision is null or f.baseline_revision<period.until_revision))) present,
 p.absence_reason, (p.folder_id is null) presumed
 from public.music_folders f join public.repertoire_works w on w.repertoire_code=f.repertoire_code
 left join public.folder_work_presence p on p.folder_id=f.id and p.work_id=w.id
) x;

create view public.music_folder_inventory with(security_invoker=true) as
select f.*,v.name voice_name,v.code voice_code,v.archived voice_archived,
 not f.archived and not f.manually_blocked and coalesce(physical.blocking,0)=0 usable,
 case when f.archived then 'ARCHIVED' when f.manually_blocked or coalesce(physical.blocking,0)>0 then 'UNUSABLE' else 'USABLE' end operability,
 coalesce(physical.pending,0) physical_issue_count,coalesce(physical.blocking,0) blocking_issue_count,
 coalesce(score.pending,0) score_issue_count,coalesce(score.conservation,0) conservation_issue_count,
 coalesce(content.present_count,0) present_count,coalesce(content.missing_count,0) missing_count,
 coalesce(content.add_count,0) pending_add_count,coalesce(content.remove_count,0) pending_remove_count
from public.music_folders f join public.musical_voices v on v.id=f.voice_id
left join (select folder_id,count(*) pending,count(*) filter(where blocks_use) blocking
 from public.folder_physical_issues where resolved_at is null group by folder_id) physical on physical.folder_id=f.id
left join (select folder_id,count(*) pending,count(*) filter(where kind<>'MISSING') conservation
 from public.folder_score_issues where resolved_at is null group by folder_id) score on score.folder_id=f.id
left join (select folder_id,count(*) filter(where present) present_count,
 count(*) filter(where state='MISSING') missing_count,count(*) filter(where state='PENDING_ADD') add_count,
 count(*) filter(where state='PENDING_REMOVE') remove_count from public.folder_work_state group by folder_id) content on content.folder_id=f.id;

create view public.music_maintenance_tasks with(security_invoker=true) as
select 'presence:'||s.folder_id::text||':'||s.work_id::text task_id,'REPERTOIRE'::text category,
 s.state kind,s.folder_id,s.work_id,i.id issue_id,s.repertoire_code,s.title,
 i.description,false blocks_use,i.created_at,i.resolved_at,i.version issue_version
from public.folder_work_state s left join public.folder_score_issues i
 on i.folder_id=s.folder_id and i.work_id=s.work_id and i.kind='MISSING' and i.resolved_at is null
where s.state in ('PENDING_ADD','PENDING_REMOVE','MISSING')
union all
select 'score:'||i.id::text,case when i.kind='MISSING' then 'REPERTOIRE' else 'CONSERVATION' end,
 i.kind,i.folder_id,i.work_id,i.id,i.repertoire_code,w.title,i.description,false,i.created_at,i.resolved_at,i.version
from public.folder_score_issues i join public.repertoire_works w on w.id=i.work_id
join public.folder_work_state s on s.folder_id=i.folder_id and s.work_id=i.work_id
where i.resolved_at is null and (i.kind<>'MISSING' or s.state<>'MISSING')
union all
select 'physical:'||i.id::text,'CONSERVATION',i.kind,i.folder_id,null::uuid,i.id,f.repertoire_code,
 null::text,i.description,i.blocks_use,i.created_at,i.resolved_at,i.version
from public.folder_physical_issues i join public.music_folders f on f.id=i.folder_id where i.resolved_at is null;

revoke all on public.folder_work_state,public.music_folder_inventory,public.music_maintenance_tasks from public,anon,authenticated;
grant select on public.folder_work_state,public.music_folder_inventory,public.music_maintenance_tasks to authenticated;
