// Sending one note's recap: check who is allowed -> work out each person's language ->
// build the email -> send it -> write down what happened.
// Pure code, so Jest can test the whole thing with a fake database and a fake email service.
// Nothing in here reaches the network by itself: `send` and `translate` are handed in.
import {
  MESSAGES,
  RecapError,
  languageName,
  noteUrlFor,
  renderRecap,
  sameLanguage,
  settingsUrlFor,
  type RecapBody,
  type RecapItem,
  type Sender,
} from './email.ts';

/**
 * The version of the translating rules a saved translation must have been made by.
 * Words saved by older rules are treated as if they were not there, exactly as the app does.
 * This must match PROMPT_VERSION in supabase/functions/translate/translate.ts and in
 * src/lib/translations.ts. __tests__/translate-claude-test.ts keeps them all in step.
 */
export const PROMPT_VERSION = 2;

type RpcResult = { data: unknown; error: { message: string } | null };

/** The small part of the Supabase admin client that we use. */
export type AdminLike = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResult> & {
    single<T>(): PromiseLike<{ data: T | null; error: { message: string } | null }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
};

/** One person who could get a recap. Every one of them is on the account. */
export type Recipient = {
  user_id: string;
  email: string;
  name: string;
  role: string;
  language: string;
  default_on: boolean;
};

/** A recipient with one extra thing the screen needs: whether this is the person asking. */
export type PreviewRecipient = Recipient & { is_you: boolean };

export type RecapSettings = { to_owner: boolean; to_members: boolean; auto_send: boolean };

/** What claim_recap hands back: the note, the settings, and everybody on the account. */
export type Claim = {
  account_id: string;
  /** Who owns the account. The automatic send borrows this id when it needs a translation. */
  owner_id: string;
  owner_name: string;
  note_title: string | null;
  note_date: string | null;
  summary_id: string;
  summary_language: string;
  overview: string | null;
  key_points: unknown;
  decisions: unknown;
  open_questions: unknown;
  action_items: unknown;
  settings: RecapSettings;
  recipients: Recipient[];
};

/** One email on its way out. */
export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/** Hands the email to the service and gives back the id it was given. */
export type SendEmail = (message: OutgoingEmail) => Promise<string>;

/**
 * Buys a translation of this note's summary into one language. Null when it could not be made.
 * `asUserId` is the person the translation is bought on behalf of, which the database uses to
 * check they are on the account. For the automatic send, that is the account owner.
 */
export type TranslateSummary = (language: string, asUserId: string) => Promise<unknown | null>;

export type RecapOptions = {
  admin: AdminLike;
  meetingId: string;
  /** Who pressed Send. Empty for the automatic send, which no person started. */
  userId: string | null;
  auto: boolean;
  /**
   * The people picked in the dialog, as ids. Left out means "use the saved settings".
   * An id that is not on the account is dropped, which is what makes it impossible to email
   * an address somebody typed in: an address is never an input, only an id.
   */
  recipientUserIds?: string[];
  appUrl: string;
  sender: Sender;
  maxRecipients: number;
  maxTranslations: number;
  send: SendEmail;
  /** Left out when a translation must not be bought. Then everybody gets the original words. */
  translate?: TranslateSummary;
};

/** What happened to one person's email. */
export type RecapOutcome = {
  email: string;
  name: string;
  language: string;
  translated: boolean;
  ok: boolean;
};

export type RecapRunResult = {
  sent: number;
  failed: number;
  outcomes: RecapOutcome[];
};

/** Raised when the person asking may not send this recap at all. */
export class RecapNotAllowedError extends Error {}

/**
 * Raised when the AUTOMATIC send has nothing to do: either the owner has it switched off, or
 * this note has already sent itself once. Neither is a problem anybody needs to see.
 */
export class RecapSkippedError extends Error {}

