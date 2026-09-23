-- ============================================================================
-- Send the welcome email on sign-up.  HOSTED Relay Labs project only.
--
-- A trigger on auth.users fires after a signup and POSTs the new user's email
-- to the `welcome` Edge Function, which sends through Resend. Self-host users do
-- not run this — they have no Relay Labs Resend key.
--
-- Set up once, in this order:
--
--   1. Deploy the function (no JWT — the trigger can't present a user token; the
--      shared secret below is its protection):
--        supabase functions deploy welcome --no-verify-jwt --project-ref udabbwsuteoobcebhvzd
--
--   2. Give it its secrets (pick a long random WELCOME_SECRET):
--        supabase secrets set RESEND_API_KEY=re_xxx WELCOME_SECRET=<random> \
--          WELCOME_FROM="Kilroy <kilroy@relaylabs.site>" --project-ref udabbwsuteoobcebhvzd
--
--   3. Enable pg_net:  Dashboard → Database → Extensions → enable "pg_net".
--
--   4. Store the SAME WELCOME_SECRET in Vault, so it isn't written in plain SQL:
--        select vault.create_secret('<random>', 'kilroy_welcome_secret');
--
--   5. Run the rest of this file.
-- ============================================================================

create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'kilroy_welcome_secret';

  perform net.http_post(
    url     := 'https://udabbwsuteoobcebhvzd.supabase.co/functions/v1/welcome',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || secret),
    body    := jsonb_build_object('email', NEW.email)
  );
  return NEW;
exception when others then
  -- A mail failure must never block a sign-up. Swallow and move on.
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created_welcome on auth.users;
create trigger on_auth_user_created_welcome
  after insert on auth.users
  for each row execute function public.send_welcome_email();
