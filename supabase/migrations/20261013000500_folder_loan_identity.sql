-- Reservation and resulting loan may share an identity only through an explicit fulfillment.
-- Also protects direct RPC calls from excluding an unrelated reservation by reusing its UUID.
create function private.folder_loan_identity_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='folder_reservations' then
 if exists(select 1 from public.folder_loans where id=new.id) then
 raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 else
 if (new.reservation_id is not null and new.reservation_id<>new.id)
 or (new.reservation_id is null and exists(select 1 from public.folder_reservations where id=new.id)) then
 raise exception 'MUSIC_IDENTITY_FIXED' using errcode='22023'; end if;
 end if;
 return new;
end $$;
create trigger folder_reservation_identity before insert on public.folder_reservations for each row execute function private.folder_loan_identity_guard();
create trigger folder_loan_identity before insert on public.folder_loans for each row execute function private.folder_loan_identity_guard();
revoke all on function private.folder_loan_identity_guard() from public,anon,authenticated;
