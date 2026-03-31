import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useVoiceRecognition — "The Acoustic-Semantic Lock" (v6)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  PROBLEM: The Web Speech API's SpeechRecognition engine arbitrarily chunks
 *  continuous speech. When a user takes a breath mid-sentence, it emits a
 *  finalized result — potentially triggering a command that was just part
 *  of dictation. This is "The Breath Anomaly."
 *
 *  SOLUTION: The Acoustic-Semantic Lock — a 5-phase state machine that
 *  evaluates every incoming transcript against Temporal, Semantic, and
 *  (optionally) Acoustic dimensions before classifying it as a Command
 *  vs. Dictation.
 *
 *  Phase 1: Continuous Ingestion & Timestamping
 *  Phase 2: Exact Match Trigger Scan
 *  Phase 3: Delta-T Gate (Temporal Isolation — 600ms pause threshold)
 *  Phase 4: Semantic Look-Behind (Buffer syntactic-completeness check)
 *  Phase 5: Web Audio API Energy Shift (15% vocal spike confirmation)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 1: TRIGGER DEFINITIONS
// All triggers are multi-word. Single-word triggers are FORBIDDEN.
// Each trigger group maps to a command action.
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGERS = {
  submit:    ['send argument', 'post argument', 'end turn'],
  clear:     ['clear draft', 'delete draft'],
  objection: ['raise objection', 'summon judge'],
};

/** Pre-compute a flat array of { phrase, command } for scanning efficiency. */
const TRIGGER_LIST = Object.entries(TRIGGERS).flatMap(
  ([command, phrases]) => phrases.map(phrase => ({ phrase, command }))
);

// ─────────────────────────────────────────────────────────────────────────────
// § 2: LINGUISTIC CONSTANTS
// Words that indicate a syntactically *incomplete* clause — meaning any
// trigger phrase following them is likely a continuation of dictation.
// ─────────────────────────────────────────────────────────────────────────────

const DEPENDENT_TAIL_WORDS = new Set([
  // Prepositions
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'over', 'without', 'within', 'towards',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'yet', 'so', 'because', 'although',
  'since', 'while', 'whereas', 'unless', 'if', 'that', 'which', 'who',
  // Articles / Determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your',
  'his', 'her', 'its', 'our', 'their', 'some', 'any', 'each', 'every',
  // Infinitive markers & auxiliaries
  'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
  'shall', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'not',
]);

/** The Delta-T threshold in milliseconds. */
const DELTA_T_THRESHOLD_MS = 600;

/** Maximum words to retain in the rolling buffer. */
const BUFFER_MAX_WORDS = 20;

/** How many preceding words to analyze for semantic look-behind. */
const LOOK_BEHIND_WINDOW = 5;

/** Energy spike threshold — command must be ≥15% louder than baseline. */
const ENERGY_SPIKE_THRESHOLD = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// § 2b: AFFECTIVE PUNCTUATION CONSTANTS
// Thresholds and patterns for the Pragmatic Affective Punctuation layer.
// ─────────────────────────────────────────────────────────────────────────────

/** Exclamation: chunk energy must exceed baseline by ≥15%. */
const EXCLAMATION_ENERGY_RATIO = 1.15;

/** Question: interrogative word anywhere in short chunks (< 5 words). */
const INTERROGATIVE_REGEX =
  /\b(who|what|where|when|why|how|is|are|do|does|did|will|can|could|would|should|really|right)\b/i;

/** Intensity Lexicon: Words that force an 'urgent' tone regardless of energy. */
const INTENSITY_LEXICON = new Set([
  'absolutely', 'never', 'impossible', 'ridiculous', 'exactly', 'bullshit',
  'stop', 'enough', 'wrong', 'liar', 'lying', 'fake', 'false', 'outrageous',
  'shocking', 'disaster', 'horrible', 'awful', 'terrible', 'furious', 'angry',
  'completely', 'totally', 'entirely', 'madness', 'insane', 'crazy', 'brilliant',
  'genius', 'incredible', 'amazing', 'catastrophic', 'emergency', 'urgent',
  'immediately', 'now', 'fast', 'hurry', 'quick', 'serious', 'dangerous',
  'fatal', 'lethal', 'critical', 'perfect', 'excellent', 'fantastic', 'nonsense'
]);

/** Hesitation: pause must exceed 1200ms AND chunk must be 1–3 words. */
const HESITATION_DELTA_T_MS = 1200;
const HESITATION_MAX_WORDS = 3;

