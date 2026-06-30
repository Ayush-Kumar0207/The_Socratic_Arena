# Socratic Arena Robustness Breakdown Run

Generated: 2026-06-30T07:31:08.370Z

Target: `http://localhost:5000`  
Prometheus: `http://localhost:9090`  
Per-stage duration: 3s  
Stop rule: p95 > 2000ms or failure rate > 5.0%

## Executive Result

- HTTP ceiling: 10 target RPS passed; no ceiling observed in configured run.
- Socket handshake ceiling: 2/s passed; no socket ceiling observed in configured run.
- Backend health after run: healthy.

## HTTP Ramp

| Target RPS | Achieved RPS | Requests | Failure Rate | p50 ms | p95 ms | p99 ms | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---|
| 10 | 10.0 | 30 | 0.00% | 3.7 | 9.8 | 12.5 | PASS |

## Socket.IO Authentication Pressure

This stage intentionally uses invalid JWTs. A clean `Authentication Error` is counted as success because it proves the backend rejected unauthenticated socket pressure without accepting bogus users.

| Target handshakes/s | Achieved/s | Attempts | Failure Rate | p95 ms | Verdict |
|---:|---:|---:|---:|---:|---|
| 2 | 2.0 | 6 | 0.00% | 798.0 | PASS |

## Metrics Snapshot

### Before

```json
{
  "processResidentMemoryBytes": 39145472,
  "heapUsedBytes": 26477552,
  "eventLoopLagSeconds": 0.0021842,
  "socketConnections": 0,
  "activeMatches": 0,
  "waitingQueuePlayers": 0
}
```

### After

```json
{
  "processResidentMemoryBytes": 52895744,
  "heapUsedBytes": 23052544,
  "eventLoopLagSeconds": 0.0044303,
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
        1782804677.92,
        "1"
      ]
    }
  ],
  "requestRate": [
    {
      "metric": {},
      "value": [
        1782804677.938,
        "0"
      ]
    }
  ],
  "p95Latency": [
    {
      "metric": {},
      "value": [
        1782804677.945,
        "NaN"
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
        1782804677.951,
        "39096320"
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
        1782804677.956,
        "0.0018935"
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
