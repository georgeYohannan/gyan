// Settings for the summarize function. Change them here, not inside the code.

/**
 * The Claude model that writes the summary.
 * Claude Sonnet 5.5 was chosen: it is good at meeting notes, it can be told to answer in a strict
 * shape (so the app always gets readable data), and it costs about half of the Opus model.
 * To change model later, change only this line (see docs/decisions.md).
 */
export const CLAUDE_MODEL = 'claude-sonnet-5-5';

/**
 * How hard the model thinks before it answers: 'low', 'medium' or 'high'.
 * 'low' is right for summarizing, which is reading work rather than puzzle work. It is also the
 * fastest and cheapest. Raise it if summaries of messy meetings miss things.
 */
export const CLAUDE_EFFORT = 'low';

/** The most the answer may be. A summary is short, so this is generous already. */
export const CLAUDE_MAX_TOKENS = 8000;

/**
 * What Claude charges, used only to log cost in ai_usage.
 * Claude Sonnet 5.5: $2.00 per million tokens in, $10.00 per million out
 * (platform.claude.com pricing, checked 2026-11-17). About 4 to 6 cents for a 1 hour meeting.
 * This is NOT a plan price, so it is not in the plans table.
 */
export const USD_PER_MTOK_IN = 2.0;
export const USD_PER_MTOK_OUT = 10.0;

/**
 * The most transcript we will send in one request. The model can hold about 1,000,000 tokens,
 * which is roughly 100 hours of talking, so no normal meeting comes close.
 * If a note is somehow bigger, we stop and say so. We never cut the text off quietly.
 */
export const MAX_INPUT_TOKENS = 150_000;

/**
 * Very rarely a safety check makes the model decline a request. With this on, the service tries
 * another model in the same call instead of the note failing. Set it to false to turn that off.
 */
export const USE_REFUSAL_FALLBACK = true;