/** Comma/continuation: pause between 400ms and 800ms. */
const COMMA_DELTA_T_MIN_MS = 400;
const COMMA_DELTA_T_MAX_MS = 800;

/** Words that signal a continuation when they trail the preceding context. */
const CONTINUATION_TAIL_WORDS = new Set([
  'and', 'but', 'or', 'so', 'yet', 'nor', 'because', 'since', 'although',
  'while', 'if', 'with', 'to', 'for', 'from', 'about', 'into', 'through',
  'that', 'which', 'who', 'where', 'when', 'as', 'like', 'than', 'then',
]);

/** Characters considered terminal punctuation — we never double-punctuate. */
const TERMINAL_PUNCTUATION_REGEX = /[.!?,;:…]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// § 3: PHASE HELPERS (Pure, modular, decoupled from the event listener)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * analyzeTextTone — The central Affective Engine Brain.
 * Evaluates text (and optional acoustic metrics) to determine punctuation & tone.
 * Used for both Voice Transcripts and Manual Typed Input.
 */
export function analyzeTextTone(text, metrics = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { text: trimmed, tone: 'neutral' };

  const lowerTrimmed = trimmed.toLowerCase();
  const chunkWords = trimmed.split(/\s+/).filter(Boolean);
  
  // 1. Terminal Check: If already punctuated, try to infer tone from the mark itself
  if (TERMINAL_PUNCTUATION_REGEX.test(trimmed)) {
    if (trimmed.endsWith('!')) return { text: trimmed, tone: 'urgent' };
    if (trimmed.endsWith('?')) return { text: trimmed, tone: 'inquisitive' };
    if (trimmed.endsWith('...')) return { text: trimmed, tone: 'hesitant' };
    return { text: trimmed, tone: 'neutral' };
  }

  const {
    currentEnergy = 0,
    baselineEnergy = 0,
    deltaT = 0,
    precedingContext = [],
  } = metrics;

  // 2. Lexicon Check: High-intensity words force 'urgent'
  const hasIntenseWord = chunkWords.some(w => INTENSITY_LEXICON.has(w.toLowerCase()));
  if (hasIntenseWord) {
    return { text: `${trimmed}!`, tone: 'urgent' };
  }

  // 3. Acoustic Exclamation Check: Volume spike
  if (baselineEnergy > 0 && currentEnergy > baselineEnergy * EXCLAMATION_ENERGY_RATIO) {
    return { text: `${trimmed}!`, tone: 'urgent' };
  }

  // 4. Inquisitive Check: Interrogative words in short chunks
  if (chunkWords.length < 5 && INTERROGATIVE_REGEX.test(lowerTrimmed)) {
    return { text: `${trimmed}?`, tone: 'inquisitive' };
  }

  // 5. Hesitation Check: Timing and word count
  if (deltaT > HESITATION_DELTA_T_MS && chunkWords.length <= HESITATION_MAX_WORDS) {
    return { text: `${trimmed}...`, tone: 'hesitant' };
  }

  // 6. Default Fallback
  return { text: `${trimmed}.`, tone: 'neutral' };
}

/**
 * Phase 2: Scan normalized text for any multi-word trigger.
 * Returns { command, phrase, triggerIndex } or null.
 *
 * @param {string} normalizedText - Lowercase, trimmed incoming text.
 * @returns {{ command: string, phrase: string, triggerIndex: number } | null}
 */
function scanForTrigger(normalizedText) {
  for (const { phrase, command } of TRIGGER_LIST) {
    const idx = normalizedText.indexOf(phrase);
    if (idx !== -1) {
      return { command, phrase, triggerIndex: idx };
    }
  }
  return null;
}

/**
 * Phase 3: The Delta-T Gate (Temporal Isolation).
 *
 * Evaluates whether there was a deliberate cognitive pause (≥ 600ms gap)
 * between the end of the previous speech chunk and the start of the chunk
 * containing the trigger. A rapid continuation means the trigger was spoken
 * mid-flow and is dictation, not a command.
 *
 * @param {number} lastSpeechTimestamp - ms timestamp of the end of the previous chunk.
 * @param {number} currentChunkTimestamp - ms timestamp of the current chunk arrival.
 * @returns {boolean} True = pause detected (proceed to Phase 4). False = dictation.
 */
function evaluateDeltaTGate(lastSpeechTimestamp, currentChunkTimestamp) {
  // If this is the very first chunk (no prior timestamp), treat as a pause
  if (lastSpeechTimestamp === 0) return true;

  const deltaT = currentChunkTimestamp - lastSpeechTimestamp;
  return deltaT >= DELTA_T_THRESHOLD_MS;
}

