-- Strict RPC boundary. Only new music writes share this short transaction lock.
-- It also serializes catalog baselines, multi-folder batches and request deduplication.
create function private.music_fields(d jsonb, required text[], optional text[] default '{}') returns void
language plpgsql set search_path='' as $$
begin
 if d is null or jsonb_typeof(d)<>'object' or not(d ?& required) or d-(required||optional)<>'{}'::jsonb then
 raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
end $$;
create function private.music_text(d jsonb,k text,max_len integer,required boolean default false) returns text
language plpgsql set search_path='' as $$
declare v text;
begin
 if d ? k and jsonb_typeof(d->k) not in ('string','null') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 v:=nullif(btrim(d->>k),'');
 if (required and v is null) or length(v)>max_len then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 return v;
end $$;
create function private.music_bool(d jsonb,k text) returns boolean language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(d->k) is distinct from 'boolean' then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 return (d->>k)::boolean;
end $$;
create function private.music_version(actual integer,expected integer) returns void language plpgsql set search_path='' as $$
begin
 if actual is distinct from expected or (expected is not null and expected<1) then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
end $$;
create function private.music_data_version(d jsonb,k text) returns integer language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(d->k) is distinct from 'number' or (d->>k)!~'^[1-9][0-9]{0,8}$' then
 raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 return (d->>k)::integer;
end $$;
create function private.music_audit(kind text,entity uuid,action text,before_data jsonb,after_data jsonb,request uuid)
returns void language plpgsql set search_path='' as $$
begin
 insert into public.audit_log(actor_id,actor_name,entity_type,entity_id,action,before_data,after_data)
 select auth.uid(),display_name,kind,entity,action,before_data,jsonb_build_object('record',after_data,'request_id',request)
 from public.admin_profiles where user_id=auth.uid();
end $$;
create function private.music_presence(folder uuid,work uuid,present boolean,reason text,action text,request uuid,note text)
returns void language plpgsql set search_path='' as $$
declare s public.folder_work_state;
begin
 select * into s from public.folder_work_state where folder_id=folder and work_id=work;
 if not found then raise exception 'MUSIC_REPERTOIRE_MISMATCH' using errcode='22023'; end if;
 insert into public.folder_work_presence(folder_id,work_id,repertoire_code,present,absence_reason,updated_at,updated_by)
 values(folder,work,s.repertoire_code,present,reason,clock_timestamp(),auth.uid())
 on conflict(folder_id,work_id) do update set present=excluded.present,absence_reason=excluded.absence_reason,
 updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.folder_work_movements(request_id,folder_id,work_id,repertoire_code,action,before_present,after_present,notes,actor_id)
 values(request,folder,work,s.repertoire_code,action,s.present,present,note,auth.uid());
end $$;

