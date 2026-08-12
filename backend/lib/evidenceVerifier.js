import dns from 'dns/promises';
import net from 'net';

const EMPIRICAL_SIGNAL = /\b(study|research|data|survey|report|statistics?|percent|million|billion|increased|decreased|causes?|proves?|according to)\b/i;
const URL_PATTERN = /https?:\/\/[^\s<>)\]}"']+/gi;
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export const extractEvidenceClaims = (text = '') => String(text)
  .split(/(?<=[.!?])\s+/)
  .map(value => value.trim())
  .filter(value => value.length >= 25 && EMPIRICAL_SIGNAL.test(value))
  .slice(0, 12);

export const extractEvidenceUrls = (text = '') => [...new Set(
  (String(text).match(URL_PATTERN) || []).map(value => value.replace(/[.,;:!?]+$/g, '')),
)].slice(0, 8);

const isPrivateAddress = (address) => {
  if (net.isIP(address) === 4) return PRIVATE_IPV4.test(address) || address === '0.0.0.0';
  if (net.isIP(address) === 6) return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
  return false;
};

export const assertPublicSourceUrl = async (rawUrl, lookup = dns.lookup) => {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported source protocol');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || isPrivateAddress(host)) throw new Error('Private source addresses are not allowed');
  const addresses = await lookup(host, { all: true });
  if (!addresses?.length || addresses.some(result => isPrivateAddress(result.address))) throw new Error('Source resolved to a private address');
  return url;
};

const stripMarkup = (input = '') => String(input)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokens = (input) => new Set(String(input).toLowerCase().match(/[a-z0-9]{4,}/g) || []);
const overlap = (claim, sourceText) => {
  const claimTokens = tokens(claim);
  const sourceTokens = tokens(sourceText);
  if (!claimTokens.size) return 0;
  return [...claimTokens].filter(token => sourceTokens.has(token)).length / claimTokens.size;
};

const sourceAuthority = (hostname) => {
  const host = hostname.toLowerCase();
  if (/\.(gov|gov\.[a-z]{2}|edu|ac\.[a-z]{2})$/.test(host)) return 'primary_or_academic';
  if (host.includes('who.int') || host.includes('un.org') || host.includes('worldbank.org') || host.includes('oecd.org')) return 'intergovernmental';
  if (host.includes('doi.org') || host.includes('pubmed') || host.includes('nature.com') || host.includes('science.org')) return 'research_publisher';
  return 'general_web';
};

export const retrieveEvidenceSource = async (rawUrl, { fetchImpl = fetch, lookup = dns.lookup } = {}) => {
  let current = await assertPublicSourceUrl(rawUrl, lookup);
  for (let redirect = 0; redirect < 3; redirect += 1) {
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'SocraticArena-EvidenceVerifier/1.0', Accept: 'text/html,text/plain,application/json' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Source redirected without a location');
      current = await assertPublicSourceUrl(new URL(location, current).toString(), lookup);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!/text|json|html/i.test(contentType)) throw new Error('Source content is not readable text');
    const raw = (await response.text()).slice(0, 300000);
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || current.hostname;
    return {
      url: current.toString(),
      title: stripMarkup(title).slice(0, 180),
      hostname: current.hostname,
      authority: sourceAuthority(current.hostname),
      retrieved_at: new Date().toISOString(),
      text: stripMarkup(raw).slice(0, 120000),
    };
  }
  throw new Error('Too many source redirects');
};

export const verifyEvidence = async (text, options = {}) => {
  const claims = extractEvidenceClaims(text);
  const urls = extractEvidenceUrls(text);
  const sources = [];
  for (const url of urls) {
    try {
      sources.push(await retrieveEvidenceSource(url, options));
    } catch (error) {
      sources.push({ url, reachable: false, error: error.message });
    }
  }
  const checkedClaims = claims.map(claim => {
    const ranked = sources
      .filter(source => source.text)
      .map(source => ({ source, similarity: overlap(claim.replace(URL_PATTERN, ''), source.text) }))
      .sort((a, b) => b.similarity - a.similarity);
    const best = ranked[0];
    const support = best?.similarity >= 0.55 ? 'supported_by_cited_source' : best?.similarity >= 0.25 ? 'partially_supported' : 'not_verified';
    return { claim, status: support, similarity: Number((best?.similarity || 0).toFixed(2)), source_url: best?.source?.url || null };
  });
  const unverified = checkedClaims.filter(claim => claim.status === 'not_verified').length;
  return {
    claims: checkedClaims,
    sources: sources.map(({ text: _text, ...source }) => ({ ...source, reachable: source.reachable !== false })),
    citations_detected: urls.length,
    claims_requiring_sources: claims.length,
    verified_claims: checkedClaims.filter(claim => claim.status === 'supported_by_cited_source').length,
    unverifiable_claims: unverified,
    risk: unverified > 2 || sources.some(source => source.reachable === false) ? 'review' : 'low',
    methodology: 'Cited sources are retrieved with SSRF protection and claim/source lexical support is measured. A match is not proof of truth; human review remains available.',
  };
};
