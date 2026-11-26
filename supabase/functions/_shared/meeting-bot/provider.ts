// What a meeting-bot service has to be able to do, said once, with no vendor named.
//
// WHY THIS FILE EXISTS. Gyan starts on Recall.ai. It may not stay there: Vexa is a third cheaper
// and Apache-2.0, Attendee's API is nearly the same shape, and self-hosting becomes arguable once
// the bill passes about $50 a month (docs/decisions/bot-provider.md). Swapping should be writing
// ONE new file and changing ONE line, not rewriting a feature.
//
// So the rule is: nothing outside `recall.ts` knows a URL, a field name, a status code or a price.
// Every screen and every other server function works in the words below. A test
// (__tests__/one-file-names-recall-test.ts) reads the whole project and fails if the word "recall"
// appears anywhere it should not, so this is a promise rather than an intention.

/** The three platforms Gyan sends a bot to. Nothing else is accepted. */
export const PLATFORMS = ['zoom', 'meet', 'teams'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** What people call each one, for a screen and for a plain message. */
export const PLATFORM_LABEL: Record<Platform, string> = {
  zoom: 'Zoom',
  meet: 'Google Meet',
  teams: 'Microsoft Teams',
};

/**
 * Where a bot has got to. These are the only six words the rest of Gyan knows.
 *
 *   joining    -- asking to be let in
 *   waiting    -- in the waiting room, nobody has let it in yet
 *   recording  -- in the call, recording
 *   processing -- the call has ended and the service is putting the recording together
 *   ready      -- the recording is in OUR storage. From here it is an ordinary note.
 *   failed     -- it never got in, or something went wrong. Always with a plain reason.
 *
 * They only ever go forwards. `record_bot_phase` in the database refuses anything else, because
 * status events really do arrive out of order.
 */
export const BOT_PHASES = ['joining', 'waiting', 'recording', 'processing', 'ready', 'failed'] as const;
export type BotPhase = (typeof BOT_PHASES)[number];

/** What the app shows for each phase. One word per state, never a colour on its own. */
export const PHASE_LABEL: Record<BotPhase, string> = {
  joining: 'Joining',
  waiting: 'In waiting room',
  recording: 'Recording',
  processing: 'Recording',
  ready: 'Ready',
  failed: 'Failed',
};

/** Everything needed to send a bot to a call. */
export type StartBotRequest = {
  meetingUrl: string;
  platform: Platform;
  /** What the bot is called in the call. Built from the account owner, never from this file. */
  botName: string;
  /** Gyan's own note id. Handed to the service so its events can say which note they are about. */
  noteId: string;
  /** The longest the bot may record for, from the plans table. Null means the plan has no limit. */
  maxMinutes: number | null;
  /** The notice the bot says in the meeting chat when it joins. From src/content/bot-consent.ts. */
  consentMessage: string;
  /** How long the service may keep its own copy of the recording. Gyan deletes it sooner. */
  retentionHours: number;
  apiKey: string;
  fetcher?: typeof fetch;
};

/**
 * One thing a meeting-bot service told us, translated into Gyan's own words.
 *
 * `ignore` is deliberately a first-class answer rather than an error. Recall.ai's own
 * documentation says "You should not treat the data.code and data.sub_code as an enum", so a code
 * nobody has seen before must be dropped quietly, not turned into a failed note.
 */
export type ProviderEvent =
  | { kind: 'phase'; externalId: string; noteId: string | null; phase: BotPhase; reason: string | null }
  | { kind: 'recording_ready'; externalId: string; noteId: string | null }
  | { kind: 'ignore'; why: string };

/** Where the finished recording can be fetched from, and how long it is. */
export type FoundAudio = {
  /** A link that needs no key of ours. It is fetched once and then forgotten. */
  url: string;
  /** What to tell our own storage the file is. */
  contentType: string;
  /** How long the recording is, when the service says. Null when it does not. */
  seconds: number | null;
};

export type MeetingBotProvider = {
  /** Goes in ai_usage.provider, so the admin page can see who was paid. */
  readonly name: string;
  /** What an hour of bot costs, for the cost row. A VENDOR price, so never in the plans table. */
  readonly usdPerHour: number;
  /** Send a bot to a call. Throws ProviderError with a plain message if it will not go. */
  startBot(request: StartBotRequest): Promise<{ externalId: string }>;
  /** Make the bot leave the call now. */
  stopBot(o: { externalId: string; apiKey: string; fetcher?: typeof fetch }): Promise<void>;
  /**
   * Is this really from the service, and what does it say?
   *
   * Takes the body as the RAW TEXT it arrived as, because a signature is over bytes and anything
   * that parses and re-prints JSON changes those bytes. Returns null when the signature does not
   * check out, and the caller then does nothing at all.
   */
  verifyEvent(o: { headers: Headers; rawBody: string; secret: string; now?: Date }): Promise<ProviderEvent | null>;
  /** Where to fetch the finished audio. Null when there is none to be had. */
  findAudio(o: { externalId: string; apiKey: string; fetcher?: typeof fetch }): Promise<FoundAudio | null>;
  /** Delete the service's own copy of the recording, now that Gyan has its own. */
  deleteRecording(o: { externalId: string; apiKey: string; fetcher?: typeof fetch }): Promise<void>;
};

/** Something the service refused, with words that can go straight on a screen. */
export class ProviderError extends Error {
  constructor(
    message: string,
    /** True when trying again later might work. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * The plain messages. They are here rather than in the vendor's file because they are Gyan's
 * words, not the vendor's, and they must not change when the vendor does.
 */
export const BOT_MESSAGES = {
  notEnabled: 'Meeting link is not switched on for this account yet.',
  noHours: 'Your plan does not include meeting bot hours. A bigger plan does.',
  hoursUsed: 'You have used all your meeting bot hours this month. They start again on the 1st.',
  dayCapAccount: 'This account has used its meeting bot time for today. Please try again tomorrow.',
  dayCapService:
    'Gyan has reached its meeting bot limit for today. This is a safety limit, not a problem with your account. Please try again tomorrow.',
  badLink:
    'Gyan could not read that as a meeting link. Paste the whole link to a Zoom, Google Meet or Microsoft Teams call.',
  couldNotStart: 'Gyan could not send a bot to that call just now. Please try again.',
  couldNotStop: 'Gyan could not reach the bot to stop it. It will leave by itself when the call ends.',
  noAudio: 'The call finished but Gyan could not get the recording.',
  tooLong: 'That call was longer than your plan allows for one note.',
  notFound: 'Gyan could not find that bot.',
  alreadyFinished: 'That bot has already finished.',
} as const;