create function public.music_command(p_request uuid,p_action text,p_id uuid,p_expected_version integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<cmd>>
declare
 previous public.music_requests; payload jsonb; result jsonb; before_row jsonb;
 voice public.musical_voices; work public.repertoire_works; folder public.music_folders;
 score public.folder_score_issues; physical public.folder_physical_issues; state public.folder_work_state;
 rep text; code text; label text; instrument text; description text; outcome text; kind text; note text;
 flag boolean; archive_flag boolean; folder_id uuid; work_id uuid; voice_id uuid; revision integer;
 actor uuid:=auth.uid(); at_time timestamptz;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null or p_id is null or p_action is null or p_action not in
 ('VOICE_SAVE','WORK_SAVE','FOLDER_SAVE','PRESENCE','SCORE_SAVE','SCORE_RESOLVE','PHYSICAL_SAVE','PHYSICAL_RESOLVE')
 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('action',p_action,'id',p_id,'version',p_expected_version,'data',p_data);
 select * into previous from public.music_requests where id=p_request;
 if found then
 if previous.actor_id<>actor or previous.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
 return previous.result; end if;
 insert into public.music_requests(id,actor_id,payload,result) values(p_request,actor,payload,'{}');
 at_time:=clock_timestamp();
 if p_action='VOICE_SAVE' then
 perform private.music_fields(p_data,array['code','name','archived'],array['instrument']);
 code:=upper(private.music_text(p_data,'code',12,true)); label:=private.music_text(p_data,'name',120,true);
 instrument:=private.music_text(p_data,'instrument',80); archive_flag:=private.music_bool(p_data,'archived');
 select * into voice from public.musical_voices where id=p_id for update;
 perform private.music_version(voice.version,p_expected_version); before_row:=to_jsonb(voice);
 if voice.id is not null and voice.code<>code then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 insert into public.musical_voices(id,code,name,instrument,archived,created_by,updated_by)
 values(p_id,code,label,instrument,archive_flag,actor,actor)
 on conflict(id) do update set name=excluded.name,instrument=excluded.instrument,archived=excluded.archived,
 version=musical_voices.version+1,updated_at=at_time,updated_by=actor returning * into voice;
 result:=to_jsonb(voice);
 perform private.music_audit('music_voice',p_id,'MUSIC_VOICE_SAVE',before_row,result,p_request);
 elsif p_action='WORK_SAVE' then
 perform private.music_fields(p_data,array['repertoire_code','title','active'],array['author']);
 rep:=private.music_text(p_data,'repertoire_code',3,true); label:=private.music_text(p_data,'title',200,true);
 description:=private.music_text(p_data,'author',160); flag:=private.music_bool(p_data,'active');
 select * into work from public.repertoire_works where id=p_id for update;
 perform private.music_version(work.version,p_expected_version); before_row:=to_jsonb(work);
 if work.id is not null and work.repertoire_code<>rep then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 if not exists(select 1 from public.music_repertoires where music_repertoires.code=rep) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if work.id is null and not flag then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if work.id is null or work.active<>flag then
 update public.music_repertoires set revision=music_repertoires.revision+1 where music_repertoires.code=rep returning music_repertoires.revision into revision;
 end if;
 insert into public.repertoire_works(id,repertoire_code,title,author,active,created_by,updated_by)
 values(p_id,rep,label,description,flag,actor,actor)
 on conflict(id) do update set title=excluded.title,author=excluded.author,active=excluded.active,
 version=repertoire_works.version+1,updated_at=at_time,updated_by=actor returning * into work;
 if revision is not null then
 if flag then insert into public.repertoire_work_periods(work_id,from_revision,opened_by) values(p_id,revision,actor);
 else update public.repertoire_work_periods set until_revision=revision,closed_at=at_time,closed_by=actor where repertoire_work_periods.work_id=p_id and until_revision is null; end if;
 end if;
 result:=to_jsonb(work);
 perform private.music_audit('music_work',p_id,'MUSIC_WORK_SAVE',before_row,result,p_request);
 elsif p_action='FOLDER_SAVE' then
 perform private.music_fields(p_data,array['code','repertoire_code','voice_id','manually_blocked','archived'],array['notes']);
 code:=upper(private.music_text(p_data,'code',60,true)); rep:=private.music_text(p_data,'repertoire_code',3,true);
 voice_id:=private.music_text(p_data,'voice_id',36,true)::uuid; description:=private.music_text(p_data,'notes',2000);
 flag:=private.music_bool(p_data,'manually_blocked'); archive_flag:=private.music_bool(p_data,'archived');
 select * into folder from public.music_folders where id=p_id for update;
 perform private.music_version(folder.version,p_expected_version); before_row:=to_jsonb(folder);
 select * into voice from public.musical_voices where id=voice_id;
 if voice.id is null or (folder.id is null and voice.archived) then raise exception 'MUSIC_VOICE_UNAVAILABLE' using errcode='22023'; end if;
 if folder.id is not null and (folder.code<>code or folder.voice_id<>voice_id or folder.repertoire_code<>rep) then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 if code !~ ('^'||rep||'-'||voice.code||'-[0-9]{1,6}$') or split_part(code,'-',3)::integer<1 then raise exception 'MUSIC_INVALID_CODE' using errcode='22023'; end if;
 select music_repertoires.revision into revision from public.music_repertoires where music_repertoires.code=rep;
 if revision is null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 insert into public.music_folders(id,code,repertoire_code,voice_id,baseline_revision,manually_blocked,archived,notes,created_by,updated_by)
 values(p_id,code,rep,voice_id,revision,flag,archive_flag,description,actor,actor)
 on conflict(id) do update set manually_blocked=excluded.manually_blocked,archived=excluded.archived,notes=excluded.notes,
 version=music_folders.version+1,updated_at=at_time,updated_by=actor returning * into folder;
 result:=to_jsonb(folder);
 perform private.music_audit('music_folder',p_id,'MUSIC_FOLDER_SAVE',before_row,result,p_request);
 elsif p_action='PRESENCE' then
 perform private.music_fields(p_data,array['work_id','work_version','action'],array['notes']);
 work_id:=private.music_text(p_data,'work_id',36,true)::uuid; kind:=private.music_text(p_data,'action',20,true);
 note:=private.music_text(p_data,'notes',2000);
 select * into folder from public.music_folders where id=p_id for update;
 if folder.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(folder.version,p_expected_version);
 if folder.archived then raise exception 'MUSIC_FOLDER_ARCHIVED' using errcode='22023'; end if;
 select * into state from public.folder_work_state where folder_work_state.folder_id=p_id and folder_work_state.work_id=cmd.work_id;
 if not found then raise exception 'MUSIC_REPERTOIRE_MISMATCH' using errcode='22023'; end if;
 perform private.music_version(state.work_version,private.music_data_version(p_data,'work_version'));
 if (kind='INCORPORATE' and state.state<>'PENDING_ADD') or (kind='REMOVE' and state.state<>'PENDING_REMOVE')
 or kind not in ('INCORPORATE','REMOVE') then raise exception 'MUSIC_PRESENCE_CHANGED' using errcode='PT409'; end if;
 before_row:=to_jsonb(state);
 perform private.music_presence(p_id,work_id,kind='INCORPORATE',case when kind='REMOVE' then 'REMOVED' end,kind,p_request,note);
 update public.music_folders set version=version+1,updated_at=at_time,updated_by=actor where id=p_id returning * into folder;
 result:=jsonb_build_object('folder',to_jsonb(folder),'work_id',work_id,'action',kind);
 perform private.music_audit('music_folder',p_id,'MUSIC_PRESENCE',before_row,result,p_request);
 else
 -- Incidence edits refer to both the incidence version and its folder's current version.
 if p_action='SCORE_SAVE' then
 perform private.music_fields(p_data,array['folder_id','folder_version','work_id','work_version','kind'],array['description']);
 elsif p_action='PHYSICAL_SAVE' then
 perform private.music_fields(p_data,array['folder_id','folder_version','kind','description','blocks_use']);
 elsif p_action='SCORE_RESOLVE' then
 perform private.music_fields(p_data,array['folder_version','work_version','outcome'],array['resolution']);
 else
 perform private.music_fields(p_data,array['folder_version'],array['resolution']);
 end if;
 if p_action in ('SCORE_SAVE','SCORE_RESOLVE') then
 select * into score from public.folder_score_issues where id=p_id for update;
 perform private.music_version(score.version,p_expected_version); before_row:=to_jsonb(score);
 if p_action='SCORE_RESOLVE' and score.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 if score.resolved_at is not null then raise exception 'MUSIC_ISSUE_RESOLVED' using errcode='PT409'; end if;
 if p_action='SCORE_SAVE' then
 folder_id:=private.music_text(p_data,'folder_id',36,true)::uuid; work_id:=private.music_text(p_data,'work_id',36,true)::uuid;
 kind:=private.music_text(p_data,'kind',20,true); description:=private.music_text(p_data,'description',2000);
 if kind not in ('MISSING','DAMAGED','REPLACE','REPAIR') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if score.id is not null and (score.folder_id<>folder_id or score.work_id<>work_id or score.kind<>kind) then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 else folder_id:=score.folder_id; work_id:=score.work_id; kind:=score.kind; end if;
 else
 select * into physical from public.folder_physical_issues where id=p_id for update;
 perform private.music_version(physical.version,p_expected_version); before_row:=to_jsonb(physical);
 if p_action='PHYSICAL_RESOLVE' and physical.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 if physical.resolved_at is not null then raise exception 'MUSIC_ISSUE_RESOLVED' using errcode='PT409'; end if;
 if p_action='PHYSICAL_SAVE' then
 folder_id:=private.music_text(p_data,'folder_id',36,true)::uuid; kind:=private.music_text(p_data,'kind',20,true);
 description:=private.music_text(p_data,'description',2000,true); flag:=private.music_bool(p_data,'blocks_use');
 if kind not in ('ELASTICS','COVER','RINGS','REPLACE_FOLDER','OTHER') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if physical.id is not null and (physical.folder_id<>folder_id or physical.kind<>kind) then raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 else folder_id:=physical.folder_id; end if;
 end if;
 select * into folder from public.music_folders where id=folder_id for update;
 if folder.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 perform private.music_version(folder.version,private.music_data_version(p_data,'folder_version'));
 if folder.archived and ((p_action='SCORE_SAVE' and score.id is null) or (p_action='PHYSICAL_SAVE' and physical.id is null)) then
 raise exception 'MUSIC_FOLDER_ARCHIVED' using errcode='22023'; end if;
 if work_id is not null then
 select * into state from public.folder_work_state where folder_work_state.folder_id=cmd.folder_id and folder_work_state.work_id=cmd.work_id;
 if not found then raise exception 'MUSIC_REPERTOIRE_MISMATCH' using errcode='22023'; end if;
 perform private.music_version(state.work_version,private.music_data_version(p_data,'work_version'));
 end if;
 if p_action='SCORE_SAVE' then
 if score.id is null and kind<>'MISSING' and not state.present then raise exception 'MUSIC_SCORE_ABSENT' using errcode='22023'; end if;
 if score.id is null and kind='MISSING' then
 perform private.music_presence(folder_id,work_id,false,'MISSING','MISSING',p_request,description); end if;
 insert into public.folder_score_issues(id,folder_id,work_id,repertoire_code,kind,description,created_by,updated_by)
 values(p_id,folder_id,work_id,folder.repertoire_code,kind,description,actor,actor)
 on conflict(id) do update set description=excluded.description,version=folder_score_issues.version+1,updated_at=at_time,updated_by=actor returning * into score;
 result:=to_jsonb(score);
 elsif p_action='PHYSICAL_SAVE' then
 insert into public.folder_physical_issues(id,folder_id,kind,description,blocks_use,created_by,updated_by)
 values(p_id,folder_id,kind,description,flag,actor,actor)
 on conflict(id) do update set description=excluded.description,blocks_use=excluded.blocks_use,
 version=folder_physical_issues.version+1,updated_at=at_time,updated_by=actor returning * into physical;
 result:=to_jsonb(physical);
 elsif p_action='SCORE_RESOLVE' then
 outcome:=private.music_text(p_data,'outcome',20,true); note:=private.music_text(p_data,'resolution',2000);
 if outcome not in ('PRESENT','ABSENT','UNCHANGED') then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if kind='MISSING' and (outcome='UNCHANGED' or (outcome='ABSENT' and state.active)) then raise exception 'MUSIC_MISSING_UNRESOLVED' using errcode='22023'; end if;
 if outcome='ABSENT' and (kind<>'MISSING' or state.active) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 if outcome='PRESENT' then
 if exists(select 1 from public.folder_score_issues i where i.folder_id=cmd.folder_id and i.work_id=cmd.work_id and i.kind='MISSING' and i.resolved_at is null and i.id<>p_id) then
 raise exception 'MUSIC_RESOLVE_MISSING' using errcode='22023'; end if;
 perform private.music_presence(folder_id,work_id,true,null,case when kind='MISSING' then 'RECOVER' else 'REPLACE' end,p_request,note);
 elsif outcome='ABSENT' then
 perform private.music_presence(folder_id,work_id,false,'REMOVED','CONFIRM_ABSENT',p_request,note);
 end if;
 update public.folder_score_issues set resolved_at=at_time,resolved_by=actor,resolution=note,
 version=version+1,updated_at=at_time,updated_by=actor where id=p_id returning * into score;
 result:=to_jsonb(score);
 else
 note:=private.music_text(p_data,'resolution',2000);
 update public.folder_physical_issues set resolved_at=at_time,resolved_by=actor,resolution=note,
 version=version+1,updated_at=at_time,updated_by=actor where id=p_id returning * into physical;
 result:=to_jsonb(physical);
 end if;
 update public.music_folders set version=version+1,updated_at=at_time,updated_by=actor where id=folder_id returning * into folder;
 perform private.music_audit('music_folder',folder_id,'MUSIC_'||p_action,before_row,result,p_request);
 result:=jsonb_build_object('issue',result,'folder_version',folder.version);
 end if;
 update public.music_requests set result=cmd.result where id=p_request;
 return result;
end $$;

create function public.preview_music_presence(p_action text,p_work uuid,p_folders uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; w public.repertoire_works;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('INCORPORATE','REMOVE') or p_work is null or p_folders is null
 or cardinality(p_folders) not between 1 and 200 or array_position(p_folders,null) is not null
 or cardinality(p_folders)<>(select count(distinct x) from unnest(p_folders) x) then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 select * into w from public.repertoire_works where id=p_work;
 if w.id is null then raise exception 'MUSIC_NOT_FOUND' using errcode='P0002'; end if;
 if (select count(*) from public.folder_work_state s join public.music_folders f on f.id=s.folder_id
 where s.work_id=p_work and s.folder_id=any(p_folders) and not f.archived
 and s.state=case p_action when 'INCORPORATE' then 'PENDING_ADD' else 'PENDING_REMOVE' end)<>cardinality(p_folders) then
 raise exception 'MUSIC_PRESENCE_CHANGED' using errcode='PT409'; end if;
 select jsonb_agg(jsonb_build_object('id',s.folder_id,'version',s.folder_version,'code',f.code,'state',s.state) order by s.folder_id)
 into rows from public.folder_work_state s join public.music_folders f on f.id=s.folder_id where s.work_id=p_work and s.folder_id=any(p_folders);
 return jsonb_build_object('action',p_action,'work_id',p_work,'work_version',w.version,'title',w.title,'folders',rows);
end $$;
create function public.apply_music_presence(p_request uuid,p_preview jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.music_requests; ids uuid[]; fresh jsonb; r jsonb; results jsonb:='[]'; payload jsonb;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request is null then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform private.music_fields(p_preview,array['action','work_id','work_version','title','folders']);
 if jsonb_typeof(p_preview->'folders') is distinct from 'array' or jsonb_array_length(p_preview->'folders') not between 1 and 200 then raise exception 'MUSIC_INVALID_DATA' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(65013);
 payload:=jsonb_build_object('batch',p_preview);
 select * into previous from public.music_requests where id=p_request;
 if found then
 if previous.actor_id<>auth.uid() or previous.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
 return previous.result; end if;
 select array_agg((value->>'id')::uuid) into ids from jsonb_array_elements(p_preview->'folders');
 fresh:=public.preview_music_presence(p_preview->>'action',(p_preview->>'work_id')::uuid,ids);
 if fresh<>p_preview then raise exception 'MUSIC_CHANGED' using errcode='PT409'; end if;
 insert into public.music_requests(id,actor_id,payload,result) values(p_request,auth.uid(),payload,'{}');
 for r in select value from jsonb_array_elements(fresh->'folders') loop
 results:=results||jsonb_build_array(public.music_command(gen_random_uuid(),'PRESENCE',(r->>'id')::uuid,(r->>'version')::integer,
 jsonb_build_object('work_id',fresh->'work_id','work_version',fresh->'work_version','action',fresh->'action','notes','Operación conjunta '||p_request::text)));
 end loop;
 fresh:=jsonb_build_object('count',cardinality(ids),'results',results);
 update public.music_requests set result=fresh where id=p_request;
 return fresh;
end $$;

revoke all on function private.music_fields(jsonb,text[],text[]),private.music_text(jsonb,text,integer,boolean),
 private.music_bool(jsonb,text),private.music_version(integer,integer),private.music_data_version(jsonb,text),
 private.music_audit(text,uuid,text,jsonb,jsonb,uuid),private.music_presence(uuid,uuid,boolean,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.music_command(uuid,text,uuid,integer,jsonb),public.preview_music_presence(text,uuid,uuid[]),public.apply_music_presence(uuid,jsonb) from public,anon;
grant execute on function public.music_command(uuid,text,uuid,integer,jsonb),public.preview_music_presence(text,uuid,uuid[]),public.apply_music_presence(uuid,jsonb) to authenticated;
