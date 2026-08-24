-- Members created through the admin API (manage-member / register-team edge functions)
-- can end up with email_confirmed_at = NULL. Supabase Auth then blocks their password
-- sign-in with `email_not_confirmed` ("Email not confirmed"), even when the
-- "Confirm email" provider setting is disabled.
-- This migration confirms every existing user so all member accounts can log in.

-- Note: `confirmed_at` is a generated column (derived from email_confirmed_at)
-- on current GoTrue versions and must not be updated directly.

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email_confirmed_at is null;;