function claimProblem(message: string): Error {
  if (message.includes('not_ready')) return new RecapError(MESSAGES.notReady);
  if (message.includes('no_summary')) return new RecapError(MESSAGES.noSummary);
  if (message.includes('auto_off')) return new RecapSkippedError('auto_off');
  if (message.includes('already_sent')) return new RecapSkippedError('already_sent');
  if (message.includes('not_allowed')) return new RecapNotAllowedError('not_allowed');
  return new RecapError(MESSAGES.unknown);
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asItems(value: unknown): RecapItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      text: typeof row.text === 'string' ? row.text : '',
      owner: typeof row.owner === 'string' ? row.owner : null,
      due: typeof row.due === 'string' ? row.due : null,
    }))
    .filter((item) => item.text.trim() !== '');
}

/** The note's own words, in the language it was written in. */
export function originalBody(claim: Claim): RecapBody {
  return {
    title: (claim.note_title ?? '').trim(),
    overview: claim.overview ?? '',
    keyPoints: asStringList(claim.key_points),
    decisions: asStringList(claim.decisions),
    actionItems: asItems(claim.action_items),
  };
}

/**
 * Lays a saved translation over the note's own words.
 *
 * Only words are replaced. The title is left alone (a translated summary has no title in it),
 * and so is every to-do's owner, because a person's name is never translated. The translated
 * to-dos line up with the originals BY POSITION, so a list that comes back a different length
 * is refused rather than risking a to-do against the wrong name.
 */
export function translatedBody(claim: Claim, content: unknown): RecapBody | null {
  let value: unknown = content;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== PROMPT_VERSION) return null;
  if (typeof row.overview !== 'string') return null;

  const original = originalBody(claim);
  const translatedItems = Array.isArray(row.action_items) ? row.action_items : [];
  if (translatedItems.length !== original.actionItems.length) return null;

  return {
    title: original.title,
    overview: row.overview,
    keyPoints: asStringList(row.key_points),
    decisions: asStringList(row.decisions),
    actionItems: original.actionItems.map((item, i) => {
      const t = translatedItems[i] as Record<string, unknown> | undefined;
      return {
        text: typeof t?.text === 'string' && t.text.trim() !== '' ? t.text : item.text,
        owner: item.owner,
        due: typeof t?.due === 'string' ? t.due : item.due,
      };
    }),
  };
}

/** Reads a translation that is already saved. A plain read: nothing is bought here. */
async function readSavedTranslation(
  admin: AdminLike,
  summaryId: string,
  language: string,
): Promise<unknown | null> {
  const { data, error } = await admin
    .from('translations')
    .select('content')
    .eq('kind', 'summary')
    .eq('source_id', summaryId)
    .eq('language', language)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { content?: unknown }).content ?? null;
}

/** Goes through the one gate that decides whether this recap may happen at all. */
export async function claimRecap(o: {
  admin: AdminLike;
  meetingId: string;
  userId: string | null;
  auto: boolean;
}): Promise<Claim> {
  const { data, error } = await o.admin
    .rpc('claim_recap', { p_meeting_id: o.meetingId, p_user_id: o.userId, p_auto: o.auto })
    .single<Claim>();
  if (error || !data) throw claimProblem(error?.message ?? '');
  return data;
}

/**
 * Who would get this recap, without sending anything.
 * The dialog uses this to show the list with the saved settings already ticked.
 */
export async function previewRecap(o: {
  admin: AdminLike;
  meetingId: string;
  userId: string | null;
  auto: boolean;
}): Promise<{ recipients: PreviewRecipient[]; settings: RecapSettings; noteTitle: string }> {
  const claim = await claimRecap(o);
  return {
    // Which row is the person asking. The server knows, so the screen does not have to work it
    // out from an address, and the dialog needs no login of its own.
    recipients: (claim.recipients ?? []).map((person) => ({
      ...person,
      is_you: o.userId !== null && person.user_id === o.userId,
    })),
    settings: claim.settings,
    noteTitle: (claim.note_title ?? '').trim(),
  };
}

