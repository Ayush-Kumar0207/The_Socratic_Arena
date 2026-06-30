-- Migration 003: Backfill missing profiles and harden profile trigger
-- Ensures every auth user has a corresponding public.profiles row.

BEGIN;

-- 1) Backfill all existing auth users missing in profiles.
-- Username is set to NULL to avoid unique collisions; app already supports fallback display.
INSERT INTO public.profiles (id, username)
SELECT au.id, NULL
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 2) Harden trigger function so duplicate usernames do not block profile creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_username text;
BEGIN
  v_username := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');

  BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, v_username)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (id, username)
      VALUES (NEW.id, NULL)
      ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
