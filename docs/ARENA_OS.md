# Arena OS

Arena OS turns Socratic Arena from a single live-debate loop into a competitive reasoning and communication platform. It is available at `/arena-os` after sign-in.

## Delivered product loops

### Trustworthy judging

- Three independent blind judges: logic, evidence, and communication.
- Median aggregation so one outlier does not decide a match.
- Eleven rubric dimensions while preserving the legacy `logic`, `facts`, and `relevance` fields.
- Judge agreement, uncertainty, confidence, rubric version, factual-claim flags, and identity-blinding status on every new result.
- Raw versioned judge evaluations for audits.
- Participant appeals that preserve the original decision and judge version.

The panel intentionally rewards direct reasoning, truthful calibration, reliable evidence, listening, and emotional control. It explicitly excludes accent, aggression, ideology, vocabulary, and verbosity as positive signals.

### Visible improvement

- A longitudinal reasoning profile across logic, evidence, rebuttal, clarity, conciseness, persuasion, listening, calibration, epistemic humility, source reliability, and emotional control.
- Evidence confidence and percentile estimates that become more reliable as verified matches accumulate.
- Prescribed drills selected from the weakest current dimension.
- AI sparring with an always-available local fallback and post-session scoring.
- Professional scenario practice for sales, salary negotiation, design review, investor objections, and policy defence.

### Competitive identity

- Separate rating records for Ranked Classic and topic domains.
- Founders Season progress and divisions.
- Verified tournament registration and extensible brackets.
- Clubs with owners, members, institutions, cities, and public/private visibility.
- Shareable result identity from both practice and match review.

### Education workspace

- Private classrooms with join codes and explicit AI-use policies.
- Assignments with topic, duration, due date, randomized positions, custom rubrics, and integrity policy.
- Storage for submissions, grades, transcript evidence, and integrity reports.
- An integrity check that separates citation gaps from AI-authorship claims. Automated AI detection is not presented as proof.

### Safety and credentials

- Moderation reports linked to a user and/or match while preserving evidence.
- Portable, verifiable credential records.
- Organization privacy and retention settings in the data model.

## Database installation

Run the existing `schema.sql`, then apply migrations in numeric order. Existing deployments only need the new migration:

```text
backend/migrations/004_arena_os.sql
```

The application remains compatible before this migration is applied: existing live debates and result screens continue to work, and Arena OS shows preview/catalog data. Mutating Arena OS workflows return a clear setup error until the new tables exist.

## API surface

All Arena OS routes require the current Supabase bearer token.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/product/bootstrap` | Profile, season, ratings, drills, clubs, tournaments, classrooms, scenarios, credentials, appeals |
| `POST` | `/api/product/practice/respond` | Generate a direct AI counterargument |
| `POST` | `/api/product/practice/complete` | Score and store a sparring/simulation session |
| `POST` | `/api/product/drills/:id/complete` | Record a prescribed drill |
| `POST` | `/api/product/appeals` | Appeal a participant’s match result |
| `POST` | `/api/product/clubs` | Create a club |
| `POST` | `/api/product/clubs/:id/join` | Join a club |
| `POST` | `/api/product/tournaments/:id/join` | Register for a tournament |
| `POST` | `/api/product/classrooms` | Create a classroom |
| `POST` | `/api/product/classrooms/:id/assignments` | Publish an assignment |
| `POST` | `/api/product/integrity/check` | Inspect claims and citation coverage |
| `POST` | `/api/product/moderation/reports` | File a safety report |

## Operational behavior

- With `ENABLE_ADVANCED_AI=true` and `GEMINI_API_KEY` configured, match evaluation runs the three-judge panel and AI practice uses Gemini.
- If AI is unavailable, live matches receive a neutral auditable fallback and practice uses the deterministic local opponent/scorer. No core workflow hangs on an AI outage.
- New tables are optional to the legacy match path. Database setup errors are isolated from match completion and Elo persistence.
- `npm test` in `backend/` covers panel aggregation, side-aware profile computation, and deterministic practice scoring.

## Next production integrations

The schema and user workflows are ready for external LMS/SSO, plagiarism providers, evidence-retrieval providers, video clip rendering, and formal human calibration datasets. Those require institution/vendor credentials and are deliberately represented as integration boundaries rather than simulated external connections.