/**
 * Picks who the recap really goes to.
 *
 * With a list of ids (somebody ticked boxes), only people on the account whose id is in that
 * list. With no list, whoever the saved settings say. Either way the answer can only ever
 * contain people claim_recap handed us, so an address from outside the account cannot get in.
 */
export function chooseRecipients(
  all: Recipient[],
  picked: string[] | undefined,
  maxRecipients: number,
): Recipient[] {
  const chosen = picked
    ? all.filter((person) => picked.includes(person.user_id))
    : all.filter((person) => person.default_on);
  // Each address only once, however many times it was asked for.
  const seen = new Set<string>();
  return chosen
    .filter((person) => {
      const key = person.email.trim().toLowerCase();
      if (key === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxRecipients);
}

/**
 * Sends one note's recap to everybody who should get it, each in their own language, and writes
 * down the result of every single one.
 *
 * One person's email failing never stops the others, and a translation going wrong never stops
 * an email: that person gets the note in the language it was written in instead.
 */
export async function runRecap(o: RecapOptions): Promise<RecapRunResult> {
  const claim = await claimRecap(o);
  const people = chooseRecipients(claim.recipients ?? [], o.recipientUserIds, o.maxRecipients);
  if (people.length === 0) throw new RecapError(MESSAGES.nobody);

  const original = originalBody(claim);
  const noteUrl = noteUrlFor(o.appUrl, o.meetingId);
  const settingsUrl = settingsUrlFor(o.appUrl);

  // Work the languages out once, not once per person: two people who read Spanish share one
  // translation, so a team of five never buys the same words twice.
  const wanted = [...new Set(people.map((person) => person.language))];
  const bodies = new Map<string, { body: RecapBody; translated: boolean }>();
  let bought = 0;

  for (const language of wanted) {
    if (sameLanguage(language, claim.summary_language)) {
      bodies.set(language, { body: original, translated: false });
      continue;
    }

    let laid = translatedBody(claim, await readSavedTranslation(o.admin, claim.summary_id, language));

    // Nothing saved yet. Buy it once, then it is saved for good and free from here on.
    if (!laid && o.translate && bought < o.maxTranslations) {
      bought += 1;
      try {
        laid = translatedBody(claim, await o.translate(language, o.userId ?? claim.owner_id));
      } catch {
        // A translation that will not come is not a reason for nobody to get an email.
        laid = null;
      }
    }

    bodies.set(
      language,
      laid ? { body: laid, translated: true } : { body: original, translated: false },
    );
  }

  const outcomes: RecapOutcome[] = [];

  for (const person of people) {
    const picked = bodies.get(person.language) ?? { body: original, translated: false };
    const email = renderRecap({
      body: picked.body,
      date: claim.note_date,
      language: picked.translated ? person.language : claim.summary_language,
      translated: picked.translated,
      ownerName: claim.owner_name,
      noteUrl,
      settingsUrl,
      sender: o.sender,
    });

    let providerId: string | null = null;
    let problem: string | null = null;
    try {
      providerId = await o.send({
        to: person.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (e) {
      problem = e instanceof Error ? e.message : MESSAGES.unknown;
    }

    // Every attempt is written down, whether it worked or not.
    await o.admin.rpc('log_email', {
      p_account_id: claim.account_id,
      p_meeting_id: o.meetingId,
      p_recipient_user_id: person.user_id,
      p_recipient_email: person.email,
      p_language: picked.translated ? person.language : claim.summary_language,
      p_translated: picked.translated,
      p_result: problem === null ? 'sent' : 'failed',
      p_provider_id: providerId,
      p_error_message: problem,
      p_sent_by: o.userId,
      p_auto: o.auto,
    });

    outcomes.push({
      email: person.email,
      name: person.name,
      language: languageName(picked.translated ? person.language : claim.summary_language),
      translated: picked.translated,
      ok: problem === null,
    });
  }

  return {
    sent: outcomes.filter((outcome) => outcome.ok).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  };
}
