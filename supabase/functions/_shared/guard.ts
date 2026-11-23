// The checks every server function makes before it does anything.
//
// These used to be copied into all seven functions, which is how they drifted apart. One
// copy means a fix reaches every door at once.
//
// Nothing in here decides what a person may SEE. That stays where it was: in the database
// rules, and in the claim_* functions that check membership in SQL. This is the layer in
// front of that.

declare const Deno: { env: { get(name: string): string | undefined } };

/**
 * A real UUID: five groups of hex, the right lengths.
 *
 * The old check was /^[0-9a-f-]{36}$/i, which happily accepted thirty-six dashes. Nothing
 * bad came of it, because Postgres refused the value a moment later, but a check that
 * accepts obvious rubbish is not a check.
 *
 * The version and variant digits are deliberately NOT pinned. Every id Gyan makes is a
 * version 4, but ids also come from Supabase's own tables, and refusing a perfectly good id
 * because a future Supabase release numbers it differently would be a self-inflicted outage.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supabase gives keys either as one plain value (older) or as a small JSON list (newer). */
export function pickKey(plainName: string, jsonName: string): string | undefined {
  const plain = Deno.env.get(plainName);
  if (plain) return plain;
  try {
    return JSON.parse(Deno.env.get(jsonName) ?? '{}').default;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Is this one of our own server functions calling?
// ---------------------------------------------------------------------------

/**
 * Compares two secrets without letting the time taken give the answer away.
 *
 * The old version used `===`. Comparing strings with `===` stops at the first character
 * that differs, so the time it takes leaks how much of a guess was right. Over enough
 * attempts that is a way to work out a key one character at a time. It was a thin risk here
 * -- the noise of the internet swamps the signal -- but this is the project's most powerful
 * secret, and the fix is six lines.
 *
 * Both values are hashed first, so even the LENGTH of the real key is not given away.
 */
async function sameSecret(given: string, real: string): Promise<boolean> {
  if (given === '' || real === '') return false;
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(given), digest(real)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/**
 * True when this call came from one of our OWN server functions, not from a person.
 *
 * The only thing holding the project's secret key is our own server code, so a request
 * carrying it is ours. The recap function uses this to buy a translation for somebody it is
 * emailing, including on the automatic send where there is no login to read.
 *
 * It does NOT widen what may happen. Such a call still has to name the person it is acting
 * for, and the claim_* function still checks in SQL that that person is on the note's
 * account. The decision stays in the database.
 */
export async function isOurOwnServer(authHeader: string, secretKey: string): Promise<boolean> {
  return await sameSecret(authHeader.replace(/^Bearer\s+/i, '').trim(), secretKey);
}

// ---------------------------------------------------------------------------
// Which websites may call us
// ---------------------------------------------------------------------------

/**
 * Cross-origin rules, worked out per request rather than handed out to everybody.
 *
 * Two honest notes about what this does and does not do.
 *
 * It is NOT what stands between an attacker and your notes. These functions are opened with
 * a bearer token, not a cookie, so a hostile website cannot make a call as you: it has no
 * token to send. What this adds is depth -- if a token ever did leak into a page, that page
 * still could not read the answer.
 *
 * The PHONE APP SENDS NO ORIGIN at all, and cross-origin rules are a browser idea that
 * native apps ignore. So a request with no Origin is answered normally. Refusing those would
 * break iPhone and Android and protect nobody.
 */
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = allowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
  };
  // No Origin: a phone, or our own server calling itself. Nothing to decide.
  if (origin === '') return headers;
  // A browser we know. Name it back, so only that one may read the answer.
  if (allowed.includes(origin)) return { ...headers, 'Access-Control-Allow-Origin': origin };
  // A browser we do not know. Say nothing, and the browser throws the answer away.
  return headers;
}

function allowedOrigins(): string[] {
  const list: string[] = [];
  const appUrl = Deno.env.get('GYAN_APP_URL');
  if (appUrl) {
    try {
      list.push(new URL(appUrl).origin);
    } catch {
      /* a setting that is not a web address is simply ignored */
    }
  }
  // While building, the web app runs on localhost. Set GYAN_ALLOW_LOCALHOST=0 for the live
  // project so a page on somebody's own machine cannot read anything (see docs/testing).
  if (Deno.env.get('GYAN_ALLOW_LOCALHOST') !== '0') {
    for (const port of [8081, 8082, 19006, 3000]) {
      list.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Thrown when somebody has had their turn for this hour. */
export class RateLimited extends Error {
  constructor(public readonly kind: string) {
    super('rate_limited');
    this.name = 'RateLimited';
  }
}

/** Plain words for being asked to wait, with no numbers in it to argue about. */
export const RATE_LIMIT_MESSAGE =
  'Gyan is catching up with what you have already asked for. Please try again in a few minutes.';

type Rpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>;
};

/**
 * Counts this go against the limits in the security_settings table, and throws RateLimited
 * when there have been enough for one hour.
 *
 * Every number comes from that table. There is none in this file on purpose: a limit written
 * into code is a limit nobody can change without a new release.
 *
 * If the counter itself cannot be reached, this LETS THE REQUEST THROUGH. That is a
 * deliberate choice between two bad outcomes: a database hiccup that stops everybody working,
 * or a database hiccup that briefly stops counting. The monthly meeting limit and the daily
 * chat limit are enforced separately, inside the claim_* functions, so the things that cost
 * the most money are still capped either way.
 */
export async function underRateLimit(
  admin: Rpc,
  kind: string,
  userId: string | null,
  accountId: string | null,
): Promise<void> {
  const { error } = await admin.rpc('check_rate_limit', {
    p_kind: kind,
    p_user_id: userId,
    p_account_id: accountId,
  });
  if (!error) return;
  if ((error.message ?? '').includes('rate_limited')) throw new RateLimited(kind);
  // The KIND of problem only. Never the key, the person, or anything they said.
  console.error('could not check the limit for', kind, 'carrying on');
}
