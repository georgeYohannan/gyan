// Settings for the translate function. Change them here, not inside the code.
// These are separate from the summary and chat settings on purpose, so translation can be tuned
// (or moved to a cheaper model) without touching either of those.

/**
 * The Claude model that translates.
 * Claude Sonnet 5.5 is the same model that writes the summaries and answers the chat. Founder's
 * choice: one model to keep track of, and the strongest of the cheap models on Hindi, Arabic and
 * Japanese, which are the scripts Gyan is tested with.
 * Claude Haiku 5.5 would be about 20 times cheaper for the same job, if cost ever becomes the
 * problem. To change model later, change only this line.
 */
export const CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * How hard the model thinks before it answers: 'low', 'medium' or 'high'.
 * Translating is careful copying, not puzzle solving, so 'low' is right. Raise it only if
 * translations start losing the meaning.
 */
export const CLAUDE_EFFORT = 'low';

/**
 * The most one translation may be.
 * Translated text needs more room than the words it came from. Hindi, Arabic and Japanese use
 * noticeably more tokens than English for the same meaning, so this is roughly 3 times
 * MAX_TRANSCRIPT_TOKENS below.
 */
export const CLAUDE_MAX_TOKENS = 16_000;

/**
 * What Claude charges, used only to log cost in ai_usage.
 * Claude Sonnet 5.5: $2.00 per million tokens in, $10.00 per million out
 * (platform.claude.com pricing, checked 2026-11-18).
 * Translating a summary costs about a cent. Translating a transcript costs more, because there
 * are far more words. Either way it is paid once and then saved for good.
 * These are NOT plan prices, so they are not in the plans table.
 */
export const USD_PER_MTOK_IN = 2.0;
export const USD_PER_MTOK_OUT = 10.0;

/**
 * The longest transcript we will translate in one request.
 * A Supabase server function is stopped after 150 seconds, and one long translation is one long
 * answer, so there is a real ceiling here. Above it we say so in plain words. We never cut a
 * transcript short and we never translate half of it.
 * 6,000 tokens is roughly 4,500 English words, about 30 minutes of talking.
 * Summaries are always small, so this never affects them.
 * If longer notes are needed, the plan is to split the transcript into batches and translate them
 * at the same time; that is a change to pipeline.ts only.
 */
export const MAX_TRANSCRIPT_TOKENS = 6_000;

/**
 * Very rarely a safety check makes the model decline a request. With this on, the service tries
 * another model in the same call instead of the translation failing. Set it to false to turn that off.
 */
export const USE_REFUSAL_FALLBACK = true;