/**
 * Phase 4: The Semantic Look-Behind (Buffer Syntactic-Completeness Check).
 *
 * Analyzes the 3–5 words immediately preceding the trigger phrase in the
 * rolling transcript buffer. If the preceding context ends with a dependent
 * word (preposition, conjunction, article, infinitive marker), the trigger
 * is part of a syntactically incomplete clause — i.e., the Breath Anomaly.
 *
 * Also checks: if the current chunk's total word count (including the trigger)
 * exceeds 5, it's almost certainly mid-sentence dictation, not a standalone
 * command.
 *
 * @param {string[]} bufferWords - The rolling masterTranscriptBuffer as word array.
 * @param {string} triggerPhrase - The exact trigger phrase detected.
 * @param {string} fullChunkText - The full incoming normalized chunk text.
 * @returns {boolean} True = Breath Anomaly detected (treat as dictation).
 *                    False = syntactically complete (VERIFIED COMMAND).
 */
function evaluateSemanticLookBehind(bufferWords, triggerPhrase, fullChunkText) {
  // ── Check 1: Chunk length heuristic ──
  // If the chunk has > 5 words including the trigger, it's mid-sentence.
  const chunkWords = fullChunkText.split(/\s+/).filter(Boolean);
  if (chunkWords.length > 5) {
    return true; // Breath Anomaly — too many words around the trigger
  }

  // ── Check 2: Look-behind dependency analysis ──
  // Grab the last LOOK_BEHIND_WINDOW words from the buffer that precede
  // the trigger. If we can't find the trigger in the buffer, use the
  // entire tail of the buffer.
  const triggerWords = triggerPhrase.split(/\s+/).filter(Boolean);
  const triggerStartWord = triggerWords[0];

  // Find where the trigger starts in the buffer
  let triggerStartIdx = -1;
  for (let i = bufferWords.length - 1; i >= 0; i--) {
    if (bufferWords[i] === triggerStartWord) {
      // Verify the full trigger phrase matches from this position
      const slice = bufferWords.slice(i, i + triggerWords.length).join(' ');
      if (slice === triggerPhrase) {
        triggerStartIdx = i;
        break;
      }
    }
  }

  // Extract the preceding context (3–5 words before the trigger)
  let precedingWords;
  if (triggerStartIdx > 0) {
    const start = Math.max(0, triggerStartIdx - LOOK_BEHIND_WINDOW);
    precedingWords = bufferWords.slice(start, triggerStartIdx);
  } else {
    // Trigger not cleanly found in buffer — use last LOOK_BEHIND_WINDOW words
    // from buffer minus the trigger words from the end
    const bufLen = bufferWords.length;
    const trimmedLen = Math.max(0, bufLen - triggerWords.length);
    const start = Math.max(0, trimmedLen - LOOK_BEHIND_WINDOW);
    precedingWords = bufferWords.slice(start, trimmedLen);
  }

  // If there are no preceding words, context is "clean" — likely a standalone command
  if (precedingWords.length === 0) return false;

  // Check if the last preceding word is a dependent/incomplete word
  const lastPrecedingWord = precedingWords[precedingWords.length - 1].toLowerCase();
  if (DEPENDENT_TAIL_WORDS.has(lastPrecedingWord)) {
    return true; // Breath Anomaly — syntactically incomplete clause
  }

  return false; // Syntactically complete — VERIFIED COMMAND
}

/**
 * Phase 5: Web Audio API Energy Shift Check (Optional).
 *
 * Compares the current vocal energy against the rolling baseline.
 * A verified command should be spoken with ≥15% more energy than normal
 * dictation, confirming authoritative intent.
 *
 * @param {number} currentEnergy - Current vocal energy level (0–1).
 * @param {number} baselineEnergy - Rolling average energy over last ~3 seconds.
 * @returns {boolean} True = energy spike confirms command intent.
 *                    False = no spike (cast vote of doubt, but don't veto alone).
 */
function evaluateEnergySpike(currentEnergy, baselineEnergy) {
  if (baselineEnergy <= 0) return true; // No baseline yet — don't block
  const spikeRatio = (currentEnergy - baselineEnergy) / baselineEnergy;
  return spikeRatio >= ENERGY_SPIKE_THRESHOLD;
}

// DEPRECATED applyAffectivePunctuation (Replaced by analyzeTextTone)

// ─────────────────────────────────────────────────────────────────────────────
// § 4: THE HOOK
// ─────────────────────────────────────────────────────────────────────────────

