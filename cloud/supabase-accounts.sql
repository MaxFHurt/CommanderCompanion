-- Accounts (owner, 13 Nov): profile_recovery (user_id -> profile_key, cloud/supabase-recovery.sql) is the account's
-- profile key. Apply once in the SQL editor, after supabase-recovery.sql.
-- One key belongs to one account: a second email cannot take over a profile it never signed up with. The app answers a
-- clash (409 / 23505) with "This profile is already kept by another email".
-- Safe: if any key is already linked twice, nothing changes and the duplicates are listed.
do $$
begin
  if exists (select 1 from public.profile_recovery group by profile_key having count(*) > 1) then
    raise exception 'Some profile keys are linked to more than one account; fix these first: %',
      (select string_agg(profile_key, ', ') from (select profile_key from public.profile_recovery group by profile_key having count(*) > 1) d);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_recovery_key_unique') then
    alter table public.profile_recovery add constraint profile_recovery_key_unique unique (profile_key);
  end if;
end $$;

-- Dashboard settings for the code sign-in:
--   Auth -> Providers -> Email: on; "Email OTP length" 6; OTP expiry 3600 s (or less).
--   Auth -> Emails -> templates "Magic Link" and "Confirm signup": show {{ .Token }} (the 6-digit code). A link may stay
--     in the email; it opens the app at ?auth=1 and signs in too (redirect allow-list as in supabase-recovery.sql).
--   Auth -> Sessions: refresh-token rotation on (default). The app keeps the refresh token on the device and swaps it at
--     start and before the hour-long access token runs out.
--   Custom SMTP (owner: Brevo) to lift the default 2-emails-an-hour limit; Auth -> Rate limits: raise "emails per hour".
