# Socratic Arena Robustness Breakdown Run

Generated: 2026-06-30T07:31:34.594Z

Target: `http://localhost:5000`  
Prometheus: `http://localhost:9090`  
Per-stage duration: 8s  
Stop rule: p95 > 2000ms or failure rate > 5.0%

## Executive Result

- HTTP ceiling: 250 target RPS passed; first ceiling observed at 500 target RPS.
- Socket handshake ceiling: 25/s passed; first ceiling observed at 50/s.
- Backend health after run: healthy.

## HTTP Ramp

| Target RPS | Achieved RPS | Requests | Failure Rate | p50 ms | p95 ms | p99 ms | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---|
| 250 | 249.9 | 1999 | 0.00% | 2.5 | 14.9 | 32.3 | PASS |
| 500 | 499.9 | 3999 | 6.38% | 187.3 | 2326.5 | 3175.2 | CEILING |

## Socket.IO Authentication Pressure

This stage intentionally uses invalid JWTs. A clean `Authentication Error` is counted as success because it proves the backend rejected unauthenticated socket pressure without accepting bogus users.

| Target handshakes/s | Achieved/s | Attempts | Failure Rate | p95 ms | Verdict |
|---:|---:|---:|---:|---:|---|
| 25 | 25.0 | 200 | 0.00% | 1289.6 | PASS |
| 50 | 50.1 | 401 | 0.00% | 15361.5 | CEILING |

## Metrics Snapshot

### Before

```json
{
  "processResidentMemoryBytes": 52936704,
  "heapUsedBytes": 23505552,
  "eventLoopLagSeconds": 0.0025033,
  "socketConnections": 0,
  "activeMatches": 0,
  "waitingQueuePlayers": 0
}
```

### After

```json
{
  "processResidentMemoryBytes": 79695872,
  "heapUsedBytes": 28429864,
  "eventLoopLagSeconds": 0.0364483,
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
        1782804748.389,
        "1"
      ]
    }
  ],
  "requestRate": [
    {
      "metric": {},
      "value": [
        1782804748.398,
        "40.128897145652196"
      ]
    }
  ],
  "p95Latency": [
    {
      "metric": {},
      "value": [
        1782804748.405,
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
        1782804748.44,
        "164626432"
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
        1782804748.443,
        "0.0292277"
      ]
    }
  ]
}
```

## Screenshot Evidence

Screenshots for this run should be stored beside this report under `screenshots/`:

- `screenshots/grafana-dashboard.png`
- `screenshots/prometheus-query.png`
- `screenshots/alertmanager-alerts.png`

## Notes And Limits

- This run targets local infrastructure only by default. Do not run destructive load against Vercel/Render/Supabase without explicit provider-approved limits.
- Authenticated full-match pressure requires seeded test users and valid Supabase JWTs. This report therefore separates public HTTP pressure from unauthenticated socket rejection pressure.
- The ceiling is a measured threshold for this machine, Node version, and current background load; cloud numbers will differ.
