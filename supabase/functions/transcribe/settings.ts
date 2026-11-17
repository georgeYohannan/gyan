// Settings for the transcribe function. Change them here, not inside the code.

/** The Deepgram model. Nova-3 is the one we chose. */
export const DEEPGRAM_MODEL = 'nova-3';

/**
 * What Deepgram charges per audio minute, used only to log cost in ai_usage.
 * Nova-3 multilingual, pre-recorded: $0.0052 (deepgram.com/pricing, checked 2026-11-17).
 * Speaker labels cost nothing extra. This is NOT a plan price, so it is not in the plans table.
 */
export const DEEPGRAM_USD_PER_MINUTE = 0.0052;

/** How long the private link we give Deepgram stays valid. */
export const SIGNED_LINK_SECONDS = 600;
