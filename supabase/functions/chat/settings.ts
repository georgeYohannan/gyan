// Settings for the chat function. Change them here, not inside the code.
// These are separate from the summary settings on purpose, so the chat can be tuned (or moved to
// another model) without touching summaries.

/**
 * The Claude model that answers questions about a note.
 * Claude Sonnet 5.5 is the same model that writes the summaries. Answering a question from
 * passages that are right in front of it is reading work, not puzzle work, so the cheaper and
 * faster model is the right one. To change model later, change only this line.
 */
export const CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * How hard the model thinks before it answers: 'low', 'medium' or 'high'.
 * 'low' keeps answers quick and cheap. Raise it if answers start missing things that are clearly
 * in the transcript.
 */
export const CLAUDE_EFFORT = 'low';

/** The most one answer may be. Answers are meant to be short, so this is already generous. */
export const CLAUDE_MAX_TOKENS = 2000;

/**
 * What Claude charges, used only to log cost in ai_usage.
 * Claude Sonnet 5.5: $2.00 per million tokens in, $10.00 per million out, and $0.10 per million
 * for words it has already read before (platform.claude.com pricing, checked 2026-11-18).
 * A question about a 1 hour meeting costs well under a cent; follow-up questions cost less again,
 * because the transcript is only paid for in full the first time.
 * These are NOT plan prices, so they are not in the plans table.
 */
export const USD_PER_MTOK_IN = 2.0;
export const USD_PER_MTOK_OUT = 10.0;
export const USD_PER_MTOK_CACHE_READ = 0.1;

/**
 * The most transcript we will send in one request. The model can hold about 1,000,000 tokens,
 * roughly 100 hours of talking, so no normal meeting comes close.
 * If a note is somehow bigger, we stop and say so. We never cut the text off quietly.
 */
export const MAX_INPUT_TOKENS = 150_000;

/**
 * How much of the conversation so far is sent back with each new question: the last 10 questions
 * and their 10 answers. Older messages stay saved and on screen, they are just not re-sent.
 */
export const MAX_HISTORY_MESSAGES = 20;

/**
 * Very rarely a safety check makes the model decline a request. With this on, the service tries
 * another model in the same call instead of the question failing. Set it to false to turn that off.
 */
export const USE_REFUSAL_FALLBACK = true;
