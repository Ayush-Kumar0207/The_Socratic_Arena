#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TARGET = 'http://localhost:5000';
const DEFAULT_PROMETHEUS = 'http://localhost:9090';
const DEFAULT_STAGES = [50, 100, 200, 400, 800, 1200, 1600];
const DEFAULT_DURATION_SECONDS = 12;
const DEFAULT_LATENCY_CEILING_MS = 2000;
const DEFAULT_ERROR_CEILING = 0.05;
const DEFAULT_CONCURRENCY = 512;
const DEFAULT_SOCKET_STAGES = [10, 25, 50, 100, 200];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nowIsoForPath = () => new Date().toISOString().replace(/[:.]/g, '-');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    target: DEFAULT_TARGET,
    prometheus: DEFAULT_PROMETHEUS,
    outDir: path.join(ROOT, 'docs', 'robustness', 'runs', nowIsoForPath()),
    stages: DEFAULT_STAGES,
    socketStages: DEFAULT_SOCKET_STAGES,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    latencyCeilingMs: DEFAULT_LATENCY_CEILING_MS,
    errorCeiling: DEFAULT_ERROR_CEILING,
    concurrency: DEFAULT_CONCURRENCY,
    includeSockets: true,
    allowNonLocal: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--target') options.target = next, i += 1;
    else if (arg === '--prometheus') options.prometheus = next, i += 1;
    else if (arg === '--out-dir') options.outDir = path.resolve(next), i += 1;
    else if (arg === '--stages') options.stages = next.split(',').map(Number).filter(Boolean), i += 1;
    else if (arg === '--socket-stages') options.socketStages = next.split(',').map(Number).filter(Boolean), i += 1;
    else if (arg === '--duration') options.durationSeconds = Number(next), i += 1;
    else if (arg === '--latency-ceiling-ms') options.latencyCeilingMs = Number(next), i += 1;
    else if (arg === '--error-ceiling') options.errorCeiling = Number(next), i += 1;
    else if (arg === '--concurrency') options.concurrency = Number(next), i += 1;
    else if (arg === '--no-sockets') options.includeSockets = false;
    else if (arg === '--allow-non-local') options.allowNonLocal = true;
    else if (arg === '--help') {
      console.log(`Usage: node tools/robustness/breakdown-runner.mjs [options]

Options:
  --target <url>              Backend base URL. Defaults to ${DEFAULT_TARGET}
  --prometheus <url>          Prometheus base URL. Defaults to ${DEFAULT_PROMETHEUS}
  --out-dir <path>            Output directory for results and report
  --stages <csv>              HTTP RPS stages. Defaults to ${DEFAULT_STAGES.join(',')}
  --socket-stages <csv>       Socket handshakes/sec stages. Defaults to ${DEFAULT_SOCKET_STAGES.join(',')}
  --duration <seconds>        Seconds per stage. Defaults to ${DEFAULT_DURATION_SECONDS}
  --latency-ceiling-ms <ms>   Stop when p95 exceeds this. Defaults to ${DEFAULT_LATENCY_CEILING_MS}
  --error-ceiling <ratio>     Stop when failure ratio exceeds this. Defaults to ${DEFAULT_ERROR_CEILING}
  --concurrency <count>       Max in-flight HTTP requests. Defaults to ${DEFAULT_CONCURRENCY}
  --no-sockets                Skip Socket.IO handshake pressure
  --allow-non-local           Permit non-local targets. Use only for owned infrastructure.
`);
      process.exit(0);
    }
  }

  return options;
};

const isLocalTarget = (urlString) => {
  const url = new URL(urlString);
  return (
    url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '::1'
    || url.hostname.startsWith('127.')
  );
};

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};

