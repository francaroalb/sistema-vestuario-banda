-- Deterministic, read-only suggestions from physical loan history. Never create custody.
create function private.size_family(value text) returns text language sql immutable set search_path='' as $$
 select case when upper(btrim(value)) ~ '^[1-9][0-9]{0,2}$' then 'NUMERIC'
 when upper(btrim(value)) in ('XXS','XS','S','M','L','XL','XXL','2XL','XXXL','3XL') then 'LETTER' else 'CUSTOM' end
$$;
create function private.size_rank(value text) returns integer language sql immutable set search_path='' as $$
 select case when private.size_family(value)='NUMERIC' then btrim(value)::integer
 else case upper(btrim(value)) when 'XXS' then 1 when 'XS' then 2 when 'S' then 3 when 'M' then 4 when 'L' then 5 when 'XL' then 6 when 'XXL' then 7 when '2XL' then 7 when 'XXXL' then 8 when '3XL' then 8 end end
$$;
revoke all on function private.size_family(text),private.size_rank(text) from public,anon,authenticated;

create function private.garment_recommendation(p_event uuid,p_person uuid,p_type uuid,p_excluded uuid[] default '{}')
returns jsonb language plpgsql stable set search_path='' as $$
declare e public.events; block public.series_blocks; preferred text; use_count bigint; tied integer; history jsonb; options jsonb; result jsonb; family text; ranking integer;
begin
 select * into e from public.events where id=p_event and not cancelled;
 if e.id is null or not exists(select 1 from public.event_participants where event_id=p_event and person_id=p_person and active) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 select b.* into block from public.series_blocks b join public.event_participants ep on ep.block_id=b.id where ep.event_id=p_event and ep.person_id=p_person;
 if p_type is null or not(p_type=any(coalesce(block.type_ids,e.type_ids))) then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 e.planned_from:=coalesce(block.planned_from,e.planned_from);e.planned_until:=coalesce(block.planned_until,e.planned_until);
 with sizes as(select upper(btrim(i.size)) size,count(*) uses,max(i.delivered_at) recent from public.loan_items i join public.loans l on l.id=i.loan_id where l.person_id=p_person and i.garment_type_id=p_type group by upper(btrim(i.size)))
 select coalesce(jsonb_agg(to_jsonb(sizes) order by uses desc,recent desc,size),'[]') into history from sizes;
 preferred:=history->0->>'size';use_count:=(history->0->>'uses')::bigint;
 select count(*) into tied from jsonb_array_elements(history) h where (h->>'uses')::bigint=use_count;
 family:=private.size_family(preferred);ranking:=private.size_rank(preferred);
 with available as (
 select g.id,g.code,g.size,li.loan_id,li.garment_id is not null own_custody,
 case when upper(btrim(g.size))=preferred or (family<>'CUSTOM' and private.size_family(g.size)=family and private.size_rank(g.size)=ranking) then 0 else 1 end size_step,
 private.size_rank(g.size) size_order
 from public.garments g left join public.loan_items li on li.garment_id=g.id and li.returned_at is null left join public.loans l on l.id=li.loan_id
 where g.garment_type_id=p_type and g.archived_at is null and g.physical_state='DISPONIBLE' and not(g.id=any(p_excluded))
 and (l.id is null or l.person_id=p_person)
 and exists(select 1 from public.people where id=p_person and archived_at is null)
 and e.planned_until>now() and preferred is not null
 and (upper(btrim(g.size))=preferred or (family<>'CUSTOM' and private.size_family(g.size)=family and private.size_rank(g.size)>=ranking))
 and not exists(select 1 from public.planning_occupancy r where r.garment_id=g.id
 and not(r.event_id=p_event and r.person_id=p_person) and not(coalesce(r.block_id=block.id,false))
 and r.planned_from<e.planned_until and e.planned_from<r.planned_until)
 ), shortlist as (
 select * from available where size_step=0 or size_order=(select min(size_order) from available where size_step=1)
 order by size_step,size_order,own_custody desc,code,id limit 5)
 select coalesce(jsonb_agg(to_jsonb(shortlist) order by size_step,size_order,own_custody desc,code,id),'[]') into options from shortlist;
 result:=jsonb_build_object('event_id',p_event,'person_id',p_person,'type_id',p_type,'block_id',block.id,'from',e.planned_from,'until',e.planned_until,
 'historical_size',preferred,'history',history,'ambiguous',tied>1,'candidates',options,
 'review',preferred is null or tied>1 or jsonb_array_length(options)=0 or (options->0->>'size_step')::integer=1,
 'reason',case when preferred is null then 'NO_HISTORY' when tied>1 then 'TIED_HISTORY' when jsonb_array_length(options)=0 then 'NO_AVAILABLE' when (options->0->>'size_step')::integer=1 then 'LARGER_SIZE' else 'SAME_SIZE' end);
 return result;
