const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
};

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const standardDeviation = values => {
  const average = mean(values);
  return values.length ? Math.sqrt(mean(values.map(value => (value - average) ** 2))) : 0;
};
const rounded = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

const estimatePitch = (samples, sampleRate) => {
  const rms = Math.sqrt(mean(Array.from(samples, sample => sample * sample)));
  if (rms < 0.008) return null;
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(samples.length - 2, Math.ceil(sampleRate / 70));
  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < samples.length - lag; index += 1) {
      const left = samples[index];
      const right = samples[index + lag];
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const correlation = numerator / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy));
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return bestCorrelation >= 0.55 && bestLag ? sampleRate / bestLag : null;
};

const pauseSegments = (voiced, hopSeconds) => {
  const segments = [];
  let start = null;
  voiced.forEach((isVoiced, index) => {
    if (!isVoiced && start === null) start = index;
    if (isVoiced && start !== null) {
      segments.push({ startSeconds: start * hopSeconds, durationSeconds: (index - start) * hopSeconds });
      start = null;
    }
  });
  if (start !== null) segments.push({ startSeconds: start * hopSeconds, durationSeconds: (voiced.length - start) * hopSeconds });
  return segments.filter(segment => segment.durationSeconds >= 0.25);
};

export const transcriptDeliveryMetrics = (transcript, durationSeconds) => {
  const words = String(transcript || '').trim().match(/[\p{L}\p{N}'’-]+/gu) || [];
  const fillers = String(transcript || '').match(/\b(?:um+|uh+|erm+|hmm+|like|you know|sort of|kind of)\b/gi) || [];
  const minutes = Math.max(1 / 60, Number(durationSeconds || 0) / 60);
  return {
    wordCount: words.length,
    wordsPerMinute: rounded(words.length / minutes, 1),
    fillerCount: fillers.length,
    fillersPerMinute: rounded(fillers.length / minutes, 1),
  };
};

export const analyzeAudioBlob = async (blob, transcript = '') => {
  if (!blob?.size) throw new Error('No recorded audio is available.');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser cannot analyze recorded audio.');
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const sampleRate = decoded.sampleRate;
    const durationSeconds = decoded.duration;
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / decoded.numberOfChannels;
    }

    const frameSize = Math.max(256, Math.floor(sampleRate * 0.04));
    const hopSize = Math.max(128, Math.floor(sampleRate * 0.02));
    const rmsValues = [];
    const frames = [];
    for (let offset = 0; offset + frameSize <= mono.length; offset += hopSize) {
      const frame = mono.subarray(offset, offset + frameSize);
      const rms = Math.sqrt(mean(Array.from(frame, sample => sample * sample)));
      rmsValues.push(rms);
      frames.push(frame);
    }
    if (!frames.length) throw new Error('The recording is too short to analyze.');

    const noiseFloor = percentile(rmsValues, 0.2);
    const voicedThreshold = Math.max(0.008, noiseFloor * 2.5);
    const voiced = rmsValues.map(value => value >= voicedThreshold);
    const pitches = [];
    frames.forEach((frame, index) => {
      if (voiced[index] && index % 2 === 0) {
        const pitch = estimatePitch(frame, sampleRate);
        if (pitch) pitches.push(pitch);
      }
    });
    const pauses = pauseSegments(voiced, hopSize / sampleRate);
    const voicedRms = rmsValues.filter((_, index) => voiced[index]);
    const pitchMean = mean(pitches);
    const pitchSemitones = pitchMean ? pitches.map(value => 12 * Math.log2(value / pitchMean)) : [];
    const endWindow = voiced.slice(-Math.max(1, Math.ceil(0.2 / (hopSize / sampleRate))));
    const transcriptMetrics = transcriptDeliveryMetrics(transcript, durationSeconds);

    return {
      version: 'browser-acoustic-v1',
      durationSeconds: rounded(durationSeconds, 2),
      sampleRate,
      channelCount: decoded.numberOfChannels,
      analyzedFrames: frames.length,
      voicedRatio: rounded(voiced.filter(Boolean).length / voiced.length, 3),
      pauseCount: pauses.length,
      hesitationPauseCount: pauses.filter(item => item.durationSeconds >= 0.25 && item.durationSeconds < 1.2).length,
      longPauseCount: pauses.filter(item => item.durationSeconds >= 1.2).length,
      averagePauseSeconds: rounded(mean(pauses.map(item => item.durationSeconds)), 2),
      longestPauseSeconds: rounded(Math.max(0, ...pauses.map(item => item.durationSeconds)), 2),
      pitchMeanHz: rounded(pitchMean, 1),
      pitchVariationSemitones: rounded(standardDeviation(pitchSemitones), 2),
      pitchSamples: pitches.length,
      volumeMeanRms: rounded(mean(voicedRms), 4),
      volumeVariation: rounded(mean(voicedRms) ? standardDeviation(voicedRms) / mean(voicedRms) : 0, 3),
      dynamicRangeDb: rounded(20 * Math.log10(Math.max(1e-6, percentile(voicedRms, 0.95)) / Math.max(1e-6, percentile(voicedRms, 0.1))), 1),
      abruptCutoffIndicator: endWindow.filter(Boolean).length / endWindow.length >= 0.8,
      ...transcriptMetrics,
      pauses: pauses.slice(0, 40).map(item => ({ startSeconds: rounded(item.startSeconds, 2), durationSeconds: rounded(item.durationSeconds, 2) })),
    };
  } finally {
    await context.close().catch(() => {});
  }
};
