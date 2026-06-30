import http from 'http';

const PORT = Number(process.env.PORT || 9088);
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '';

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      req.destroy();
      reject(new Error('Payload too large'));
    }
  });
  req.on('end', () => {
    if (!body) {
      resolve({});
      return;
    }

    try {
      resolve(JSON.parse(body));
    } catch (err) {
      reject(err);
    }
  });
  req.on('error', reject);
});

const summarizeAlerts = (payload) => {
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  if (alerts.length === 0) return 'Prometheus alert received without alert details.';

  return alerts.slice(0, 8).map((alert) => {
    const labels = alert.labels || {};
    const annotations = alert.annotations || {};
    const status = (alert.status || payload.status || 'firing').toUpperCase();
    const severity = labels.severity ? `/${labels.severity}` : '';
    const name = labels.alertname || 'UnnamedAlert';
    const summary = annotations.summary || annotations.description || 'No summary provided.';
    return `[${status}${severity}] ${name}: ${summary}`;
  }).join('\n');
};

const sendExternalNotification = async (message) => {
  if (!ALERT_WEBHOOK_URL) return { forwarded: false, reason: 'ALERT_WEBHOOK_URL is not set' };

  const isSlack = ALERT_WEBHOOK_URL.includes('hooks.slack.com');
  const body = isSlack ? { text: message } : { content: message };

  const response = await fetch(ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
  }

  return { forwarded: true };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, service: 'socratic-arena-alert-relay' }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/alertmanager') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Route not found' }));
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const message = `Socratic Arena performance alert\n${summarizeAlerts(payload)}`;
    const result = await sendExternalNotification(message);

    console.warn(message);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (err) {
    console.error('[alert-relay] Failed to process alert:', err.message || err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: err.message || 'Alert relay failed' }));
  }
});

server.listen(PORT, () => {
  console.log(`Socratic Arena alert relay listening on ${PORT}`);
});
