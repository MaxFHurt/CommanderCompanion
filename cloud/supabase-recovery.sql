-- Recovery email for the online profile key (roadmap 7b.3). Apply once on the Supabase project (SQL editor).
-- Sign-in is a Supabase Auth email link (magic link, default template, no change needed); each user can only touch their own row.
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
-- Dashboard settings: Auth -> Providers -> Email on, "Confirm email" on; Auth -> URL Configuration: site_url and the redirect
-- allow-list = https://maxfhurt.github.io/CommanderCompanion/rebuild/** (tests also use http://127.0.0.1:4180/** and 4190/**).
-- The email holds a sign-in link (works once, 1 hour); no template change. The free default sender allows 2 emails an hour.
