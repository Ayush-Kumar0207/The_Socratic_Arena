# Socratic Arena Robustness Breakdown Run

Generated: 2026-06-30T08:23:07.240Z

Target: `http://localhost:5000`  
Prometheus: `http://localhost:9090`  
Per-stage duration: 8s  
Stop rule: p95 > 2000ms or failure rate > 5.0%

## Executive Result

- HTTP ceiling: 750 target RPS passed; first ceiling observed at 1000 target RPS.
- Socket handshake ceiling: 100/s passed; no socket ceiling observed in configured run.
- Backend health after run: healthy.

## HTTP Ramp

| Target RPS | Achieved RPS | Requests | Failure Rate | p50 ms | p95 ms | p99 ms | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---|
| 250 | 250.1 | 2001 | 0.00% | 2.2 | 5.0 | 11.3 | PASS |
| 500 | 500.0 | 4000 | 0.00% | 2.1 | 9.6 | 23.9 | PASS |
| 750 | 749.4 | 5995 | 0.00% | 6.7 | 29.7 | 52.1 | PASS |
| 1000 | 760.9 | 6087 | 0.00% | 987.4 | 5956.2 | 6153.9 | CEILING |

## Socket.IO Authentication Pressure

This stage intentionally uses invalid JWTs. A clean `Authentication Error` is counted as success because it proves the backend rejected unauthenticated socket pressure without accepting bogus users.

| Target handshakes/s | Achieved/s | Attempts | Failure Rate | p95 ms | Verdict |
|---:|---:|---:|---:|---:|---|
| 25 | 25.0 | 200 | 0.00% | 546.9 | PASS |
| 50 | 50.0 | 400 | 0.00% | 559.7 | PASS |
| 75 | 75.0 | 600 | 0.00% | 325.9 | PASS |
| 100 | 100.1 | 801 | 0.00% | 284.2 | PASS |

## Metrics Snapshot

### Before

```json
{
  "processResidentMemoryBytes": 35958784,
  "heapUsedBytes": 25662496,
  "eventLoopLagSeconds": 0.0015572,
  "socketConnections": 0,
  "activeMatches": 0,
  "waitingQueuePlayers": 0
}
```

### After

```json
{
  "processResidentMemoryBytes": 176816128,
  "heapUsedBytes": 43234936,
  "eventLoopLagSeconds": 0.0657893,
  "socketConnections": 0,
  "activeMatches": 0,
  "waitingQueuePlayers": 0
}
```

## Prometheus Queries Captured

```json
{
  "up": [
    {
      "metric": {
        "__name__": "up",
        "instance": "host.docker.internal:5000",
        "job": "socratic-arena-backend"
      },
      "value": [
        1782807867.031,
        "1"
      ]
    }
  ],
  "requestRate": [
    {
      "metric": {},
      "value": [
        1782807867.047,
        "134.72938251922525"
      ]
    }
  ],
  "p95Latency": [
    {
      "metric": {},
      "value": [
        1782807867.057,
        "0.02375"
      ]
    }
  ],
  "memoryBytes": [
    {
      "metric": {
        "__name__": "socratic_arena_process_resident_memory_bytes",
        "instance": "host.docker.internal:5000",
        "job": "socratic-arena-backend"
      },
      "value": [
        1782807867.113,
        "173924352"
      ]
    }
  ],
  "eventLoopLag": [
    {
      "metric": {
        "__name__": "socratic_arena_nodejs_eventloop_lag_seconds",
        "instance": "host.docker.internal:5000",
        "job": "socratic-arena-backend"
      },
      "value": [
        1782807867.117,
        "0.0772309"
      ]
    }
  ]
}
```

## Screenshot Evidence

Screenshots captured beside this report under `screenshots/`:

- `screenshots/grafana-dashboard.png`
- `screenshots/prometheus-query.png`
- `screenshots/alertmanager-alerts.png`

![Grafana dashboard](screenshots/grafana-dashboard.png)

![Prometheus query](screenshots/prometheus-query.png)

![Alertmanager alerts](screenshots/alertmanager-alerts.png)

## Notes And Limits

- This run targets local infrastructure only by default. Do not run destructive load against Vercel/Render/Supabase without explicit provider-approved limits.
- Authenticated full-match pressure requires seeded test users and valid Supabase JWTs. This report therefore separates public HTTP pressure from unauthenticated socket rejection pressure.
- The ceiling is a measured threshold for this machine, Node version, and current background load; cloud numbers will differ.
