-- A garment marked unavailable must include a useful explanation.
alter table public.garments
  add constraint garments_unavailable_requires_observation
  check (physical_state <> 'NO_DISPONIBLE' or length(btrim(notes)) > 0);

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
    or p_physical_state is null or length(v_notes) > 2000
    or (p_physical_state = 'NO_DISPONIBLE' and v_notes is null) then
    raise exception 'INVALID_GARMENT' using errcode = '22023';
  end if;
  select * into v_row from public.garments where id = p_id for update;
  if p_expected_version is null then
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

create or replace function public.preview_import(p_kind text,p_rows jsonb) returns jsonb
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
   elsif coalesce(r->>'state','') not in ('DISPONIBLE','PENDIENTE_LAVANDERIA','DANADA','NO_DISPONIBLE') then label:='Estado físico no válido';
   elsif r->>'state'='NO_DISPONIBLE' and length(btrim(coalesce(r->>'notes','')))=0 then label:='La observación es obligatoria para prendas no disponibles';
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
