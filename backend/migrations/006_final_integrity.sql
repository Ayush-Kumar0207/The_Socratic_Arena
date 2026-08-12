-- Final integrity hardening: verified tournament outcomes and auditable 2v2 judging.

alter table public.tournament_fixtures
  add column if not exists result_source text,
  add column if not exists result_verified_at timestamptz,
  add column if not exists result_evidence jsonb not null default '{}'::jsonb;

alter table public.tournament_fixtures
  drop constraint if exists tournament_fixtures_result_source_check;
alter table public.tournament_fixtures
  add constraint tournament_fixtures_result_source_check
  check (result_source is null or result_source in ('verified_match', 'bye'));

-- A canonical Socratic match can certify only one bracket fixture.
create unique index if not exists uq_tournament_fixture_verified_match
  on public.tournament_fixtures(match_id)
  where match_id is not null;

update public.tournament_fixtures
set result_source = 'bye',
    result_verified_at = coalesce(completed_at, now()),
    result_evidence = jsonb_build_object('source', 'automatic_bye')
where status = 'bye' and result_source is null;

alter table public.team_debates
  add column if not exists judge_version text,
  add column if not exists judging_started_at timestamptz,
  add column if not exists judging_error text,
  add column if not exists result_finalized_at timestamptz;

alter table public.team_debates drop constraint if exists team_debates_status_check;
alter table public.team_debates
  add constraint team_debates_status_check
  check (status in ('waiting','active','judging','judging_failed','completed','cancelled'));

create table if not exists public.team_judge_evaluations (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.team_debates(id) on delete cascade,
  judge_version text not null,
  judge_role text not null,
  verdict jsonb not null,
  confidence numeric(5,4),
  created_at timestamptz not null default now(),
  unique(debate_id, judge_role)
);

create index if not exists idx_team_judge_evaluations_debate
  on public.team_judge_evaluations(debate_id, created_at);

alter table public.team_judge_evaluations enable row level security;
revoke all on public.team_judge_evaluations from anon, authenticated;

comment on column public.tournament_fixtures.result_evidence is
  'Server-generated evidence for the canonical match result used to advance the bracket.';
comment on table public.team_judge_evaluations is
  'Auditable raw verdicts from the three independent blind judges for competitive 2v2 debates.';
