-- Read-only maintenance index, including resolved incidents. Underlying admin RLS applies.
create view public.music_maintenance_index with (security_invoker=true) as
with tasks as (
 select task_id, category, kind, folder_id, work_id, issue_id, repertoire_code,
 title, description, blocks_use, created_at, resolved_at, issue_version
 from public.music_maintenance_tasks
 union all
 select 'score:'||i.id::text, case when i.kind='MISSING' then 'REPERTOIRE' else 'CONSERVATION' end,
 i.kind,i.folder_id,i.work_id,i.id,i.repertoire_code,w.title,i.description,false,i.created_at,i.resolved_at,i.version
 from public.folder_score_issues i join public.repertoire_works w on w.id=i.work_id where i.resolved_at is not null
 union all
 select 'physical:'||i.id::text,'CONSERVATION',i.kind,i.folder_id,null::uuid,i.id,f.repertoire_code,
 null::text,i.description,i.blocks_use,i.created_at,i.resolved_at,i.version
 from public.folder_physical_issues i join public.music_folders f on f.id=i.folder_id where i.resolved_at is not null
)
select t.*,f.code folder_code,f.voice_name,f.operability,f.archived,
 f.version folder_version,w.version work_version,w.active work_active,
 case when t.issue_id is null then 'PRESENCE' when t.work_id is null then 'PHYSICAL' else 'SCORE' end family,
 coalesce(s.resolution,p.resolution) resolution,
 a.display_name created_by_name,b.display_name resolved_by_name
from tasks t join public.music_folder_inventory f on f.id=t.folder_id
left join public.repertoire_works w on w.id=t.work_id
left join public.folder_score_issues s on s.id=t.issue_id and t.work_id is not null
left join public.folder_physical_issues p on p.id=t.issue_id and t.work_id is null
left join public.admin_profiles a on a.user_id=coalesce(s.created_by,p.created_by)
left join public.admin_profiles b on b.user_id=coalesce(s.resolved_by,p.resolved_by);
revoke all on public.music_maintenance_index from public,anon,authenticated;
grant select on public.music_maintenance_index to authenticated;
