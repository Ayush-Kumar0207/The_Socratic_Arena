-- ========================================================================================
-- THE SOCRATIC ARENA: MASTER DATABASE SCHEMA
-- ========================================================================================
-- 
-- ORDER OF EXECUTION (THE DEPENDENCY TREE):
--   LEVEL 1: FOUNDATION (profiles, user_follows)
--   LEVEL 2: CORE CONTENT (topics, matches)
--   LEVEL 3: CONNECTIONS (topic_follows, user_followed_topics, votes)
--   LEVEL 4: INDEPENDENT TABLES & INDEXES (challenges, private_arenas, notifications)
--   LEVEL 5: RPC FUNCTIONS (get_user_stats)
-- ========================================================================================

-- ==========================================
-- LEVEL 1: FOUNDATION
-- ==========================================

create table public.profiles (
  id uuid not null,
  username text null,
  total_score numeric(10, 2) null default 0.00,
  matches_played integer null default 0,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  elo_rating integer null default 1000,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_key unique (username),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_follows (
  id uuid not null default gen_random_uuid (),
  follower_id uuid not null,
  followed_id uuid not null,
  created_at timestamp with time zone null default now(),
  constraint user_follows_pkey primary key (id),
  constraint user_follows_follower_id_followed_id_key unique (follower_id, followed_id),
  constraint user_follows_followed_id_fkey foreign KEY (followed_id) references auth.users (id) on delete CASCADE,
  constraint user_follows_follower_id_fkey foreign KEY (follower_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

-- ==========================================
-- LEVEL 2: CORE CONTENT
-- ==========================================

create table public.topics (
  id uuid not null default extensions.uuid_generate_v4 (),
  title character varying(500) not null,
  category character varying(100) not null,
  is_trending boolean null default false,
  created_by uuid null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint topics_pkey primary key (id),
  constraint topics_created_by_fkey foreign KEY (created_by) references profiles (id)
) TABLESPACE pg_default;

create table public.matches (
  id uuid not null default gen_random_uuid (),
  topic text not null,
  status text null default 'active'::text,
  critic_id uuid null,
  defender_id uuid null,
  transcript jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  ai_score_critic numeric(10, 2) null,
  ai_score_defender numeric(10, 2) null,
  final_score_critic numeric(10, 2) null,
  final_score_defender numeric(10, 2) null,
  topic_title text null,
  ai_scores jsonb null,
  audience_votes_critic integer null default 0,
  audience_votes_defender integer null default 0,
  highlights jsonb null,
  winner_id uuid null,
  elo_change_critic integer null default 0,
  elo_change_defender integer null default 0,
  constraint matches_pkey primary key (id),
  constraint matches_critic_id_fkey foreign KEY (critic_id) references profiles (id),
  constraint matches_defender_id_fkey foreign KEY (defender_id) references profiles (id),
  constraint matches_winner_id_fkey foreign KEY (winner_id) references profiles (id)
) TABLESPACE pg_default;

-- ==========================================
-- LEVEL 3: CONNECTIONS
-- ==========================================

create table public.topic_follows (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  topic_id uuid not null,
  created_at timestamp with time zone null default now(),
  constraint topic_follows_pkey primary key (id),
  constraint topic_follows_user_id_topic_id_key unique (user_id, topic_id),
  constraint topic_follows_topic_id_fkey foreign KEY (topic_id) references topics (id) on delete CASCADE,
  constraint topic_follows_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.user_followed_topics (
  user_id uuid not null,
  topic_id uuid not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint user_followed_topics_pkey primary key (user_id, topic_id),
  constraint user_followed_topics_topic_id_fkey foreign KEY (topic_id) references topics (id) on delete CASCADE,
  constraint user_followed_topics_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.votes (
  id uuid not null default gen_random_uuid (),
  match_id uuid null,
  voter_id uuid null,
  voted_for uuid null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint votes_pkey primary key (id),
  constraint votes_match_id_voter_id_key unique (match_id, voter_id),
  constraint votes_match_id_fkey foreign KEY (match_id) references matches (id) on delete CASCADE,
  constraint votes_voted_for_fkey foreign KEY (voted_for) references profiles (id),
  constraint votes_voter_id_fkey foreign KEY (voter_id) references profiles (id)
) TABLESPACE pg_default;

-- ==========================================
-- LEVEL 4: INDEPENDENT TABLES & INDEXES
-- ==========================================

create table public.challenges (
  id uuid not null default gen_random_uuid (),
  challenger_id uuid not null,
  challenged_id uuid not null,
  topic_id uuid null,
  topic_title text not null,
  arena_code text not null,
  status text not null default 'pending'::text,
  challenger_stance text null default 'Random'::text,
  challenged_stance text null default 'Random'::text,
  challenger_in_arena boolean null default false,
  challenged_in_arena boolean null default false,
  match_id uuid null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone null default now(),
  constraint challenges_pkey primary key (id),
  constraint challenges_arena_code_key unique (arena_code),
  constraint challenges_challenger_id_fkey foreign KEY (challenger_id) references profiles (id) on delete CASCADE,
  constraint challenges_challenged_id_fkey foreign KEY (challenged_id) references profiles (id) on delete CASCADE,
  constraint challenges_topic_id_fkey foreign KEY (topic_id) references topics (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_challenges_challenger on public.challenges using btree (challenger_id) TABLESPACE pg_default;
create index IF not exists idx_challenges_challenged on public.challenges using btree (challenged_id) TABLESPACE pg_default;
create index IF not exists idx_challenges_code on public.challenges using btree (arena_code) TABLESPACE pg_default;
create index IF not exists idx_challenges_status_expires on public.challenges using btree (status, expires_at) TABLESPACE pg_default;

create table public.private_arenas (
  id uuid not null default gen_random_uuid (),
  arena_code text not null,
  topic_id uuid null,
  topic_title text not null,
  creator_id uuid not null,
  joiner_id uuid null,
  creator_stance text null,
  joiner_stance text null,
  status text not null default 'waiting'::text,
  match_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint private_arenas_pkey primary key (id),
  constraint private_arenas_arena_code_key unique (arena_code)
) TABLESPACE pg_default;

create index IF not exists idx_private_arenas_code on public.private_arenas using btree (arena_code) TABLESPACE pg_default;
create index IF not exists idx_private_arenas_status_created on public.private_arenas using btree (status, created_at) TABLESPACE pg_default;

create table public.notifications (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  type text not null,
  title text null,
  message text null,
  metadata jsonb null default '{}'::jsonb,
  is_read boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_notifications_user on public.notifications using btree (user_id, is_read, created_at desc) TABLESPACE pg_default;

-- ==========================================
-- LEVEL 5: RPC FUNCTIONS
-- ==========================================

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS json AS $$
DECLARE
    v_elo int;
    v_matches bigint;
    v_wins bigint;
BEGIN
    -- 1. Get current Elo
    SELECT elo_rating INTO v_elo FROM profiles WHERE id = p_user_id;
    
    -- 2. Count all completed/abandoned/voting matches where user participated
    SELECT count(*) INTO v_matches 
    FROM matches 
    WHERE (critic_id = p_user_id OR defender_id = p_user_id)
    AND status IN ('completed', 'abandoned', 'pending_votes', 'voting');

    -- 3. Count wins (only for resolved matches)
    SELECT count(*) INTO v_wins
    FROM matches
    WHERE winner_id = p_user_id
    AND status IN ('completed', 'abandoned');

    RETURN json_build_object(
        'elo_rating', COALESCE(v_elo, 1200),
        'total_matches', v_matches,
        'win_rate', CASE WHEN v_matches > 0 THEN ROUND((v_wins::float / v_matches::float) * 100) ELSE 0 END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Auto-create profile on signup via database trigger
-- This ensures the profile row is created inside the same transaction as the
-- auth.users row, preventing foreign key violations when email confirmation is enabled.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
