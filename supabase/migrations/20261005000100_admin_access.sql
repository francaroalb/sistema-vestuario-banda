-- Phase 1 only: administrator access. No wardrobe domain tables yet.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  role text not null default 'ADMIN' check (role = 'ADMIN'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;
revoke all on public.admin_profiles from public, anon, authenticated;
grant select on public.admin_profiles to authenticated;
grant all on public.admin_profiles to service_role;

create policy "Active administrators can read their own profile"
on public.admin_profiles for select to authenticated
using (user_id = (select auth.uid()) and active and role = 'ADMIN');

-- Reused by RLS in later phases. Lives outside exposed API schemas.
create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = (select auth.uid()) and active and role = 'ADMIN'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
create trigger admin_profile_updated_at before update on public.admin_profiles
for each row execute function private.set_updated_at();
