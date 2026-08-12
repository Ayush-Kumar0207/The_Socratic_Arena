-- Arena OS launch readiness: reproducible core RLS, atomic voting, complete
-- tournament/classroom/moderation/credential workflows, team debate, and
-- measured judge calibration records. Safe to run repeatedly.

create extension if not exists pgcrypto;

alter table public.reasoning_profiles
  alter column percentile drop not null,
  add column if not exists cohort_size integer not null default 0,
  add column if not exists percentile_updated_at timestamptz;

alter table public.tournaments
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists champion_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz;

alter table public.assignment_submissions
  add column if not exists transcript jsonb not null default '[]'::jsonb,
  add column if not exists feedback text,
  add column if not exists status text not null default 'submitted',
  add column if not exists graded_by uuid references public.profiles(id) on delete set null,
  add column if not exists graded_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.credentials
  add column if not exists issuer_id uuid references public.profiles(id) on delete set null,
  add column if not exists credential_type text not null default 'skill',
  add column if not exists signature text;

create table if not exists public.tournament_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  bracket_position integer not null check (bracket_position > 0),
  player1_id uuid references public.profiles(id) on delete set null,
  player2_id uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  score_player1 numeric(6,2),
  score_player2 numeric(6,2),
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending','ready','active','completed','bye')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tournament_id, round_number, bracket_position)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator','judge_reviewer','administrator')),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.moderation_reports(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('warning','suspension','ban')),
  reason text not null,
  issued_by uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.moderation_actions(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'queued' check (status in ('queued','reviewing','upheld','rejected')),
  resolution text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(action_id, appellant_id)
);

