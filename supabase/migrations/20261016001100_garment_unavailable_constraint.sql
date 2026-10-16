-- Treat NULL notes as empty in CHECK: SQL CHECK constraints accept NULL results.
alter table public.garments
  drop constraint garments_unavailable_requires_observation;
alter table public.garments
  add constraint garments_unavailable_requires_observation
  check (physical_state <> 'NO_DISPONIBLE' or length(btrim(coalesce(notes, ''))) > 0);
