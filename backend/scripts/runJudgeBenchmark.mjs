import { readFile } from 'fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const dataset = JSON.parse(await readFile(new URL('../benchmarks/judge-calibration.json', import.meta.url), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const cases = dataset.cases || [];
const dimensions = ['language', 'accent_proxy', 'ideology', 'speaking_order'];

if (dataset.label_source !== 'human_rubric_review') throw new Error('Benchmark must declare human_rubric_review labels');
if (cases.length < 8) throw new Error('Benchmark dataset is too small');
for (const item of cases) {
  if (!item.id || !item.pair_group || !dimensions.includes(item.dimension) || !['critic', 'defender'].includes(item.expected_winner) || !item.label_rationale || !Array.isArray(item.transcript)) throw new Error(`Invalid benchmark case: ${item.id || 'unknown'}`);
}

if (dryRun) {
  console.log(JSON.stringify({ valid: true, dataset_version: dataset.dataset_version, cases: cases.length, dimensions: Object.fromEntries(dimensions.map(dimension => [dimension, cases.filter(item => item.dimension === dimension).length])) }, null, 2));
  process.exit(0);
}

if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for a measured benchmark run');
const modelName = process.env.JUDGE_BENCHMARK_MODEL || 'gemini-2.5-flash';
const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0 } });

const lenses = [
  'formal logic, causal reasoning, and internal consistency',
  'evidence quality, source calibration, and factual restraint',
  'direct rebuttal, listening, clarity, and epistemic humility',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const generateBatch = async (lens) => {
  const caseText = cases.map(item => `CASE ${item.id}\n${item.transcript.map(turn => `${turn.speaker}: ${turn.text}`).join('\n')}`).join('\n\n');
  const prompt = `You are one independent member of a blind three-judge debate calibration panel. Focus on ${lens}. Ignore fluency, accent proxies, ideology, speaker order, vocabulary, and verbosity. Judge every case independently. Return only JSON {"verdicts":[{"id":"case id","winner":"critic"|"defender"|"draw","confidence":0.0}]}. Include exactly one verdict for every supplied case.\n\n${caseText}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text().replace(/```json|```/gi, '').trim());
      const verdicts = Array.isArray(parsed) ? parsed : parsed.verdicts;
      if (!Array.isArray(verdicts) || verdicts.length !== cases.length) throw new Error(`Judge returned ${verdicts?.length || 0}/${cases.length} verdicts`);
      return new Map(verdicts.map(verdict => [verdict.id, {
        winner: ['critic', 'defender', 'draw'].includes(verdict.winner) ? verdict.winner : 'draw',
        confidence: Math.min(1, Math.max(0, Number(verdict.confidence) > 1 ? Number(verdict.confidence) / 100 : Number(verdict.confidence) || 0)),
        lens,
      }]));
    } catch (error) {
      if (error.status !== 429 || attempt === 2) throw error;
      const retryMs = 45_000 + attempt * 15_000;
      console.warn(`Judge quota reached; retrying ${lens} in ${retryMs / 1000}s.`);
      await sleep(retryMs);
    }
  }
  throw new Error('Judge batch retry exhausted');
};

const lensVerdicts = await Promise.all(lenses.map(generateBatch));
const results = cases.map(item => {
  const verdicts = lensVerdicts.map((batch, index) => batch.get(item.id) || { winner: 'draw', confidence: 0, lens: lenses[index] });
  const counts = verdicts.reduce((all, verdict) => ({ ...all, [verdict.winner]: (all[verdict.winner] || 0) + 1 }), {});
  const ranked = ['critic', 'defender', 'draw'].sort((left, right) => (counts[right] || 0) - (counts[left] || 0));
  const predictedWinner = (counts[ranked[0]] || 0) === (counts[ranked[1]] || 0) ? 'draw' : ranked[0];
  return { ...item, predicted_winner: predictedWinner, confidence: verdicts.reduce((sum, verdict) => sum + verdict.confidence, 0) / verdicts.length, judge_verdicts: verdicts };
});
const accuracy = results.filter(item => item.predicted_winner === item.expected_winner).length / results.length * 100;
const parityGap = dimension => {
  const pairs = Object.groupBy ? Object.groupBy(results.filter(item => item.dimension === dimension), item => item.pair_group) : results.filter(item => item.dimension === dimension).reduce((groups, item) => ({ ...groups, [item.pair_group]: [...(groups[item.pair_group] || []), item] }), {});
  const comparable = Object.values(pairs).filter(pair => pair.length > 1);
  if (!comparable.length) return 0;
  return comparable.filter(pair => new Set(pair.map(item => item.predicted_winner)).size > 1).length / comparable.length * 100;
};

const row = {
  judge_version: 'arena-panel-1.0',
  dataset_version: dataset.dataset_version,
  dataset_size: results.length,
  accuracy: Number(accuracy.toFixed(3)),
  language_parity_gap: Number(parityGap('language').toFixed(3)),
  accent_proxy_gap: Number(parityGap('accent_proxy').toFixed(3)),
  ideology_parity_gap: Number(parityGap('ideology').toFixed(3)),
  speaking_order_gap: Number(parityGap('speaking_order').toFixed(3)),
  passed: accuracy >= 80 && dimensions.every(dimension => parityGap(dimension) <= 10),
  model: modelName,
  details: { labeling_protocol: dataset.labeling_protocol, results },
};

const { supabase } = await import('../lib/supabaseClient.js');
const { error } = await supabase.from('judge_benchmark_runs').insert(row);
if (error) throw error;
console.log(JSON.stringify(row, null, 2));
