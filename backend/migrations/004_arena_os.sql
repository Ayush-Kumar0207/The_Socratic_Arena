-- Arena OS: trustworthy judging, longitudinal coaching, leagues, education,
-- simulations, credentials, moderation, and appeals.
-- Safe to run repeatedly in the Supabase SQL editor.

create table if not exists public.judge_evaluations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  judge_version text not null,
  judge_role text not null,
  verdict jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create table if not exists public.reasoning_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  metrics jsonb not null default '{}'::jsonb,
  overall integer not null default 0 check (overall between 0 and 100),
  match_count integer not null default 0,
  confidence integer not null default 0 check (confidence between 0 and 100),
  percentile integer not null default 0 check (percentile between 0 and 100),
  trend numeric(6,2) not null default 0,
  prescribed_drill jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.format_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  format_key text not null,
  rating integer not null default 1000,
  matches_played integer not null default 0,
  peak_rating integer not null default 1000,
  updated_at timestamptz not null default now(),
  unique(user_id, format_key)
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_type text not null default 'drill',
  drill_id text,
  scenario_key text,
  topic text,
  transcript jsonb not null default '[]'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  duration_seconds integer not null default 0,
  completed_at timestamptz not null default now()
);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  disputed_dimensions text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','reviewing','upheld','adjusted','rejected')),
  resolution jsonb,
  judge_version_original text,
  judge_version_review text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(match_id, appellant_id)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming','active','completed')),
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  institution text,
  city text,
  visibility text not null default 'public' check (visibility in ('public','private','verified')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  badge_color text not null default '#22d3ee',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','captain','coach','owner')),
  joined_at timestamptz not null default now(),
  primary key(club_id, user_id)
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  host_club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  description text,
  format text not null default '1v1',
  domain text not null default 'Open',
  bracket_size integer not null default 16,
  registration_ends_at timestamptz,
  starts_at timestamptz not null,
  status text not null default 'registration' check (status in ('draft','registration','live','completed','cancelled')),
  rules jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  seed integer,
  status text not null default 'registered',
  registered_at timestamptz not null default now(),
  primary key(tournament_id, user_id)
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null default 'education',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  settings jsonb not null default '{"privacy":"private","retention_days":365}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  term text,
  default_rubric jsonb not null default '{"logic":25,"evidence":25,"rebuttal":20,"clarity":15,"listening":15}'::jsonb,
  ai_policy text not null default 'disclose' check (ai_policy in ('allowed','disclose','restricted','prohibited')),
  created_at timestamptz not null default now()
);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student' check (role in ('student','teacher','assistant')),
  joined_at timestamptz not null default now(),
  primary key(classroom_id, user_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  topic text not null,
  format text not null default '1v1',
  duration_minutes integer not null default 5,
  due_at timestamptz,
  rubric jsonb not null default '{}'::jsonb,
  position_policy text not null default 'random',
  integrity_policy jsonb not null default '{"citations_required":true,"ai_disclosure_required":true}'::jsonb,
  status text not null default 'published' check (status in ('draft','published','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  scores jsonb not null default '{}'::jsonb,
  integrity_report jsonb not null default '{}'::jsonb,
  grade numeric(5,2),
  submitted_at timestamptz not null default now(),
  unique(assignment_id, student_id)
);

create table if not exists public.simulation_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_key text not null unique,
  title text not null,
  description text,
  category text not null,
  difficulty text not null default 'intermediate',
  opening_prompt text not null,
  rubric jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_key text not null,
  title text not null,
  level text,
  evidence jsonb not null default '{}'::jsonb,
  verification_code text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique(user_id, credential_key)
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  category text not null,
  details text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','triaged','actioned','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_judge_evaluations_match on public.judge_evaluations(match_id, created_at desc);
create index if not exists idx_practice_sessions_user on public.practice_sessions(user_id, completed_at desc);
create index if not exists idx_appeals_user on public.appeals(appellant_id, created_at desc);
create index if not exists idx_tournaments_status on public.tournaments(status, starts_at);
create index if not exists idx_assignments_classroom on public.assignments(classroom_id, due_at);
create index if not exists idx_moderation_reports_status on public.moderation_reports(status, created_at);

alter table public.judge_evaluations enable row level security;
alter table public.reasoning_profiles enable row level security;
alter table public.format_ratings enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.appeals enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.organizations enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.credentials enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.seasons enable row level security;
alter table public.simulation_scenarios enable row level security;

-- Idempotent policy creation helper keeps this migration re-runnable.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reasoning_profiles' and policyname='Public reasoning profiles') then
    create policy "Public reasoning profiles" on public.reasoning_profiles for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='format_ratings' and policyname='Public format ratings') then
    create policy "Public format ratings" on public.format_ratings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clubs' and policyname='Public clubs') then
    create policy "Public clubs" on public.clubs for select using (visibility <> 'private' or owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tournaments' and policyname='Public tournaments') then
    create policy "Public tournaments" on public.tournaments for select using (status <> 'draft');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='practice_sessions' and policyname='Own practice sessions') then
    create policy "Own practice sessions" on public.practice_sessions for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='appeals' and policyname='Own appeals') then
    create policy "Own appeals" on public.appeals for select using (appellant_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credentials' and policyname='Public active credentials') then
    create policy "Public active credentials" on public.credentials for select using (revoked_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='seasons' and policyname='Public seasons') then
    create policy "Public seasons" on public.seasons for select using (status <> 'upcoming' or starts_at <= now() + interval '90 days');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulation_scenarios' and policyname='Public simulation scenarios') then
    create policy "Public simulation scenarios" on public.simulation_scenarios for select using (is_public = true);
  end if;
end $$;

insert into public.simulation_scenarios (scenario_key, title, description, category, difficulty, opening_prompt, rubric)
values
  ('sales-objection', 'Enterprise sales objection', 'Defend value and handle a skeptical procurement lead.', 'Sales', 'intermediate', 'Your proposal is twice the price of the incumbent. Why should we take that risk?', '{"clarity":20,"listening":25,"evidence":20,"persuasion":25,"calibration":10}'),
  ('salary-negotiation', 'Salary negotiation', 'Negotiate scope, evidence, and trade-offs under pressure.', 'Career', 'intermediate', 'The budget is fixed. Why should we make an exception for your compensation?', '{"clarity":20,"evidence":25,"persuasion":25,"listening":15,"emotionalControl":15}'),
  ('design-review', 'Technical design review', 'Defend an architecture against reliability and cost concerns.', 'Technology', 'advanced', 'This design adds operational complexity. Prove the reliability gain is worth it.', '{"logic":25,"evidence":20,"rebuttal":25,"calibration":15,"clarity":15}'),
  ('investor-pitch', 'Investor challenge room', 'Answer market, moat, and execution objections.', 'Leadership', 'advanced', 'Your competitors can copy this in six months. What is actually defensible?', '{"logic":20,"evidence":20,"rebuttal":20,"persuasion":25,"calibration":15}'),
  ('policy-defense', 'Policy defence', 'Balance stakeholders, evidence, and unintended consequences.', 'Policy', 'advanced', 'Your policy helps the average case but harms a vulnerable minority. Defend it.', '{"logic":20,"evidence":25,"humility":15,"rebuttal":20,"calibration":20}')
on conflict (scenario_key) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  difficulty = excluded.difficulty,
  opening_prompt = excluded.opening_prompt,
  rubric = excluded.rubric;

insert into public.seasons (name, slug, starts_at, ends_at, status, rules)
values ('Founders Season', 'founders-season', date_trunc('quarter', now()), date_trunc('quarter', now()) + interval '3 months', 'active', '{"placement_matches":5,"divisions":["Bronze","Silver","Gold","Diamond","Oracle"]}')
on conflict (slug) do update set status='active', ends_at=excluded.ends_at;
