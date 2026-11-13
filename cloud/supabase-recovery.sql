-- Recovery email for the online profile key (roadmap 7b.3). Apply once on the Supabase project (SQL editor).
-- Sign-in is Supabase Auth email one-time codes; each user can only touch their own row.
create table if not exists public.profile_recovery (
  user_id uuid primary key references auth.users on delete cascade,
  profile_key text not null,
  updated_at timestamptz not null default now()
);
alter table public.profile_recovery enable row level security;
create policy "own row: select" on public.profile_recovery for select using (user_id = auth.uid());
create policy "own row: insert" on public.profile_recovery for insert with check (user_id = auth.uid());
create policy "own row: update" on public.profile_recovery for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own row: delete" on public.profile_recovery for delete using (user_id = auth.uid());
-- Dashboard settings: Auth -> Providers -> Email on, "Confirm email" on; Auth -> Email templates -> Magic Link /
-- Confirm signup: show {{ .Token }} (the 6-digit code) in the body. The free default sender allows only a few emails an hour.
