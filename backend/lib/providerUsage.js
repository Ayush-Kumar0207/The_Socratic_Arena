const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const nonNegativeInt = value => Math.max(0, Math.floor(finite(value)));
const configuredRate = (name, fallback) => Math.max(0, finite(process.env[name] ?? fallback));

const geminiRates = () => ({
  inputUsdPerMillion: configuredRate('GEMINI_INPUT_USD_PER_MILLION', 0.30),
  outputUsdPerMillion: configuredRate('GEMINI_OUTPUT_USD_PER_MILLION', 2.50),
  cachedInputUsdPerMillion: configuredRate('GEMINI_CACHED_INPUT_USD_PER_MILLION', 0.03),
});

const pollyRate = engine => configuredRate(
  `POLLY_${String(engine || 'standard').replaceAll('-', '_').toUpperCase()}_USD_PER_MILLION_CHARACTERS`,
  ({ standard: 4, neural: 16, 'long-form': 100, generative: 30 })[engine] ?? 4,
);

const microsFromMillionRate = (units, usdPerMillion) => Math.max(
  0,
  Math.round((nonNegativeInt(units) * finite(usdPerMillion) * 1_000_000) / 1_000_000),
);

export const measuredProviderResult = (value, providerUsage) => ({
  __socraticMeasuredProviderResult: true,
  value,
  providerUsage,
});

export const unwrapMeasuredProviderResult = result => result?.__socraticMeasuredProviderResult === true
  ? { value: result.value, providerUsage: result.providerUsage || null }
  : { value: result, providerUsage: null };

export const buildGeminiUsage = ({ usageMetadata = {}, model = 'gemini-2.5-flash', requestId = null } = {}) => {
  const inputTokens = nonNegativeInt(usageMetadata.promptTokenCount ?? usageMetadata.input_tokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeInt(usageMetadata.cachedContentTokenCount ?? usageMetadata.input_token_details?.cache_read));
  const outputTokens = nonNegativeInt(usageMetadata.candidatesTokenCount ?? usageMetadata.output_tokens);
  const thinkingTokens = nonNegativeInt(usageMetadata.thoughtsTokenCount ?? usageMetadata.output_token_details?.reasoning);
  const rates = geminiRates();
  const paidTier = String(process.env.GEMINI_BILLING_TIER || 'paid').toLowerCase() !== 'free';
  const listCostMicros = paidTier ? (
    microsFromMillionRate(inputTokens - cachedInputTokens, rates.inputUsdPerMillion)
    + microsFromMillionRate(cachedInputTokens, rates.cachedInputUsdPerMillion)
    + microsFromMillionRate(outputTokens + thinkingTokens, rates.outputUsdPerMillion)
  ) : 0;
  return {
    provider: 'google-gemini',
    service: 'generate-content',
    model,
    requestId,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens: nonNegativeInt(usageMetadata.totalTokenCount ?? usageMetadata.total_tokens) || inputTokens + outputTokens + thinkingTokens,
    costMicros: listCostMicros,
    costSource: paidTier ? 'measured_units_configured_rate' : 'measured_units_free_tier',
    rates: { ...rates, currency: 'USD', effectiveModel: model },
  };
};

export const aggregateProviderUsages = usages => {
  const valid = (usages || []).filter(item => item?.provider && item?.costSource);
  if (!valid.length) return null;
  const first = valid[0];
  return {
    provider: first.provider,
    service: first.service,
    model: first.model,
    requestCount: valid.length,
    inputTokens: valid.reduce((sum, item) => sum + nonNegativeInt(item.inputTokens), 0),
    cachedInputTokens: valid.reduce((sum, item) => sum + nonNegativeInt(item.cachedInputTokens), 0),
    outputTokens: valid.reduce((sum, item) => sum + nonNegativeInt(item.outputTokens), 0),
    thinkingTokens: valid.reduce((sum, item) => sum + nonNegativeInt(item.thinkingTokens), 0),
    totalTokens: valid.reduce((sum, item) => sum + nonNegativeInt(item.totalTokens), 0),
    inputCharacters: valid.reduce((sum, item) => sum + nonNegativeInt(item.inputCharacters), 0),
    costMicros: valid.reduce((sum, item) => sum + nonNegativeInt(item.costMicros), 0),
    costSource: valid.every(item => item.costSource === first.costSource) ? first.costSource : 'mixed_measured_rates',
    rates: first.rates,
  };
};

export const buildPollyUsage = ({ characters, engine = 'standard', requestId = null } = {}) => {
  const inputCharacters = nonNegativeInt(characters);
  const usdPerMillionCharacters = pollyRate(engine);
  return {
    provider: 'amazon-polly',
    service: 'synthesize-speech',
    model: engine,
    requestId,
    inputCharacters,
    costMicros: microsFromMillionRate(inputCharacters, usdPerMillionCharacters),
    costSource: 'measured_units_configured_rate',
    rates: { usdPerMillionCharacters, currency: 'USD', engine },
  };
};

export const sanitizeProviderUsage = usage => {
  if (!usage || typeof usage !== 'object') return { costMicros: 0, metadata: { costSource: 'unmeasured' } };
  const metadata = JSON.parse(JSON.stringify(usage));
  return { costMicros: nonNegativeInt(usage.costMicros), metadata };
};

export { microsFromMillionRate };
