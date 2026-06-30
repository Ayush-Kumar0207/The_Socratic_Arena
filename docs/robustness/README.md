# Socratic Arena Robustness Evidence

This folder contains controlled local breakdown testing for the Socratic Arena backend and realtime layer.

Latest verified run:

- Report: [runs/2026-06-30-local-breakdown-after-metrics-cache/SUMMARY.md](runs/2026-06-30-local-breakdown-after-metrics-cache/SUMMARY.md)
- Raw breakdown results: [runs/2026-06-30-local-breakdown-after-metrics-cache/results.json](runs/2026-06-30-local-breakdown-after-metrics-cache/results.json)
- Raw swarm results: [runs/2026-06-30-local-breakdown-after-metrics-cache/swarm-results-2026-06-30T12-29-45-408Z.json](runs/2026-06-30-local-breakdown-after-metrics-cache/swarm-results-2026-06-30T12-29-45-408Z.json)

## Executive Result

The June 30, 2026 local breakdown run used Prometheus, Grafana, Alertmanager, and the custom local runner in [tools/robustness/breakdown-runner.mjs](../../tools/robustness/breakdown-runner.mjs).

| Area | Result |
|---|---|
| Backend health after test | Healthy |
| HTTP public endpoint pressure | Passed through 750 target req/s |
| First HTTP ceiling | 1000 target req/s, caused by latency saturation, not 5xx errors |
| Socket.IO auth pressure | Passed through 100 handshakes/s |
| Socket rejection behavior | Invalid JWTs were rejected cleanly with 0 runner-level failures |
| Resident memory after run | 176.8 MB |
| Event-loop lag after run | 65.8 ms |
| Realtime swarm tester | 84 Socket.IO clients, 2 active matches, 7,220 received messages, 13 emitted turns, 7 simulated drops, 0 rage quits |

The key hardening added before the final run was a short metrics cache around `GET /metrics`. That stopped repeated Prometheus-format metric generation from becoming the bottleneck during heavy scraping/load-test traffic.

## Screenshot Evidence

Primary benchmark evidence:

![Benchmark evidence](runs/2026-06-30-local-breakdown-after-metrics-cache/screenshots/benchmark-evidence.png)

Grafana/Prometheus live metric evidence:

![Grafana dashboard](runs/2026-06-30-local-breakdown-after-metrics-cache/screenshots/grafana-dashboard.png)

This evidence board is rendered from the Prometheus scrape values that populate Grafana after the local `socratic-swarm-tester` run. The raw tester export is committed next to this report as JSON and CSV. It captures peak live sockets, peak active matches, socket event increases, cognitive insight counts, HTTP latency, and alert delivery in one GitHub-readable artifact.

Prometheus request-rate query:

![Prometheus query](runs/2026-06-30-local-breakdown-after-metrics-cache/screenshots/prometheus-query.png)

Alertmanager synthetic evidence alert:

![Alertmanager alerts](runs/2026-06-30-local-breakdown-after-metrics-cache/screenshots/alertmanager-alerts.png)

The alert screenshot shows `SocraticArenaLoadEvidenceAlert` firing through Alertmanager with `source="socratic-swarm-tester"`, proving that automatic alert routing is visible during a robustness run.

## Reproduce The Breakdown Run

Start the backend:

```powershell
cd backend
$env:ALERT_WEBHOOK_SECRET="local-alert-secret"
npm run dev
```

Start observability:

```powershell
docker compose -f observability/docker-compose.yml up -d --pull never
```

Run the controlled local breakdown test:

```powershell
node tools/robustness/breakdown-runner.mjs `
  --stages 250,500,750,1000,1500 `
  --socket-stages 25,50,75,100 `
  --duration 8 `
  --concurrency 2048 `
  --out-dir docs/robustness/runs/manual-local-breakdown
```

Run the realtime swarm tester from the sibling tester repo:

```powershell
# Backend terminal, local only
cd C:\Users\kumar\Desktop\The_Socratic_Arena\backend
$env:ENABLE_SWARM_TEST_AUTH="true"
$env:SWARM_BOT_TOKEN="SWARM_SECRET_OVERRIDE_123"
npm run dev

# Tester terminal
cd C:\Users\kumar\Desktop\socratic-swarm-tester
$env:TARGET_URL="http://localhost:5000"
$env:NUM_DEBATERS="4"
$env:NUM_SPECTATORS="80"
$env:TEST_DURATION_MS="90000"
$env:SWARM_SEED="grafana-live-proof-2026-06-30"
npm start
```

The runner stops each ramp once p95 latency exceeds the configured ceiling or the failure rate exceeds the configured threshold. By default it refuses non-local targets, so it will not accidentally load-test production infrastructure.

## What The Runner Covers

- Public HTTP pressure over `GET /health`, `GET /metrics`, unknown routes, and JSON 404s.
- Socket.IO authentication pressure using intentionally invalid JWTs.
- Local-only synthetic full-match traffic from `socratic-swarm-tester` using `ENABLE_SWARM_TEST_AUTH=true`.
- Backend health before and after the run.
- Prometheus query snapshots for backend up status, request rate, p95 latency, memory, and event-loop lag.
- Machine-readable `results.json` plus a GitHub-friendly `SUMMARY.md`.

## Automatic Alert Coverage

Prometheus evaluates rules for:

- backend down or restarted
- high HTTP p95 latency
- HTTP 5xx error rate above 5%
- Node.js event-loop lag
- high resident memory
- Gemini AI failures
- Socket.IO disconnect storms
- matchmaking queue backlog

Alertmanager sends alerts to both the backend webhook and the independent alert-relay container. The relay can forward to Discord, Slack, or any compatible webhook through `ALERT_WEBHOOK_URL`, so backend-down alerts can still leave the local observability stack even when the app process is unhealthy.

## Known Limits

This is a local, single-machine robustness ceiling. It is useful proof that the backend handles controlled pressure and that observability works, but it is not a replacement for provider-approved staging tests against Vercel, Render, and Supabase.

Production authenticated full-match load is intentionally not included. The sibling `socratic-swarm-tester` repo now covers local full-match traffic through a local-only synthetic auth token, so it can exercise rooms, spectators, turns, cognitive insights, disconnect cleanup, and metrics without polluting Supabase users or production data.