end $$;
revoke all on function private.garment_recommendation(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
create function public.garment_recommendation(p_event uuid,p_person uuid,p_type uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return private.garment_recommendation(p_event,p_person,p_type);
end $$;
revoke all on function public.garment_recommendation(uuid,uuid,uuid) from public,anon;
grant execute on function public.garment_recommendation(uuid,uuid,uuid) to authenticated;

create function private.assisted_plan(p_scope text,p_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare version integer; r record; suggestion jsonb; chosen uuid; excluded uuid[]; proposals jsonb:='[]'; lines jsonb:='[]'; n integer:=0; preserved integer:=0; existing_review integer:=0;
begin
 if p_scope is null or p_scope not in ('event','series') or p_id is null then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 if p_scope='event' then
 select e.version into version from public.events e where id=p_id and not cancelled and series_id is null;
 else select s.version into version from public.event_series s where id=p_id; end if;
 if version is null then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 for r in select prep.* from public.event_preparation prep join public.events e on e.id=prep.event_id
 left join public.series_blocks b on b.id=prep.block_id
 where (p_scope='event' and e.id=p_id) or (p_scope='series' and e.series_id=p_id and e.id=b.event_ids[1])
 order by prep.person_id,coalesce(b.planned_from,e.planned_from),prep.type_id loop
 if r.garment_id is not null then preserved:=preserved+1;if r.status in ('CONFLICTO','PENDIENTE_DEVOLUCION') then existing_review:=existing_review+1;end if;continue; end if;
 n:=n+1;
 if n>200 then raise exception 'ASSIST_LIMIT' using errcode='22023'; end if;
 select coalesce(array_agg((x->>'garment_id')::uuid),'{}') into excluded from jsonb_array_elements(proposals) x
 where (x->>'from')::timestamptz<coalesce(r.block_until,(select planned_until from public.events where id=r.event_id))
 and coalesce(r.block_from,(select planned_from from public.events where id=r.event_id))<(x->>'until')::timestamptz;
 suggestion:=private.garment_recommendation(r.event_id,r.person_id,r.type_id,excluded);
 chosen:=null;
 if (suggestion->>'review')::boolean is false then
 chosen:=(suggestion->'candidates'->0->>'id')::uuid;
 proposals:=proposals||jsonb_build_array(jsonb_build_object('garment_id',chosen,'from',suggestion->'from','until',suggestion->'until'));
 end if;
 lines:=lines||jsonb_build_array(suggestion||jsonb_build_object('full_name',r.full_name,'type_name',r.type_name,'garment_id',chosen));
 end loop;
 return jsonb_build_object('scope',p_scope,'id',p_id,'version',version,'lines',lines,'preserved',preserved,'existing_review',existing_review,'suggested',jsonb_array_length(proposals),'review',n-jsonb_array_length(proposals));
end $$;
revoke all on function private.assisted_plan(text,uuid) from public,anon,authenticated;
create function public.preview_assisted_plan(p_scope text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return private.assisted_plan(p_scope,p_id);
end $$;
revoke all on function public.preview_assisted_plan(text,uuid) from public,anon;
grant execute on function public.preview_assisted_plan(text,uuid) to authenticated;

-- Confirmation checks that the complete preview is still current; nothing partially applies.
create function public.apply_assisted_plan(p_request_id uuid,p_preview jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prev public.planning_requests; fresh jsonb; payload jsonb; line jsonb; result jsonb; person uuid; garment uuid; version integer; v_id uuid; scope text;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_request_id is null or p_preview is null or jsonb_typeof(p_preview)<>'object' then raise exception 'INVALID_PLAN' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(65005);
 payload:=jsonb_build_object('action','ASSISTED','id',p_preview->>'id','preview',p_preview);
 select pr.* into prev from public.planning_requests pr where pr.id=p_request_id;
 if found then
 if prev.payload<>payload then raise exception 'REQUEST_ALREADY_USED' using errcode='PT409'; end if;
 return prev.result;
 end if;
 -- Shared with movement RPCs: people before garments, ordered to avoid deadlocks.
 for person in select distinct (x->>'person_id')::uuid from jsonb_array_elements(p_preview->'lines') x order by 1 loop
 perform 1 from public.people where public.people.id=person for update;
 end loop;
 for garment in select distinct (x->>'garment_id')::uuid from jsonb_array_elements(p_preview->'lines') x where x->>'garment_id' is not null order by 1 loop
 perform 1 from public.garments where public.garments.id=garment for update;
 end loop;
 scope:=p_preview->>'scope';v_id:=(p_preview->>'id')::uuid;
 fresh:=private.assisted_plan(scope,v_id);
 if fresh<>p_preview then raise exception 'RECOMMENDATION_CHANGED' using errcode='PT409'; end if;
 if (fresh->>'suggested')::integer=0 then raise exception 'NOTHING_TO_ASSIGN' using errcode='22023'; end if;
 for line in select value from jsonb_array_elements(fresh->'lines') where value->>'garment_id' is not null loop
 if scope='event' then
 select e.version into version from public.events e where e.id=v_id;
 perform public.plan_event(gen_random_uuid(),'ASSIGN',v_id,version,jsonb_build_object('person_id',line->>'person_id','type_id',line->>'type_id','garment_id',line->>'garment_id'));
 else
 select s.version into version from public.event_series s where s.id=v_id;
 perform public.plan_series(gen_random_uuid(),'BLOCK_ASSIGN',v_id,version,jsonb_build_object('block_id',line->>'block_id','type_id',line->>'type_id','garment_id',line->>'garment_id'));
 end if;
 end loop;
 result:=jsonb_build_object('assigned',fresh->'suggested','review',fresh->'review');
 insert into public.planning_requests(id,payload,result,actor_id) values(p_request_id,payload,result,auth.uid());
 return result;
end $$;
revoke all on function public.apply_assisted_plan(uuid,jsonb) from public,anon;
grant execute on function public.apply_assisted_plan(uuid,jsonb) to authenticated;
