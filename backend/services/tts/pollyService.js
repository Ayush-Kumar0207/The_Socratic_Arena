import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { buildPollyUsage, measuredProviderResult } from '../../lib/providerUsage.js';

export const MAX_TTS_CHARACTERS = Math.max(
  100,
  Math.min(Number(process.env.POLLY_MAX_CHARACTERS) || 2800, 3000),
);

const isEnabled = () => `${process.env.TTS_ENABLED || 'false'}`.toLowerCase() === 'true';

export const getTtsCapabilities = () => ({
  enabled: isEnabled() && Boolean(process.env.AWS_REGION),
  provider: 'amazon-polly',
  maxCharacters: MAX_TTS_CHARACTERS,
});

export const validateTtsText = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error('TTS text is required.');
    error.statusCode = 400;
    throw error;
  }
  const text = value.trim();
  if (text.length > MAX_TTS_CHARACTERS) {
    const error = new Error(`TTS text cannot exceed ${MAX_TTS_CHARACTERS} characters.`);
    error.statusCode = 413;
    throw error;
  }
  return text;
};

const audioStreamToBuffer = async (stream) => {
  if (!stream) throw new Error('Amazon Polly returned no audio stream.');
  if (typeof stream.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }
  if (stream instanceof Uint8Array || Buffer.isBuffer(stream)) return Buffer.from(stream);
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error('Amazon Polly returned an unsupported audio stream.');
};

export const createPollyService = ({ client = null } = {}) => {
  const capabilities = getTtsCapabilities();
  const pollyClient = client || (capabilities.enabled
    ? new PollyClient({ region: process.env.AWS_REGION })
    : null);

  const synthesizeDetailed = async (value) => {
      const text = validateTtsText(value);
      if (!capabilities.enabled && !client) {
        const error = new Error('Voice output is not configured.');
        error.statusCode = 503;
        error.code = 'TTS_DISABLED';
        throw error;
      }

      try {
        const response = await pollyClient.send(new SynthesizeSpeechCommand({
          Text: text,
          TextType: 'text',
          OutputFormat: 'mp3',
          VoiceId: process.env.POLLY_VOICE_ID || 'Joanna',
          Engine: process.env.POLLY_ENGINE || 'standard',
        }));
        const audio = await audioStreamToBuffer(response.AudioStream);
        if (!audio.length) throw new Error('Amazon Polly returned empty audio.');
        return {
          audio,
          usage: buildPollyUsage({
            characters: text.length,
            engine: process.env.POLLY_ENGINE || 'standard',
            requestId: response?.$metadata?.requestId || null,
          }),
        };
      } catch (cause) {
        console.error('[Amazon Polly] Synthesis failed:', {
          name: cause?.name || 'UnknownError',
          requestId: cause?.$metadata?.requestId || null,
          statusCode: cause?.$metadata?.httpStatusCode || null,
        });
        const error = new Error('Voice synthesis is temporarily unavailable.');
        error.statusCode = 502;
        error.code = 'TTS_SYNTHESIS_FAILED';
        throw error;
      }
    };

  return {
    capabilities,
    synthesize: async value => (await synthesizeDetailed(value)).audio,
    synthesizeMeasured: async value => {
      const result = await synthesizeDetailed(value);
      return measuredProviderResult(result.audio, result.usage);
    },
  };
};
