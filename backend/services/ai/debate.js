/**
 * debate.js
 * -----------------------------------------------------------------------------
 * Debate orchestration with strict pacing for Gemini free-tier rate limits.
 * -----------------------------------------------------------------------------
 */

/**
 * Helper: invokeActor
 * Calls actor.respond(...) or actor.invoke(...), validates output.
 */
const invokeActor = async (actor, topic, priorContext) => {
  if (!actor || (typeof actor.respond !== 'function' && typeof actor.invoke !== 'function')) {
    throw new Error('Invalid actor chain. Expected an object with respond() or invoke().');
  }

  const payload = { topic, priorContext };

  const rawOutput =
    typeof actor.respond === 'function'
      ? await actor.respond(payload)
      : await actor.invoke(payload);

  if (!rawOutput || typeof rawOutput !== 'string' || !rawOutput.trim()) {
    throw new Error('Actor returned an empty or invalid response.');
  }

  return rawOutput.trim();
};

/**
 * Helper: delay
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createCancelledError = () => new Error('CANCELLED_DEBATE: Debate cancelled by user request.');

const assertNotCancelled = (shouldCancel) => {
  if (typeof shouldCancel === 'function' && shouldCancel()) {
    throw createCancelledError();
  }
};

const cancellableDelay = async (ms, shouldCancel) => {
  const intervalMs = 250;
  let elapsed = 0;

  while (elapsed < ms) {
    assertNotCancelled(shouldCancel);
    const waitFor = Math.min(intervalMs, ms - elapsed);
    await delay(waitFor);
    elapsed += waitFor;
  }
};

const isRateLimitError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return status === 429 || message.includes('429') || message.includes('too many requests');
};

/**
 * runDebate
 * Critic speaks -> wait 6500ms -> Defender speaks -> wait 6500ms
 */
export const runDebate = async (
  defenderChain,
  criticChain,
  initialTopic,
  totalRounds = 3,
  onTurn = null,
  options = {},
) => {
  const debateTranscript = [];
  const { shouldCancel } = options;
  const strictStyleRules = [
    'CRITICAL RULE: Keep your response strictly under 3 to 4 sentences.',
    'Be concise, punchy, aggressive, and highly precise.',
    'Do not use fluff, filler words, or polite introductory phrases. Get straight to the point.',
  ].join('\n');

  try {
    if (!initialTopic || typeof initialTopic !== 'string' || !initialTopic.trim()) {
      throw new Error('A non-empty initialTopic string is required to run a debate.');
    }

    const rounds = Number.isInteger(totalRounds) && totalRounds > 0 ? totalRounds : 3;
    let criticPrompt = initialTopic.trim();

    for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
      // Stop immediately before making a new model call if a cancel signal arrived.
      // This is the key quota-saving guard: no more Gemini requests after cancellation.
      assertNotCancelled(shouldCancel);

      const priorContextForCritic =
        debateTranscript.length > 0
          ? debateTranscript.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n')
          : 'No previous turns yet.';

      const criticInstruction =
        roundNumber === 1
          ? `Round ${roundNumber}: Analyze this topic and open with a strong critique, identifying key flaws.\n\nTopic:\n${criticPrompt}\n\n${strictStyleRules}`
          : `Round ${roundNumber}: Attack the Defender's previous argument and expose weaknesses.\n\nDefender's last point:\n${criticPrompt}\n\n${strictStyleRules}`;

      const criticText = await invokeActor(criticChain, criticInstruction, priorContextForCritic);

      const criticTurn = { speaker: 'Critic', text: criticText };
      debateTranscript.push(criticTurn);
      if (typeof onTurn === 'function') onTurn(criticTurn);

      await cancellableDelay(6500, shouldCancel);
      assertNotCancelled(shouldCancel);

      const priorContextForDefender = debateTranscript
        .map((turn) => `${turn.speaker}: ${turn.text}`)
        .join('\n');

      const defenderInstruction = `Round ${roundNumber}: Defend the document against the Critic's latest argument.\n\nCritic's claim:\n${criticText}\n\n${strictStyleRules}`;
      const defenderText = await invokeActor(
        defenderChain,
        defenderInstruction,
        priorContextForDefender,
      );

      const defenderTurn = { speaker: 'Defender', text: defenderText };
      debateTranscript.push(defenderTurn);
      if (typeof onTurn === 'function') onTurn(defenderTurn);

      await cancellableDelay(6500, shouldCancel);
      criticPrompt = defenderText;
    }

    return debateTranscript;
  } catch (error) {
    const isCancelled = `${error?.message || ''}`.includes('CANCELLED_DEBATE');
    const isRateLimit = isRateLimitError(error);
    const systemTurn = isCancelled
      ? {
          speaker: 'System',
          text: 'Debate stopped by user. Generation ended before the next model call.',
        }
      : isRateLimit
        ? {
            speaker: 'System',
            text: 'Rate limit reached (429). Debate stopped safely. Please wait about 60 seconds and retry.',
          }
        : {
            speaker: 'System',
            text: `Debate stopped early due to an error: ${error.message}`,
          };

    debateTranscript.push(systemTurn);
    if (typeof onTurn === 'function') onTurn(systemTurn);

    const taggedError = new Error(
      isCancelled
        ? 'CANCELLED_DEBATE: Debate loop stopped by user.'
        : isRateLimit
        ? 'RATE_LIMIT_DEBATE: Google RPM limit reached during debate loop.'
        : error.message,
    );
    taggedError.cause = error;
    throw taggedError;
  }
};
