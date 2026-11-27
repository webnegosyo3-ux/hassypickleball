-- The account the admin console is signed in with.
--
-- Password sign-in needs a confirmed address, and auth.users cannot be written
-- from the app — the anon key has no rights over it — so the account is
-- provisioned here: created if it is missing, its password reset if it already
-- exists, and given the administrator row either way. Idempotent, so re-running
-- it is how the password gets restored.
--
-- This is a setup credential. Change it from the dashboard once the club is
-- live; a password in a migration is only acceptable for a starter project.
--
-- Runs as the migration superuser (`pnpm db:push`). Pasting it into a client
-- signed in as `authenticated` cannot work: auth.users is not readable by that
-- role, and granting it SELECT would hand every staff email to any session. To
-- provision the account without a database connection, use `pnpm admin:create`,
-- which goes through the Admin API with the service role key instead.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_email constant text := 'admin@hassy.com';
  v_password constant text := 'admin1234';
  v_club_id constant uuid := '00000000-0000-4000-8000-000000000001';
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u where u.email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),                                   -- confirmed: no inbox to click through
      now(),
      now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('email', v_email)
    );

    -- GoTrue looks the account up by identity, not by the users row alone.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  else
    update auth.users
      set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_user_id;
  end if;

  insert into staff (user_id, club_id, role, full_name)
  values (v_user_id, v_club_id, 'admin', 'Admin')
  on conflict (user_id) do update
    set role = 'admin', club_id = excluded.club_id, is_active = true;
end
$$;