const summarizeSamples = (samples, expectedStatuses = new Set([200, 404])) => {
  const latencies = samples.filter((s) => Number.isFinite(s.latencyMs)).map((s) => s.latencyMs);
  const failures = samples.filter((s) => (
    s.error || s.status >= 500 || !expectedStatuses.has(s.status)
  ));

  return {
    requests: samples.length,
    failures: failures.length,
    failureRate: samples.length ? failures.length / samples.length : 0,
    statusCounts: samples.reduce((acc, sample) => {
      const key = sample.error ? `ERR:${sample.error}` : String(sample.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
  };
};

const weightedPath = () => {
  const roll = Math.random();
  if (roll < 0.68) return { method: 'GET', path: '/health', expected: 200 };
  if (roll < 0.78) return { method: 'GET', path: '/metrics', expected: 200 };
  if (roll < 0.9) return { method: 'GET', path: `/__robustness_missing_${Math.floor(Math.random() * 1e9)}`, expected: 404 };
  return { method: 'POST', path: '/api/__robustness_missing', expected: 404, body: { probe: true, payload: 'x'.repeat(512) } };
};

const timedFetch = async (target, requestSpec) => {
  const url = `${target}${requestSpec.path}`;
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: requestSpec.method,
      headers: requestSpec.body ? { 'Content-Type': 'application/json' } : undefined,
      body: requestSpec.body ? JSON.stringify(requestSpec.body) : undefined,
      signal: AbortSignal.timeout(7000),
    });

    await response.arrayBuffer();
    return {
      status: response.status,
      expected: requestSpec.expected,
      latencyMs: performance.now() - startedAt,
    };
  } catch (err) {
    return {
      status: 0,
      expected: requestSpec.expected,
      error: err.name || err.message || 'fetch_error',
      latencyMs: performance.now() - startedAt,
    };
  }
};

const runHttpStage = async (options, rps) => {
  const samples = [];
  const pending = new Set();
  const endAt = Date.now() + options.durationSeconds * 1000;
  const intervalMs = 1000 / rps;
  let nextAt = performance.now();

  while (Date.now() < endAt) {
    while (pending.size >= options.concurrency) {
      await Promise.race(pending);
    }

    const requestSpec = weightedPath();
    const promise = timedFetch(options.target, requestSpec)
      .then((sample) => samples.push(sample))
      .finally(() => pending.delete(promise));
    pending.add(promise);

    nextAt += intervalMs;
    const waitMs = nextAt - performance.now();
    if (waitMs > 0) await sleep(waitMs);
  }

  await Promise.allSettled(pending);

  const summary = summarizeSamples(samples);
  return {
    type: 'http',
    targetRps: rps,
    durationSeconds: options.durationSeconds,
    achievedRps: summary.requests / options.durationSeconds,
    ...summary,
    passed: summary.failureRate <= options.errorCeiling && summary.latencyMs.p95 <= options.latencyCeilingMs,
  };
};

const loadSocketIoClient = () => {
  try {
    const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'package.json'));
    return frontendRequire('socket.io-client');
  } catch (err) {
    console.warn(`[robustness] Socket.IO client unavailable, skipping socket stages: ${err.message}`);
    return null;
  }
};

const runSocketStage = async (options, handshakesPerSecond) => {
  const socketModule = loadSocketIoClient();
  if (!socketModule?.io) {
    return {
      type: 'socket-handshake',
      targetHandshakesPerSecond: handshakesPerSecond,
      skipped: true,
      reason: 'socket.io-client was not available',
      passed: true,
    };
  }

  const { io } = socketModule;
  const samples = [];
  const sockets = new Set();
  const endAt = Date.now() + options.durationSeconds * 1000;
  const intervalMs = 1000 / handshakesPerSecond;
  let nextAt = performance.now();

  const onceConnect = () => new Promise((resolve) => {
    const startedAt = performance.now();
    const socket = io(options.target, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 2500,
      auth: { token: `invalid-load-test-token-${Math.random().toString(36).slice(2)}` },
    });

    sockets.add(socket);
    const done = (sample) => {
      sockets.delete(socket);
      socket.close();
      resolve({
        latencyMs: performance.now() - startedAt,
        ...sample,
      });
    };

    socket.on('connect', () => done({ status: 'unexpected_connect', failure: true }));
    socket.on('connect_error', (err) => {
      const expected = /Authentication Error/i.test(err?.message || '');
      done({ status: expected ? 'auth_rejected' : 'connect_error', failure: !expected, message: err?.message || '' });
    });
  });

  const pending = new Set();
  while (Date.now() < endAt) {
    const promise = onceConnect()
      .then((sample) => samples.push(sample))
      .finally(() => pending.delete(promise));
    pending.add(promise);

    nextAt += intervalMs;
    const waitMs = nextAt - performance.now();
    if (waitMs > 0) await sleep(waitMs);
  }

  await Promise.allSettled(pending);
  sockets.forEach((socket) => socket.close());

  const latencies = samples.map((sample) => sample.latencyMs).filter(Number.isFinite);
  const failures = samples.filter((sample) => sample.failure);
  const failureRate = samples.length ? failures.length / samples.length : 0;

  return {
    type: 'socket-handshake',
    targetHandshakesPerSecond: handshakesPerSecond,
    durationSeconds: options.durationSeconds,
    attempts: samples.length,
    achievedHandshakesPerSecond: samples.length / options.durationSeconds,
    authRejected: samples.filter((sample) => sample.status === 'auth_rejected').length,
    failures: failures.length,
    failureRate,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    passed: failureRate <= options.errorCeiling && percentile(latencies, 95) <= options.latencyCeilingMs,
  };
};