create table if not exists public.judge_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  judge_version text not null,
  dataset_version text not null,
  dataset_size integer not null,
  accuracy numeric(6,3) not null,
  language_parity_gap numeric(6,3),
  ideology_parity_gap numeric(6,3),
  speaking_order_gap numeric(6,3),
  accent_proxy_gap numeric(6,3),
  passed boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  input_hash text not null,
  claims jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  risk text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.team_debates (
  id uuid primary key default gen_random_uuid(),
  arena_code text not null unique,
  topic text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','active','completed','cancelled')),
  active_side text not null default 'affirmative' check (active_side in ('affirmative','negative')),
  active_position integer not null default 1 check (active_position in (1,2)),
  turn_number integer not null default 1,
  max_rounds integer not null default 2 check (max_rounds between 1 and 5),
  winning_side text check (winning_side in ('affirmative','negative','draw')),
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.team_debate_members (
  debate_id uuid not null references public.team_debates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text not null check (side in ('affirmative','negative')),
  position integer not null check (position in (1,2)),
  joined_at timestamptz not null default now(),
  primary key(debate_id, user_id),
  unique(debate_id, side, position)
);

create table if not exists public.team_debate_turns (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.team_debates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text not null check (side in ('affirmative','negative')),
  position integer not null check (position in (1,2)),
  turn_number integer not null,
  text text not null check (char_length(text) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(debate_id, turn_number)
);

create index if not exists idx_tournament_fixtures_bracket on public.tournament_fixtures(tournament_id, round_number, bracket_position);
create index if not exists idx_moderation_actions_active on public.moderation_actions(user_id, starts_at, expires_at) where revoked_at is null;
create index if not exists idx_moderation_appeals_status on public.moderation_appeals(status, created_at);
create index if not exists idx_judge_benchmark_version on public.judge_benchmark_runs(judge_version, created_at desc);
create index if not exists idx_evidence_verifications_user on public.evidence_verifications(user_id, created_at desc);
create index if not exists idx_team_debates_code on public.team_debates(arena_code);
create index if not exists idx_team_turns_debate on public.team_debate_turns(debate_id, turn_number);

-- Atomic audience voting. Only the service role may supply the already
-- authenticated voter id; the function validates participant and match state.
create or replace function public.cast_match_vote_service(
  p_match_id uuid,
  p_voted_for uuid,
  p_voter_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_critic_votes integer;
  v_defender_votes integer;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'pending_votes' then raise exception 'Voting is closed'; end if;
  if p_voted_for not in (v_match.critic_id, v_match.defender_id) then raise exception 'Invalid candidate'; end if;
  if p_voter_id in (v_match.critic_id, v_match.defender_id) then raise exception 'Participants cannot vote on their own match'; end if;

  insert into public.votes(match_id, voter_id, voted_for)
  values (p_match_id, p_voter_id, p_voted_for)
  on conflict (match_id, voter_id) do nothing;
  if not found then raise exception 'Vote already submitted'; end if;

  select count(*) filter (where voted_for = v_match.critic_id),
         count(*) filter (where voted_for = v_match.defender_id)
    into v_critic_votes, v_defender_votes
  from public.votes where match_id = p_match_id;

  update public.matches set
    audience_votes_critic = v_critic_votes,
    audience_votes_defender = v_defender_votes
  where id = p_match_id;

  return jsonb_build_object('critic', v_critic_votes, 'defender', v_defender_votes);
end;
$$;

revoke all on function public.cast_match_vote_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cast_match_vote_service(uuid, uuid, uuid) to service_role;

-- Core RLS is intentionally codified here instead of depending on dashboard
-- state. Service-role backend operations continue to bypass these policies.
alter table public.profiles enable row level security;
alter table public.user_follows enable row level security;
alter table public.topics enable row level security;
alter table public.matches enable row level security;
alter table public.topic_follows enable row level security;
alter table public.user_followed_topics enable row level security;
alter table public.votes enable row level security;
alter table public.challenges enable row level security;
alter table public.private_arenas enable row level security;
alter table public.notifications enable row level security;
alter table public.tournament_fixtures enable row level security;
alter table public.platform_admins enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_appeals enable row level security;
alter table public.judge_benchmark_runs enable row level security;
alter table public.evidence_verifications enable row level security;
alter table public.team_debates enable row level security;
alter table public.team_debate_members enable row level security;
alter table public.team_debate_turns enable row level security;

-- Remove any dashboard-created permissive policies before installing the
-- audited policy set below. Policy names differ across older deployments, so
-- enumerating pg_policies is safer than assuming a particular legacy name.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles','user_follows','topics','matches','topic_follows',
        'user_followed_topics','votes','challenges','private_arenas',
        'notifications','tournament_fixtures','platform_admins',
        'moderation_actions','moderation_appeals','judge_benchmark_runs',
        'evidence_verifications','team_debates','team_debate_members',
        'team_debate_turns'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable" on public.profiles for select using (true);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Follows are readable" on public.user_follows;
create policy "Follows are readable" on public.user_follows for select using (true);
drop policy if exists "Users create own follows" on public.user_follows;
create policy "Users create own follows" on public.user_follows for insert with check (follower_id = auth.uid());
drop policy if exists "Users delete own follows" on public.user_follows;
create policy "Users delete own follows" on public.user_follows for delete using (follower_id = auth.uid());

drop policy if exists "Topics are readable" on public.topics;
create policy "Topics are readable" on public.topics for select using (true);
drop policy if exists "Authenticated users create topics" on public.topics;
create policy "Authenticated users create topics" on public.topics for insert with check (auth.uid() is not null and (created_by is null or created_by = auth.uid()));

drop policy if exists "Public debate matches" on public.matches;
create policy "Public debate matches" on public.matches for select using (status in ('active','pending_votes','completed','abandoned'));

drop policy if exists "Topic follows are readable" on public.topic_follows;
create policy "Topic follows are readable" on public.topic_follows for select using (true);
drop policy if exists "Users create own topic follows" on public.topic_follows;
create policy "Users create own topic follows" on public.topic_follows for insert with check (user_id = auth.uid());
drop policy if exists "Users delete own topic follows" on public.topic_follows;
create policy "Users delete own topic follows" on public.topic_follows for delete using (user_id = auth.uid());

drop policy if exists "Followed topics are readable" on public.user_followed_topics;
create policy "Followed topics are readable" on public.user_followed_topics for select using (true);
drop policy if exists "Users manage own followed topics" on public.user_followed_topics;
create policy "Users manage own followed topics" on public.user_followed_topics for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users read own votes" on public.votes;
create policy "Users read own votes" on public.votes for select using (voter_id = auth.uid());

drop policy if exists "Challenge participants read" on public.challenges;
create policy "Challenge participants read" on public.challenges for select using (auth.uid() in (challenger_id, challenged_id));
drop policy if exists "Private arena participants read" on public.private_arenas;
create policy "Private arena participants read" on public.private_arenas for select using (auth.uid() in (creator_id, joiner_id));
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications for delete using (user_id = auth.uid());

drop policy if exists "Public tournament fixtures" on public.tournament_fixtures;
create policy "Public tournament fixtures" on public.tournament_fixtures for select using (true);
drop policy if exists "Admins read own role" on public.platform_admins;
create policy "Admins read own role" on public.platform_admins for select using (user_id = auth.uid());
drop policy if exists "Users read own moderation actions" on public.moderation_actions;
create policy "Users read own moderation actions" on public.moderation_actions for select using (user_id = auth.uid());
drop policy if exists "Users read own moderation appeals" on public.moderation_appeals;
create policy "Users read own moderation appeals" on public.moderation_appeals for select using (appellant_id = auth.uid());
drop policy if exists "Published benchmark results" on public.judge_benchmark_runs;
create policy "Published benchmark results" on public.judge_benchmark_runs for select using (true);
drop policy if exists "Users read own evidence checks" on public.evidence_verifications;
create policy "Users read own evidence checks" on public.evidence_verifications for select using (user_id = auth.uid());
drop policy if exists "Team debates visible to members" on public.team_debates;
create policy "Team debates visible to members" on public.team_debates for select using (
  created_by = auth.uid()
);
drop policy if exists "Team members visible to team" on public.team_debate_members;
create policy "Team members visible to team" on public.team_debate_members for select using (
  user_id = auth.uid()
);
drop policy if exists "Team turns visible to team" on public.team_debate_turns;
create policy "Team turns visible to team" on public.team_debate_turns for select using (
  user_id = auth.uid()
);

-- Writes to protected workflow and match tables happen only through the
-- authenticated backend/service role. The grants make that boundary explicit.
revoke insert, update, delete on public.matches, public.votes from anon, authenticated;
revoke all on public.tournament_fixtures, public.platform_admins, public.moderation_actions,
  public.moderation_appeals, public.judge_benchmark_runs, public.evidence_verifications,
  public.team_debates, public.team_debate_members, public.team_debate_turns from anon, authenticated;
grant select on public.tournament_fixtures, public.judge_benchmark_runs to anon, authenticated;
