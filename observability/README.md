# Socratic Arena Observability

This stack adds performance tracking without adding unnecessary production complexity.

Included:

- Prometheus scrapes backend metrics from `GET /metrics`.
- Grafana loads a ready-made "Socratic Arena Robustness Overview" dashboard.
- Alertmanager sends alerts to the backend webhook and to an independent alert relay container.
- The relay can forward crash/performance alerts to Discord, Slack, or any compatible webhook even when the backend is down.

Not included yet:

- Kafka: useful for durable event streams and worker pipelines, but this app is currently a single realtime backend.
- Redis: useful for cross-instance Socket.IO adapters, queues, and caching. Add it when the backend is horizontally scaled or matchmaking needs shared state across processes.

## Run Locally

Terminal 1:

```bash
cd backend
npm install
$env:ALERT_WEBHOOK_SECRET="local-alert-secret"
npm run dev
```

Terminal 2:

```bash
# Optional, but recommended for automatic external alerts
$env:ALERT_WEBHOOK_URL="https://discord.com/api/webhooks/..."

docker compose -f observability/docker-compose.yml up -d --pull never
```

For production, set `METRICS_TOKEN` on the backend and configure your Prometheus scrape job with either `authorization.credentials` or a `?token=` param. Leave it unset for local development.

Open:

- Grafana: http://localhost:3001, login `admin` / `admin`
- Prometheus targets: http://localhost:9090/targets
- Prometheus alerts: http://localhost:9090/alerts
- Alertmanager: http://localhost:9093
- Raw backend metrics: http://localhost:5000/metrics
- Backend health: http://localhost:5000/health

## Automatic Alerts

Alertmanager posts to both:

```text
http://host.docker.internal:5000/api/alerts/prometheus?secret=local-alert-secret
http://alert-relay:9088/alertmanager
```

The backend webhook records alert metrics and audit logs while the app is healthy. The `alert-relay` container handles external notifications, so backend-down alerts can still reach you.

For external notifications, set this before starting Docker Compose:

```bash
$env:ALERT_WEBHOOK_URL="https://discord.com/api/webhooks/..."
docker compose -f observability/docker-compose.yml up -d --pull never
```

The webhook receives these alert families:

- backend down or restarted
- high HTTP latency
- high HTTP 5xx rate
- Node event-loop lag
- high memory usage
- Gemini AI failures
- Socket.IO disconnect storms
- matchmaking queue backlog

## Screenshot Checklist

Use these as proof-of-robustness screenshots in GitHub:

1. Grafana dashboard: `Socratic Arena Robustness Overview`
2. Prometheus targets page showing `socratic-arena-backend` as `UP`
3. Prometheus alerts page showing configured alert rules
4. Alertmanager page showing active or resolved alerts
5. Raw `/metrics` output showing `socratic_arena_*` metrics

The latest completed breakdown report with embedded screenshots is in:

```text
docs/robustness/runs/2026-06-30-local-breakdown-after-metrics-cache/SUMMARY.md
```

The reproducible local load runner is:

```text
tools/robustness/breakdown-runner.mjs
```

See the full robustness evidence page: [`docs/robustness/README.md`](../docs/robustness/README.md).

## Troubleshooting

### Backend says `EADDRINUSE :5000`

Another backend is already running on port `5000`. That is okay if `http://localhost:5000/health` works; Prometheus can scrape the existing process. If you need to restart it, stop the old terminal/process first, then run `npm run dev` again.

To check quickly:

```bash
netstat -ano | Select-String ':5000'
Invoke-WebRequest http://localhost:5000/health -UseBasicParsing
```

### Docker says it cannot connect to `dockerDesktopLinuxEngine`

Start Docker Desktop and wait until it finishes booting. In this Codex sandbox, Docker commands may need elevated execution even after Docker Desktop is running.

### Docker Compose hangs while pulling images

This repo's compose file uses common local images: `prom/prometheus:latest`, `prom/alertmanager:latest`, `grafana/grafana:latest`, and `node:18-alpine`. If they already exist locally, run:

```bash
docker compose -f observability/docker-compose.yml up -d --pull never
```