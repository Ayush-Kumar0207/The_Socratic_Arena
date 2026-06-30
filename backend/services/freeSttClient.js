const DEFAULT_STT_SERVICE_URL = 'http://127.0.0.1:5055';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_STATUS_TIMEOUT_MS = 1500;
const DEFAULT_MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const normalizeServiceUrl = (url) => String(url || DEFAULT_STT_SERVICE_URL).replace(/\/+$/, '');

export const freeSttConfig = {
  enabled: process.env.FREE_STT_ENABLED !== 'false',
  serviceUrl: normalizeServiceUrl(process.env.FREE_STT_URL || process.env.STT_SERVICE_URL),
  timeoutMs: Number(process.env.FREE_STT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  statusTimeoutMs: Number(process.env.FREE_STT_STATUS_TIMEOUT_MS || DEFAULT_STATUS_TIMEOUT_MS),
  maxAudioBytes: Number(process.env.FREE_STT_MAX_AUDIO_BYTES || DEFAULT_MAX_AUDIO_BYTES),
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

export const getFreeSttStatus = async () => {
  if (!freeSttConfig.enabled) {
    return {
      enabled: false,
      healthy: false,
      engine: 'disabled',
      mode: 'self-hosted-free',
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${freeSttConfig.serviceUrl}/health`,
      { method: 'GET' },
      freeSttConfig.statusTimeoutMs
    );

    const payload = await response.json().catch(() => ({}));
    return {
      enabled: true,
      healthy: response.ok,
      mode: 'self-hosted-free',
      serviceUrl: freeSttConfig.serviceUrl,
      ...payload,
    };
  } catch (err) {
    return {
      enabled: true,
      healthy: false,
      mode: 'self-hosted-free',
      serviceUrl: freeSttConfig.serviceUrl,
      error: err.name === 'AbortError' ? 'STT health check timed out' : err.message,
    };
  }
};

export const transcribeAudioBuffer = async ({
  buffer,
  mimeType = 'audio/webm',
  filename = 'speech.webm',
  language = 'en',
}) => {
  if (!freeSttConfig.enabled) {
    const err = new Error('Free STT service is disabled');
    err.statusCode = 503;
    throw err;
  }

  if (!buffer?.length) {
    const err = new Error('No audio data received');
    err.statusCode = 400;
    throw err;
  }

  if (buffer.length > freeSttConfig.maxAudioBytes) {
    const err = new Error('Audio chunk is too large');
    err.statusCode = 413;
    throw err;
  }

  const formData = new FormData();
  formData.append('audio', new Blob([buffer], { type: mimeType }), filename);
  formData.append('language', language || 'en');

  const response = await fetchWithTimeout(
    `${freeSttConfig.serviceUrl}/transcribe`,
    { method: 'POST', body: formData },
    freeSttConfig.timeoutMs
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.message || payload.detail || `STT service failed with ${response.status}`);
    err.statusCode = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
};
