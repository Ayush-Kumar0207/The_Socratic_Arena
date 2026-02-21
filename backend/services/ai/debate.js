/**
 * debate.js
 * -----------------------------------------------------------------------------
 * This module is responsible for debate orchestration.
 *
 * In previous steps, we built:
 * - RAG preprocessing (parse + chunk)
 * - Persona agents (Defender + Critic)
 *
 * Now, this file runs the turn-based loop so both personas can exchange arguments
 * in a predictable, sequential format.
 * -----------------------------------------------------------------------------
 */

/**
 * Helper: invokeActor
 * ---------------------------------------------------------------------------
 * Calls an actor chain safely, supporting either:
 * - actor.respond({ topic, priorContext })  OR
 * - actor.invoke({ topic, priorContext })
 *
 * Why this flexibility is useful:
 * - Different chain wrappers sometimes expose `respond` vs `invoke` methods.
 * - Supporting both keeps this loop reusable as architecture evolves.
 *
 * @param {{ respond?: Function, invoke?: Function }} actor - Defender or Critic chain object.
 * @param {string} topic - The immediate argument prompt for this turn.
 * @param {string} priorContext - Prior dialogue context to preserve continuity.
 * @returns {Promise<string>} Actor-generated message text.
 * @throws {Error} If actor interface is invalid or response is empty.
 */
const invokeActor = async (actor, topic, priorContext) => {
  // Validate actor object shape early for clearer debugging.
  if (!actor || (typeof actor.respond !== 'function' && typeof actor.invoke !== 'function')) {
    throw new Error('Invalid actor chain. Expected an object with respond() or invoke().');
  }

  // Build a normalized payload understood by our agent wrappers.
  const payload = {
    topic,
    priorContext,
  };

  // Prefer `respond` (used by our current agents.js), fallback to `invoke`.
  const rawOutput =
    typeof actor.respond === 'function'
      ? await actor.respond(payload)
      : await actor.invoke(payload);

  // Defensive validation so transcript never stores broken/empty content.
  if (!rawOutput || typeof rawOutput !== 'string' || !rawOutput.trim()) {
    throw new Error('Actor returned an empty or invalid response.');
  }

  return rawOutput.trim();
};

/**
 * runDebate
 * ---------------------------------------------------------------------------
 * Executes a turn-based debate between Critic and Defender.
 *
 * Turn plan per round:
 * 1) Critic attacks (Round 1 starts from initialTopic).
 * 2) Defender responds directly to Critic's latest claim.
 * 3) Next round repeats with Critic attacking Defender's latest claim.
 *
 * Context strategy:
 * - We keep a `debateTranscript` array with every message.
 * - Before each model call, we build a compact text context from transcript.
 * - This allows each actor to "remember" what was said and stay coherent.
 *
 * Error strategy:
 * - The entire loop is wrapped in try/catch.
 * - If any LLM call fails (timeout, API error, etc.), we gracefully stop,
 *   append an error marker, and return transcript collected so far.
 *
 * @param {{ respond?: Function, invoke?: Function }} defenderChain - Defender actor object.
 * @param {{ respond?: Function, invoke?: Function }} criticChain - Critic actor object.
 * @param {string} initialTopic - Original debate topic or prompt.
 * @param {number} [totalRounds=3] - Number of Critic->Defender exchange rounds.
 * @returns {Promise<Array<{speaker: string, text: string}>>} Full debate transcript.
 */
export const runDebate = async (
  defenderChain,
  criticChain,
  initialTopic,
  totalRounds = 3,
) => {
  // This array stores every turn in order for UI rendering and persistence.
  const debateTranscript = [];

  try {
    // Validate required input so failures are immediate and easy to understand.
    if (!initialTopic || typeof initialTopic !== 'string' || !initialTopic.trim()) {
      throw new Error('A non-empty initialTopic string is required to run a debate.');
    }

    // Normalize rounds to a positive integer.
    const rounds = Number.isInteger(totalRounds) && totalRounds > 0 ? totalRounds : 3;

    // `criticPrompt` is what the Critic receives each round.
    // Round 1 starts from initial topic; later rounds use Defender's last response.
    let criticPrompt = initialTopic.trim();

    // Main debate loop: each iteration adds exactly one Critic and one Defender turn.
    for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
      // Build rolling conversation context from all prior turns.
      const priorContextForCritic =
        debateTranscript.length > 0
          ? debateTranscript.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n')
          : 'No previous turns yet.';

      /**
       * Critic turn
       * ---------------------------------------------------------------------
       * Round 1 instruction: critique the initial topic and identify flaws.
       * Later rounds: attack the Defender's latest argument.
       */
      const criticInstruction =
        roundNumber === 1
          ? `Round ${roundNumber}: Analyze this topic and open with a strong critique, identifying key flaws.\n\nTopic:\n${criticPrompt}`
          : `Round ${roundNumber}: Attack the Defender's previous argument and expose weaknesses.\n\nDefender's last point:\n${criticPrompt}`;

      const criticText = await invokeActor(criticChain, criticInstruction, priorContextForCritic);

      debateTranscript.push({
        speaker: 'Critic',
        text: criticText,
      });

      // Build updated context including Critic's fresh turn for Defender.
      const priorContextForDefender = debateTranscript
        .map((turn) => `${turn.speaker}: ${turn.text}`)
        .join('\n');

      /**
       * Defender turn
       * ---------------------------------------------------------------------
       * Defender always responds to the Critic's latest argument.
       * This creates a clear attack/defend rhythm for each round.
       */
      const defenderInstruction = `Round ${roundNumber}: Defend the document against the Critic's latest argument.\n\nCritic's claim:\n${criticText}`;

      const defenderText = await invokeActor(
        defenderChain,
        defenderInstruction,
        priorContextForDefender,
      );

      debateTranscript.push({
        speaker: 'Defender',
        text: defenderText,
      });

      // Feed Defender's latest statement into next round's Critic prompt.
      criticPrompt = defenderText;
    }

    // Normal completion: return full transcript.
    return debateTranscript;
  } catch (error) {
    // Graceful failure: preserve all successful turns and record interruption.
    debateTranscript.push({
      speaker: 'System',
      text: `Debate stopped early due to an error: ${error.message}`,
    });

    return debateTranscript;
  }
};