const SpeechRecognitionAPI = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function useVoiceRecognition({
  onSubmit = () => {},
  onClear = () => {},
  onObjection = () => {},
  onTranscriptChunk = () => {},
  enabled = true,
} = {}) {
  // ── React State (only for values the UI needs to re-render on) ──
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [audioStream, setAudioStream] = useState(null);
  const [volume, setVolume] = useState(0); // New: Direct volume stream for VoiceOrb
  const [error, setError] = useState(null);
  const [isSupported] = useState(!!SpeechRecognitionAPI);

  // ── Refs: Core engine state (NO re-renders, NO stale closures) ──
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const streamRef = useRef(null);
  const restartTimerRef = useRef(null);
  const volumeAnimationRef = useRef(null); // New: Animation loop for volume
  const linguisticPulseRef = useRef(0); // New: For simulated volume on iOS

  // ── Acoustic-Semantic Lock: The Three Dimensional Trackers ──

  /**
   * masterTranscriptBuffer — Rolling word array storing the last ~20 words
   * spoken, bridging across browser chunk boundaries. This is the backbone
   * of the Semantic Look-Behind (Phase 4).
   */
  const masterTranscriptBufferRef = useRef([]);

  /**
   * lastSpeechTimestamp — The exact millisecond the last finalized word was
   * processed. This powers the Delta-T Gate (Phase 3).
   */
  const lastSpeechTimestampRef = useRef(0);

  /**
   * isCommandLockActive — When true, dictation ingestion is paused while a
   * command is being evaluated through the verification gates.
   */
  const isCommandLockActiveRef = useRef(false);

  // ── Phase 5: Web Audio API Energy Tracking ──
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioSourceRef = useRef(null);

  /** Rolling energy samples for computing baseline (last ~3 seconds). */
  const energySamplesRef = useRef([]);
  /** Timestamp-indexed energy entries: { time: number, energy: number }[] */
  const ENERGY_WINDOW_MS = 3000;

  /**
   * Sample the current vocal energy from the AnalyserNode.
   * Returns a normalized 0–1 value, or -1 if unavailable.
   */
  const sampleCurrentEnergy = useCallback(() => {
    // MOBILE FIX: Check if AudioContext is suspended and try to get some energy anyway
    if (!analyserRef.current) {
      // FALLBACK: Linguistic Drive (Simulated volume based on transcript activity)
      // This ensures the VoiceOrb still moves on platforms that block concurrent mic access.
      const pulse = linguisticPulseRef.current;
      if (pulse > 0) {
        linguisticPulseRef.current = Math.max(0, pulse - 0.05); // Decay
      }
      return linguisticPulseRef.current;
    }

    const analyser = analyserRef.current;
    const audioCtx = audioContextRef.current;
    
    // MOBILE FIX: If AudioContext is suspended, return linguistic pulse instead
    // This commonly happens on iOS when audio is blocked
    if (audioCtx && audioCtx.state === 'suspended') {
      const pulse = linguisticPulseRef.current;
      if (pulse > 0) {
        linguisticPulseRef.current = Math.max(0, pulse - 0.05);
      }
      return linguisticPulseRef.current;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;
    
    // MOBILE FIX: On mobile, if we're getting zero readings but we have
    // linguistic pulse, blend them to ensure some visual feedback
    const normalizedEnergy = Math.min(avg / 128, 1);
    if (normalizedEnergy < 0.01 && linguisticPulseRef.current > 0) {
      const pulse = linguisticPulseRef.current;
      linguisticPulseRef.current = Math.max(0, pulse - 0.05);
      return pulse; // Use linguistic pulse when audio gives us nothing
    }
    
    return normalizedEnergy;
  }, []);

  /**
   * Record an energy sample and compute the rolling baseline.
   * Returns { currentEnergy, baselineEnergy }.
   */
  const getEnergyMetrics = useCallback(() => {
    const currentEnergy = sampleCurrentEnergy();
    if (currentEnergy < 0) return { currentEnergy: 0, baselineEnergy: 0 };

    const now = Date.now();
    energySamplesRef.current.push({ time: now, energy: currentEnergy });

    // Prune samples older than the energy window
    const cutoff = now - ENERGY_WINDOW_MS;
    energySamplesRef.current = energySamplesRef.current.filter(s => s.time >= cutoff);

    // Compute baseline average
    const samples = energySamplesRef.current;
    const baselineEnergy = samples.length > 0
      ? samples.reduce((acc, s) => acc + s.energy, 0) / samples.length
      : 0;

    return { currentEnergy, baselineEnergy };
  }, [sampleCurrentEnergy]);

  // ── Stable callback refs (prevent stale closures in event listeners) ──
  const onSubmitRef = useRef(onSubmit);
  const onClearRef = useRef(onClear);
  const onObjectionRef = useRef(onObjection);
  const onTranscriptChunkRef = useRef(onTranscriptChunk);

  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onClearRef.current = onClear; }, [onClear]);
  useEffect(() => { onObjectionRef.current = onObjection; }, [onObjection]);
  useEffect(() => { 
    onTranscriptChunkRef.current = (data) => {
      // Trigger "Linguistic Pulse" to ensure Orb moves even if raw audio is blocked by OS
      linguisticPulseRef.current = 0.4 + Math.random() * 0.3;
      onTranscriptChunk(data);
    }; 
  }, [onTranscriptChunk]);

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // ─────────────────────────────────────────────────────────────────────────
  // § 5: THE DETECT COMMAND PIPELINE
  // This is the central brain — the 5-phase Acoustic-Semantic Lock.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * processIncomingChunk — The main pipeline invoked on every finalized
   * SpeechRecognition result. Runs Phases 1–5 in immutable order.
   *
   * @param {string} rawText - The raw transcript string from the speech engine.
   */
  const processIncomingChunk = useCallback((rawText) => {
    if (!rawText || isCommandLockActiveRef.current) return;

    const now = Date.now();
    const normalizedText = rawText.toLowerCase().trim();
    const words = normalizedText.split(/\s+/).filter(Boolean);

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 1: Continuous Ingestion & Timestamping
    // Append words to the rolling buffer. Cap at BUFFER_MAX_WORDS.
    // Record the previous chunk's end timestamp for Delta-T calculation.
    // ══════════════════════════════════════════════════════════════════════

    const previousTimestamp = lastSpeechTimestampRef.current;
    const deltaT = previousTimestamp === 0 ? 0 : now - previousTimestamp;

    // Snapshot the preceding context (last 3 words) BEFORE appending new words.
    // This powers both Phase 4 look-behind and the Comma punctuation check.
    const precedingContext = masterTranscriptBufferRef.current.slice(-3);

    // Append new words to the master buffer
    masterTranscriptBufferRef.current.push(...words);

    // Trim buffer to the last BUFFER_MAX_WORDS
    if (masterTranscriptBufferRef.current.length > BUFFER_MAX_WORDS) {
      masterTranscriptBufferRef.current =
        masterTranscriptBufferRef.current.slice(-BUFFER_MAX_WORDS);
    }

    // Update the timestamp for the END of this chunk
    lastSpeechTimestampRef.current = now;

    // ── Build the punctuation metrics object once (reused by all dictation paths) ──
    const { currentEnergy, baselineEnergy } = getEnergyMetrics();
    const punctuationMetrics = {
      currentEnergy,
      baselineEnergy,
      deltaT,
      precedingContext,
    };

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 2: Exact Match Trigger Scan
    // Scan the incoming chunk for any multi-word trigger phrase.
    // ══════════════════════════════════════════════════════════════════════

    const triggerResult = scanForTrigger(normalizedText);

    if (!triggerResult) {
      // ── No trigger found: Pure dictation. Run Affective Engine. ──
      const { text: punctuatedText, tone } = analyzeTextTone(rawText, punctuationMetrics);
      console.log(`[Voice:P2] No trigger. Dictation: "${punctuatedText}" [Tone: ${tone}]`);
      onTranscriptChunkRef.current({ text: punctuatedText, tone });
      return;
    }

    // ── Trigger detected! Engage the command lock and begin verification. ──
    isCommandLockActiveRef.current = true;
    const { command, phrase, triggerIndex } = triggerResult;
    console.log(`[Voice:P2] Trigger "${phrase}" (→ ${command}) detected. Engaging verification gates...`);

    // Extract the dictation portion (text before the trigger)
    const textBeforeTrigger = normalizedText.slice(0, triggerIndex).trim();

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 3: The Delta-T Gate (Temporal Isolation)
    // Was there a ≥600ms pause between the last chunk and this one?
    // ══════════════════════════════════════════════════════════════════════

    const deltaTPassed = evaluateDeltaTGate(previousTimestamp, now);

    if (!deltaTPassed) {
      // ── FAIL: Rapid speech — trigger spoken mid-flow. Treat as dictation. ──
      console.log(
        `[Voice:P3] ❌ Delta-T FAILED (${deltaT}ms < ${DELTA_T_THRESHOLD_MS}ms). ` +
        `Treating "${phrase}" as dictation.`
      );
      isCommandLockActiveRef.current = false;
      const { text: punctuatedText, tone } = analyzeTextTone(rawText, punctuationMetrics);
      onTranscriptChunkRef.current({ text: punctuatedText, tone });
      return;
    }

    console.log(
      `[Voice:P3] ✅ Delta-T PASSED (${deltaT}ms ≥ ${DELTA_T_THRESHOLD_MS}ms). ` +
      `Proceeding to Semantic Look-Behind...`
    );

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 4: The Semantic Look-Behind (Buffer Syntactic Check)
    // Is the preceding context syntactically complete?
    // ══════════════════════════════════════════════════════════════════════

    const isBreathAnomaly = evaluateSemanticLookBehind(
      masterTranscriptBufferRef.current,
      phrase,
      normalizedText
    );

    if (isBreathAnomaly) {
      // ── FAIL: Breath Anomaly detected. The trigger is mid-sentence dictation. ──
      console.log(
        `[Voice:P4] ❌ Semantic Look-Behind FAILED. ` +
        `Breath Anomaly detected — preceding context is syntactically incomplete. ` +
        `Treating "${phrase}" as dictation.`
      );
      isCommandLockActiveRef.current = false;
      const { text: punctuatedText, tone } = analyzeTextTone(rawText, punctuationMetrics);
      onTranscriptChunkRef.current({ text: punctuatedText, tone });
      return;
    }

    console.log(`[Voice:P4] ✅ Semantic Look-Behind PASSED. Context is syntactically complete.`);

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 5: Web Audio API Energy Shift (Optional Confirmation)
    // If audio analysis is available, confirm the command was spoken
    // with ≥15% more energy than the rolling baseline.
    // This is advisory — it adds confidence but does not veto alone.
    // ══════════════════════════════════════════════════════════════════════

    const energyConfirmed = evaluateEnergySpike(currentEnergy, baselineEnergy);

    if (analyserRef.current) {
      if (energyConfirmed) {
        console.log(
          `[Voice:P5] ✅ Energy Spike CONFIRMED ` +
          `(current=${currentEnergy.toFixed(3)}, baseline=${baselineEnergy.toFixed(3)}). ` +
          `Command intent is acoustically verified.`
        );
      } else {
        console.log(
          `[Voice:P5] ⚠️ Energy Spike NOT detected ` +
          `(current=${currentEnergy.toFixed(3)}, baseline=${baselineEnergy.toFixed(3)}). ` +
          `Proceeding anyway — energy check is advisory only.`
        );
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ✅ VERIFIED COMMAND — FIRE ACTION
    // All mandatory gates passed. Strip the trigger from the text,
    // emit any preceding dictation (punctuated), then fire the callback.
    // ══════════════════════════════════════════════════════════════════════

    console.log(`[Voice] 🔥 VERIFIED COMMAND: "${command}" (trigger: "${phrase}")`);

    // If there was dictation text before the trigger, punctuate and emit it first
    if (textBeforeTrigger) {
      const originalCasePrefix = rawText.slice(0, triggerIndex).trim();
      if (originalCasePrefix) {
        const { text: punctuatedText, tone } = analyzeTextTone(originalCasePrefix, punctuationMetrics);
        onTranscriptChunkRef.current({ text: punctuatedText, tone });
      }
    }

    // Fire the command action
    switch (command) {
      case 'submit':
        onSubmitRef.current();
        break;
      case 'clear':
        onClearRef.current();
        break;
      case 'objection':
        onObjectionRef.current();
        break;
      default:
        console.warn(`[Voice] Unknown command: "${command}"`);
    }

    // Release the command lock
    isCommandLockActiveRef.current = false;

    // Remove the trigger words from the buffer so they don't pollute
    // future look-behind analyses
    const triggerWords = phrase.split(/\s+/).filter(Boolean);
    const bufLen = masterTranscriptBufferRef.current.length;
    masterTranscriptBufferRef.current =
      masterTranscriptBufferRef.current.slice(0, bufLen - triggerWords.length);

  }, [getEnergyMetrics]);

  // ─────────────────────────────────────────────────────────────────────────
  // § 6: RECOGNITION ENGINE LIFECYCLE
  // Uses the "Short-Burst" strategy: continuous=false + auto-restart on end.
  // This avoids Chrome's internal buffer management bugs while keeping the
  // masterTranscriptBuffer intact across restarts.
  // ─────────────────────────────────────────────────────────────────────────

  /** Destroy the current recognition instance without resetting buffers. */
  const killRecognition = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onstart = null;
        recognitionRef.current.abort();
      } catch (e) { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  /** Release the microphone MediaStream. */
  const releaseStream = useCallback(() => {
    if (volumeAnimationRef.current) {
      cancelAnimationFrame(volumeAnimationRef.current);
      volumeAnimationRef.current = null;
    }

    // Tear down Phase 5 audio analysis
    if (audioSourceRef.current) {
      try { audioSourceRef.current.disconnect(); } catch (e) { /* noop */ }
      audioSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) { /* noop */ }
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    energySamplesRef.current = [];
    setVolume(0);

    // Release mic hardware
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setAudioStream(null);
  }, []);

  /**
   * Initialize the Phase 5 Web Audio API AnalyserNode for energy tracking.
   * Called once when the microphone stream is acquired.
   */
  const initAudioAnalysis = useCallback((stream) => {
    try {
      // MOBILE FIX: Use specific options for better iOS/Android compatibility
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        // Lower sample rate for mobile compatibility
        sampleRate: 44100,
        // Reduce latency mode for faster responsiveness
        latencyHint: 'interactive',
      });
      
      // CRITICAL FOR MOBILE: Always attempt to resume context immediately
      // iOS Safari requires this AND a user gesture (which we have from the button click)
      const resumeContext = async () => {
        if (audioCtx.state === 'suspended') {
          try {
            await audioCtx.resume();
            console.log('[Voice:P5] AudioContext resumed successfully');
          } catch (e) {
            console.warn('[Voice:P5] Failed to resume AudioContext:', e);
          }
        }
      };
      resumeContext();

      const analyser = audioCtx.createAnalyser();
      // MOBILE FIX: Use smaller FFT size for faster processing on mobile
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      audioSourceRef.current = source;
      energySamplesRef.current = [];

      // Start the volume tracking loop
      const updateVolume = () => {
        if (!isListeningRef.current) return;
        
        // MOBILE FIX: Re-check and resume AudioContext on each frame (iOS Safari workaround)
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        
        setVolume(sampleCurrentEnergy());
        volumeAnimationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      console.log('[Voice:P5] Audio Sovereign initialized: AudioContext + AnalyserNode.');
    } catch (e) {
      console.warn('[Voice:P5] Web Audio API restricted — using Linguistic Drive fallback:', e.message);
      // Start a fallback linguistic loop if raw audio is blocked
      const updateFallbackVolume = () => {
        if (!isListeningRef.current) return;
        setVolume(sampleCurrentEnergy());
        volumeAnimationRef.current = requestAnimationFrame(updateFallbackVolume);
      };
      updateFallbackVolume();
    }
  }, [sampleCurrentEnergy]);

  /** Create a fresh SpeechRecognition instance and start listening. */
  const createAndStartRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI || !isListeningRef.current) return;

    // Kill any stale instance
    killRecognition();

    // MOBILE DETECTION: Adjust recognition settings per platform
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    const recognition = new SpeechRecognitionAPI();

    // KEY: "continuous: false" forces a short-burst cycle.
    // The engine stops after each sentence and we auto-restart in onend.
    // This keeps the internal buffer small and prevents the engine from
    // going deaf — while our masterTranscriptBuffer persists across cycles.
    // 
    // MOBILE NOTE: On iOS Safari, continuous mode is more reliable for
    // longer dictation, but we stick with short-burst for consistency.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // ── onstart: Session opened ──
    recognition.onstart = () => {
      console.log('[Voice] Session Active ✅', isMobile ? '(Mobile)' : '(Desktop)');
    };

    // ── onresult: Process interim & final chunks ──
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Update interim preview (for UI display only — no buffer mutation)
      setInterimText(interimTranscript);

      // On finalized chunk → run the full Acoustic-Semantic Lock pipeline
      if (finalChunk) {
        console.log('[Voice] Final Chunk Received:', finalChunk);
        processIncomingChunk(finalChunk);
      }
    };

    // ── onerror: Handle errors gracefully ──
    recognition.onerror = (event) => {
      // These are benign — they fire when the engine restarts or hears nothing
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      console.error('[Voice] Error:', event.error, isMobile ? '(Mobile)' : '(Desktop)');

      if (event.error === 'not-allowed') {
        setError('Microphone access denied.');
        stopListeningFn();
      } else if (event.error === 'audio-capture' && isMobile) {
        // MOBILE FIX: On some mobile browsers, audio-capture error can occur
        // when the mic is briefly unavailable. Retry after a short delay.
        console.warn('[Voice] Mobile audio-capture error, retrying...');
        setTimeout(() => {
          if (isListeningRef.current) createAndStartRecognition();
        }, 500);
      } else if (event.error === 'network' && isMobile) {
        // MOBILE FIX: Network errors are common on mobile with poor connectivity
        setError('Network error. Check connection.');
      }
    };

    // ── onend: Auto-restart without resetting the buffer ──
    recognition.onend = () => {
      console.log('[Voice] Session Ended. Restarting...');
      setInterimText('');

      // CRITICAL: We do NOT reset masterTranscriptBufferRef or
      // lastSpeechTimestampRef here. The rolling buffer must persist
      // across engine restarts to maintain cross-chunk context.

      if (isListeningRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        // MOBILE FIX: Longer delay on mobile to let audio hardware fully reset
        // iOS Safari in particular needs more time between recognition sessions
        const restartDelay = isMobile ? 300 : 150;
        restartTimerRef.current = setTimeout(() => {
          if (isListeningRef.current) {
            createAndStartRecognition();
          }
        }, restartDelay);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('[Voice] Start failed:', e);
      // MOBILE FIX: Longer retry delay on mobile
      const retryDelay = isMobile ? 800 : 500;
      setTimeout(() => {
        if (isListeningRef.current) createAndStartRecognition();
      }, retryDelay);
    }
  }, [killRecognition, processIncomingChunk]);

  // ─────────────────────────────────────────────────────────────────────────
  // § 7: PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /** Stop recognition, release mic, but preserve the buffer for session continuity. */
  const stopListeningFn = useCallback(() => {
    console.log('[Voice] Manual Stop 🛑');
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText('');
    killRecognition();
    releaseStream();
  }, [killRecognition, releaseStream]);

  /** Toggle listening — request mic permission on first activation. */
  const startListening = useCallback(async () => {
    if (!SpeechRecognitionAPI || !enabled) return;

    // Toggle off if already listening
    if (isListeningRef.current) {
      stopListeningFn();
      return;
    }

    setError(null);

    // MOBILE FIX: Detect if we're on mobile for platform-specific handling
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // Tiered Browser-Agnostic Mic Request (Failsafe constraints for mobile compatibility)
    try {
      let stream;
      
      if (isIOS) {
        // iOS SPECIFIC: Use minimal constraints - iOS is very picky
        console.log('[Voice] iOS detected - using minimal audio constraints');
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          });
        } catch (e) {
          console.warn('[Voice] iOS minimal constraints failed, trying bare audio...');
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } else if (isMobile) {
        // Android: Start with basic constraints, fall back to raw
        console.log('[Voice] Android detected - using basic audio constraints');
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true } 
          });
        } catch (e) {
          console.warn('[Voice] Android basic constraints failed, trying raw audio...');
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } else {
        // Desktop: Full processing capabilities
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { autoGainControl: false, echoCancellation: true, noiseSuppression: true } 
          });
        } catch (e) {
          console.warn('[Voice] Desktop Tier 1 failed, dropping autoGainControl...');
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              audio: { echoCancellation: true, noiseSuppression: true } 
            });
          } catch (e2) {
            console.warn('[Voice] Desktop Tier 2 failed, requesting raw audio...');
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
        }
      }
      
      streamRef.current = stream;
      setAudioStream(stream);

      // MOBILE FIX: On iOS, we need to initialize audio analysis IMMEDIATELY after
      // getting the stream (within the same user gesture context) to avoid suspension
      if (isIOS) {
        // Initialize audio analysis right away for iOS
        initAudioAnalysis(stream);
      } else {
        // Other platforms: Short delay to let OS audio hardware settle
        setTimeout(() => {
          if (isListeningRef.current) initAudioAnalysis(stream);
        }, isMobile ? 100 : 250);
      }

    } catch (err) {
      setError(`Mic Access Denied: ${err.message}`);
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    // Reset the Acoustic-Semantic Lock state for a fresh session
    masterTranscriptBufferRef.current = [];
    lastSpeechTimestampRef.current = 0;
    isCommandLockActiveRef.current = false;
    energySamplesRef.current = [];

    isListeningRef.current = true;
    setIsListening(true);
    createAndStartRecognition();
  }, [enabled, stopListeningFn, createAndStartRecognition, initAudioAnalysis]);

  // ── Lifecycle cleanup ──
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      killRecognition();
      if (audioSourceRef.current) {
        try { audioSourceRef.current.disconnect(); } catch (e) { /* noop */ }
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch (e) { /* noop */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [killRecognition]);

  return {
    isListening,
    interimText,
    audioStream,
    volume,
    error,
    isSupported,
    startListening,
    stopListening: stopListeningFn,
  };
}
