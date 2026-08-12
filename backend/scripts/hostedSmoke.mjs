const frontendUrl = (process.env.HOSTED_FRONTEND_URL || 'https://socratic-arena.vercel.app').replace(/\/$/, '');
const configuredBackendUrl = (process.env.HOSTED_BACKEND_URL || '').replace(/\/$/, '');
const attempts = Math.max(1, Number(process.env.HOSTED_SMOKE_ATTEMPTS) || 16);
const retryDelayMs = Math.max(250, Number(process.env.HOSTED_SMOKE_RETRY_MS) || 15_000);

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const fetchOk = async (url, options = {}) => {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000), ...options });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
};

const withRetry = async (label, operation) => {
  let latestError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      latestError = error;
      console.warn(`[hosted-smoke] ${label} attempt ${attempt}/${attempts}: ${error.message}`);
      if (attempt < attempts) await wait(retryDelayMs);
    }
  }
  throw latestError;
};

const discoverBackendUrl = async (html) => {
  const assetPaths = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi)].map(match => match[1]);
  for (const assetPath of assetPaths) {
    const assetUrl = new URL(assetPath, frontendUrl).href;
    const bundle = await (await fetchOk(assetUrl)).text();
    const normalized = bundle.replaceAll('\\/', '/');
    const match = normalized.match(/https:\/\/[a-z0-9.-]+\.onrender\.com/gi)?.[0];
    if (match) return match.replace(/\/$/, '');
  }
  return '';
};

const frontendResponse = await withRetry('Vercel frontend', () => fetchOk(frontendUrl));
const html = await frontendResponse.text();
if (!/<title>[^<]*Socratic[^<]*<\/title>/i.test(html) && !/Socratic Arena/i.test(html)) {
  throw new Error('Vercel returned HTML that does not identify Socratic Arena');
}

const backendUrl = configuredBackendUrl || await discoverBackendUrl(html);
if (!backendUrl) {
  throw new Error('Render backend URL was not configured and could not be discovered from the deployed Vercel bundle');
}

const health = await withRetry('Render health', async () => (await fetchOk(`${backendUrl}/health`)).json());
if (!health.success) throw new Error('Render health response was not successful');

const readiness = await withRetry('Render dependencies', async () => {
  const response = await fetchOk(`${backendUrl}/ready`);
  const body = await response.json();
  if (!body.success) throw new Error(`Dependency readiness failed: ${JSON.stringify(body.components)}`);
  return body;
});

for (const component of ['supabase', 'redisRealtime', 'redisRateLimit']) {
  if (!readiness.components?.[component]?.ready) throw new Error(`${component} was not ready`);
}
if (process.env.HOSTED_SMOKE_REQUIRE_REDIS !== 'false') {
  for (const component of ['redisRealtime', 'redisRateLimit']) {
    if (!readiness.components?.[component]?.required) throw new Error(`${component} is not configured in the hosted backend`);
  }
}

console.log(JSON.stringify({
  success: true,
  checked: {
    vercel: frontendUrl,
    render: backendUrl,
    supabase: readiness.components.supabase,
    redisRealtime: readiness.components.redisRealtime,
    redisRateLimit: readiness.components.redisRateLimit,
  },
  appVersion: readiness.appVersion,
  timestamp: readiness.timestamp,
}, null, 2));
