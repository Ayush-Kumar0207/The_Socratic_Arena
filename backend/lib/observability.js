import client from 'prom-client';

const METRIC_PREFIX = 'socratic_arena_';
const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: METRIC_PREFIX,
  eventLoopMonitoringPrecision: 20,
});

const httpRequestDurationSeconds = new client.Histogram({
  name: `${METRIC_PREFIX}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

const httpRequestsTotal = new client.Counter({
  name: `${METRIC_PREFIX}http_requests_total`,
  help: 'Total HTTP requests received by the backend.',
  labelNames: ['method', 'route', 'status_code'],
});

const socketConnections = new client.Gauge({
  name: `${METRIC_PREFIX}socket_connections`,
  help: 'Currently connected Socket.IO clients.',
});

const socketEventsTotal = new client.Counter({
  name: `${METRIC_PREFIX}socket_events_total`,
  help: 'Total inbound Socket.IO events handled by the backend.',
  labelNames: ['event'],
});

const activeMatches = new client.Gauge({
  name: `${METRIC_PREFIX}active_matches`,
  help: 'Current in-memory active debate rooms.',
});

const waitingQueuePlayers = new client.Gauge({
  name: `${METRIC_PREFIX}waiting_queue_players`,
  help: 'Current players waiting in matchmaking queues.',
});

const matchEventsTotal = new client.Counter({
  name: `${METRIC_PREFIX}match_events_total`,
  help: 'Match lifecycle events observed by the backend.',
  labelNames: ['event'],
});

const aiRequestsTotal = new client.Counter({
  name: `${METRIC_PREFIX}ai_requests_total`,
  help: 'Gemini AI requests attempted by the backend.',
  labelNames: ['status', 'mode'],
});

const aiRequestDurationSeconds = new client.Histogram({
  name: `${METRIC_PREFIX}ai_request_duration_seconds`,
  help: 'Gemini AI request duration in seconds.',
  labelNames: ['status', 'mode'],
  buckets: [0.25, 0.5, 1, 2, 5, 10, 20, 40, 80],
});

const alertsReceivedTotal = new client.Counter({
  name: `${METRIC_PREFIX}alerts_received_total`,
  help: 'Alertmanager webhook alerts received by the backend.',
  labelNames: ['status'],
});

register.registerMetric(httpRequestDurationSeconds);
register.registerMetric(httpRequestsTotal);
register.registerMetric(socketConnections);
register.registerMetric(socketEventsTotal);
register.registerMetric(activeMatches);
register.registerMetric(waitingQueuePlayers);
register.registerMetric(matchEventsTotal);
register.registerMetric(aiRequestsTotal);
register.registerMetric(aiRequestDurationSeconds);
register.registerMetric(alertsReceivedTotal);

let connectedSockets = 0;

const sanitizeLabel = (value, fallback = 'unknown') => {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.replace(/[^a-zA-Z0-9_:./-]/g, '_').slice(0, 120);
};

const normalizeRoute = (req) => {
  if (req.route?.path) {
    const routePath = Array.isArray(req.route.path) ? req.route.path[0] : req.route.path;
    return sanitizeLabel(`${req.baseUrl || ''}${routePath}`);
  }

  return sanitizeLabel(
    (req.path || req.originalUrl || 'unknown')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':uuid')
      .replace(/\b\d+\b/g, ':num')
  );
};

export const observeHttpRequests = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (req.path === '/metrics') return;

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
};

export const metricsHandler = async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
};

export const recordSocketConnection = (delta) => {
  connectedSockets = Math.max(0, connectedSockets + delta);
  socketConnections.set(connectedSockets);
};

export const recordSocketEvent = (eventName) => {
  socketEventsTotal.inc({ event: sanitizeLabel(eventName) });
};

export const setRuntimeGauges = ({ activeMatchCount, waitingPlayerCount }) => {
  activeMatches.set(Math.max(0, activeMatchCount || 0));
  waitingQueuePlayers.set(Math.max(0, waitingPlayerCount || 0));
};

export const recordMatchEvent = (eventName) => {
  matchEventsTotal.inc({ event: sanitizeLabel(eventName) });
};

export const recordAiRequest = ({ status, mode, durationSeconds }) => {
  const labels = {
    status: sanitizeLabel(status),
    mode: sanitizeLabel(mode),
  };
  aiRequestsTotal.inc(labels);
  aiRequestDurationSeconds.observe(labels, Math.max(0, durationSeconds || 0));
};

export const recordAlertReceived = (status = 'firing') => {
  alertsReceivedTotal.inc({ status: sanitizeLabel(status) });
};

export { register };