const scrapeMetricsSnapshot = async (target) => {
  try {
    const response = await fetch(`${target}/metrics`, { signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    const metric = (name) => {
      const line = text.split('\n').find((candidate) => candidate.startsWith(`${name} `));
      return line ? Number(line.split(/\s+/)[1]) : null;
    };

    return {
      processResidentMemoryBytes: metric('socratic_arena_process_resident_memory_bytes'),
      heapUsedBytes: metric('socratic_arena_nodejs_heap_size_used_bytes'),
      eventLoopLagSeconds: metric('socratic_arena_nodejs_eventloop_lag_seconds'),
      socketConnections: metric('socratic_arena_socket_connections'),
      activeMatches: metric('socratic_arena_active_matches'),
      waitingQueuePlayers: metric('socratic_arena_waiting_queue_players'),
    };
  } catch (err) {
    return { error: err.message };
  }
};

const queryPrometheus = async (baseUrl, query) => {
  try {
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const payload = await response.json();
    return payload?.data?.result || [];
  } catch (err) {
    return { error: err.message };
  }
};

const buildMarkdownReport = (run) => {
  const httpStages = run.stages.filter((stage) => stage.type === 'http');
  const socketStages = run.stages.filter((stage) => stage.type === 'socket-handshake');
  const lastPassedHttp = [...httpStages].reverse().find((stage) => stage.passed);
  const firstFailedHttp = httpStages.find((stage) => !stage.passed);
  const lastPassedSocket = [...socketStages].reverse().find((stage) => stage.passed && !stage.skipped);
  const firstFailedSocket = socketStages.find((stage) => !stage.passed && !stage.skipped);

  const rows = httpStages.map((stage) => (
    `| ${stage.targetRps} | ${stage.achievedRps.toFixed(1)} | ${stage.requests} | ${(stage.failureRate * 100).toFixed(2)}% | ${stage.latencyMs.p50.toFixed(1)} | ${stage.latencyMs.p95.toFixed(1)} | ${stage.latencyMs.p99.toFixed(1)} | ${stage.passed ? 'PASS' : 'CEILING'} |`
  )).join('\n');

  const socketRows = socketStages.map((stage) => (
    stage.skipped
      ? `| ${stage.targetHandshakesPerSecond} | skipped | - | - | - | ${stage.reason} |`
      : `| ${stage.targetHandshakesPerSecond} | ${stage.achievedHandshakesPerSecond.toFixed(1)} | ${stage.attempts} | ${(stage.failureRate * 100).toFixed(2)}% | ${stage.latencyMs.p95.toFixed(1)} | ${stage.passed ? 'PASS' : 'CEILING'} |`
  )).join('\n');

  return `# Socratic Arena Robustness Breakdown Run

Generated: ${run.generatedAt}

Target: \`${run.options.target}\`  
Prometheus: \`${run.options.prometheus}\`  
Per-stage duration: ${run.options.durationSeconds}s  
Stop rule: p95 > ${run.options.latencyCeilingMs}ms or failure rate > ${(run.options.errorCeiling * 100).toFixed(1)}%

## Executive Result

- HTTP ceiling: ${lastPassedHttp ? `${lastPassedHttp.targetRps} target RPS passed` : 'no passing HTTP stage recorded'}${firstFailedHttp ? `; first ceiling observed at ${firstFailedHttp.targetRps} target RPS.` : '; no ceiling observed in configured run.'}
- Socket handshake ceiling: ${lastPassedSocket ? `${lastPassedSocket.targetHandshakesPerSecond}/s passed` : 'no passing socket stage recorded'}${firstFailedSocket ? `; first ceiling observed at ${firstFailedSocket.targetHandshakesPerSecond}/s.` : '; no socket ceiling observed in configured run.'}
- Backend health after run: ${run.postRunHealth?.ok ? 'healthy' : 'unhealthy'}.

## HTTP Ramp

| Target RPS | Achieved RPS | Requests | Failure Rate | p50 ms | p95 ms | p99 ms | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---|
${rows}

## Socket.IO Authentication Pressure

This stage intentionally uses invalid JWTs. A clean \`Authentication Error\` is counted as success because it proves the backend rejected unauthenticated socket pressure without accepting bogus users.

| Target handshakes/s | Achieved/s | Attempts | Failure Rate | p95 ms | Verdict |
|---:|---:|---:|---:|---:|---|
${socketRows}

## Metrics Snapshot

### Before

\`\`\`json
${JSON.stringify(run.beforeMetrics, null, 2)}
\`\`\`

### After

\`\`\`json
${JSON.stringify(run.afterMetrics, null, 2)}
\`\`\`

## Prometheus Queries Captured

\`\`\`json
${JSON.stringify(run.prometheus, null, 2)}
\`\`\`

## Screenshot Evidence

Screenshots for this run should be stored beside this report under \`screenshots/\`:

- \`screenshots/grafana-dashboard.png\`
- \`screenshots/prometheus-query.png\`
- \`screenshots/alertmanager-alerts.png\`

## Notes And Limits

- This run targets local infrastructure only by default. Do not run destructive load against Vercel/Render/Supabase without explicit provider-approved limits.
- Authenticated full-match pressure requires seeded test users and valid Supabase JWTs. This report therefore separates public HTTP pressure from unauthenticated socket rejection pressure.
- The ceiling is a measured threshold for this machine, Node version, and current background load; cloud numbers will differ.
`;
};

const main = async () => {
  const options = parseArgs();
  if (!options.allowNonLocal && !isLocalTarget(options.target)) {
    throw new Error(`Refusing to load test non-local target ${options.target}. Pass --allow-non-local only for owned, approved infrastructure.`);
  }

  await mkdir(options.outDir, { recursive: true });
  const run = {
    generatedAt: new Date().toISOString(),
    options,
    stages: [],
    beforeMetrics: await scrapeMetricsSnapshot(options.target),
  };

  console.log(`[robustness] Target: ${options.target}`);
  console.log(`[robustness] Output: ${options.outDir}`);
  console.log('[robustness] Running HTTP ramp...');

  for (const stageRps of options.stages) {
    const result = await runHttpStage(options, stageRps);
    run.stages.push(result);
    console.log(`[http] target=${stageRps}/s achieved=${result.achievedRps.toFixed(1)}/s p95=${result.latencyMs.p95.toFixed(1)}ms failures=${(result.failureRate * 100).toFixed(2)}% ${result.passed ? 'PASS' : 'CEILING'}`);
    if (!result.passed) break;
    await sleep(1500);
  }

  if (options.includeSockets) {
    console.log('[robustness] Running Socket.IO auth pressure ramp...');
    for (const socketRate of options.socketStages) {
      const result = await runSocketStage(options, socketRate);
      run.stages.push(result);
      if (result.skipped) {
        console.log(`[socket] skipped: ${result.reason}`);
        break;
      }
      console.log(`[socket] target=${socketRate}/s achieved=${result.achievedHandshakesPerSecond.toFixed(1)}/s p95=${result.latencyMs.p95.toFixed(1)}ms failures=${(result.failureRate * 100).toFixed(2)}% ${result.passed ? 'PASS' : 'CEILING'}`);
      if (!result.passed) break;
      await sleep(1500);
    }
  }

  run.afterMetrics = await scrapeMetricsSnapshot(options.target);
  run.postRunHealth = await fetch(`${options.target}/health`, { signal: AbortSignal.timeout(5000) })
    .then((response) => ({ ok: response.ok, status: response.status }))
    .catch((err) => ({ ok: false, error: err.message }));

  run.prometheus = {
    up: await queryPrometheus(options.prometheus, 'up{job="socratic-arena-backend"}'),
    requestRate: await queryPrometheus(options.prometheus, 'sum(rate(socratic_arena_http_requests_total{job="socratic-arena-backend"}[2m]))'),
    p95Latency: await queryPrometheus(options.prometheus, 'histogram_quantile(0.95, sum by (le) (rate(socratic_arena_http_request_duration_seconds_bucket{job="socratic-arena-backend"}[2m])))'),
    memoryBytes: await queryPrometheus(options.prometheus, 'socratic_arena_process_resident_memory_bytes{job="socratic-arena-backend"}'),
    eventLoopLag: await queryPrometheus(options.prometheus, 'socratic_arena_nodejs_eventloop_lag_seconds{job="socratic-arena-backend"}'),
  };

  await writeFile(path.join(options.outDir, 'results.json'), `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(path.join(options.outDir, 'SUMMARY.md'), buildMarkdownReport(run));
  console.log(`[robustness] Wrote ${path.join(options.outDir, 'results.json')}`);
  console.log(`[robustness] Wrote ${path.join(options.outDir, 'SUMMARY.md')}`);
};

main().catch((err) => {
  console.error(`[robustness] ${err.stack || err.message}`);
  process.exit(1);
});
