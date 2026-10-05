-- Rejoining an event restores participation only. Inactive assignments may refer
-- to garments that have since been reserved for another participant.
-- plan_event snapshots the old assignments in audit_log before this transition.
create function private.reset_rejoined_participant_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_assignments
  set garment_id = null, fulfilled_item_id = null
  where event_id = new.event_id and person_id = new.person_id;
  -- Real loans, their items and movements remain unchanged.
  return new;
end;
$$;

revoke all on function private.reset_rejoined_participant_assignments()
from public, anon, authenticated;

create trigger participant_rejoin_clears_old_assignments
before update of active on public.event_participants
for each row
when (not old.active and new.active)
execute function private.reset_rejoined_participant_assignments();
