-- Application conflicts use HTTP 409, never serialization_failure (40001).
-- PostgREST may automatically retry serialization failures indefinitely.
create or replace function public.save_garment(
  p_id uuid,
  p_expected_version integer,
  p_code text,
  p_garment_type_id uuid,
  p_size text,
  p_physical_state public.garment_state,
  p_notes text
) returns public.garments language plpgsql security definer set search_path = '' as $$
declare
  v_row public.garments;
  v_actor uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_size text := upper(btrim(p_size));
  v_notes text := nullif(btrim(p_notes), '');
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_id is null or v_code is null or length(v_code) not between 1 and 60
    or v_size is null or length(v_size) not between 1 and 20
    or p_physical_state is null or length(v_notes) > 2000 then
    raise exception 'INVALID_GARMENT' using errcode = '22023';
  end if;
  select * into v_row from public.garments where id = p_id for update;
  if p_expected_version is null then
    -- The client keeps the same UUID on retry after a lost response. No duplicate audit.
    if found then
      if v_row.version = 1 and v_row.code = v_code and v_row.garment_type_id = p_garment_type_id
        and v_row.size = v_size and v_row.physical_state = p_physical_state
        and v_row.notes is not distinct from v_notes and v_row.archived_at is null then return v_row; end if;
      raise exception 'GARMENT_CHANGED' using errcode = 'PT409';
    end if;
  else
    if not found then raise exception 'GARMENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_row.version <> p_expected_version then raise exception 'GARMENT_CHANGED' using errcode = 'PT409'; end if;
    if v_row.archived_at is not null then raise exception 'GARMENT_ARCHIVED' using errcode = '22023'; end if;
  end if;
  if not exists (select 1 from public.garment_types where id = p_garment_type_id and active) then
    raise exception 'INVALID_GARMENT_TYPE' using errcode = '22023';
  end if;
  if p_expected_version is null then
    insert into public.garments (id, code, garment_type_id, size, physical_state, notes, created_by, updated_by)
    values (p_id, v_code, p_garment_type_id, v_size, p_physical_state, v_notes, v_actor, v_actor)
    returning * into v_row;
  else
    if v_row.code = v_code and v_row.garment_type_id = p_garment_type_id and v_row.size = v_size
      and v_row.physical_state = p_physical_state and v_row.notes is not distinct from v_notes then return v_row; end if;
    update public.garments set code = v_code, garment_type_id = p_garment_type_id, size = v_size,
      physical_state = p_physical_state, notes = v_notes, updated_by = v_actor,
      updated_at = clock_timestamp(), version = version + 1
    where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.save_garment(uuid, integer, text, uuid, text, public.garment_state, text) from public, anon;
grant execute on function public.save_garment(uuid, integer, text, uuid, text, public.garment_state, text) to authenticated;

create or replace function public.set_garment_archived(p_id uuid, p_expected_version integer, p_archived boolean)
returns public.garments language plpgsql security definer set search_path = '' as $$
declare v_row public.garments;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_expected_version is null or p_archived is null then raise exception 'INVALID_GARMENT' using errcode = '22023'; end if;
  select * into v_row from public.garments where id = p_id for update;
  if not found then raise exception 'GARMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.version <> p_expected_version then raise exception 'GARMENT_CHANGED' using errcode = 'PT409'; end if;
  if (v_row.archived_at is not null) = p_archived then return v_row; end if;
  update public.garments set
    archived_at = case when p_archived then clock_timestamp() else null end,
    archived_by = case when p_archived then auth.uid() else null end,
    updated_at = clock_timestamp(), updated_by = auth.uid(), version = version + 1
  where id = p_id returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.set_garment_archived(uuid, integer, boolean) from public, anon;
grant execute on function public.set_garment_archived(uuid, integer, boolean) to authenticated;
