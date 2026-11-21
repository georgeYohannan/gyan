// Web security headers.
//
// WHY THIS FILE EXISTS. Everything about the app still lives in app.json; this file reads it
// and adds the headers on top. It has to be code rather than settings because one part of
// the policy has to be different while you are building: the development server talks to
// itself over a websocket to reload the page when a file changes, and a policy strict
// enough for the real web app would block that and make the app undevelopable.
//
// HOW THE HEADERS GET APPLIED. Expo Router takes a `headers` option and applies it to every
// page it serves (checked in the current Expo docs for SDK 54+; this project is on 58, and
// web output is "server", so they really do apply). Expo Hosting adds
// Strict-Transport-Security by itself; it is named here too, so the headers do not depend on
// which host you end up using.
//
// WHAT THESE DO NOT DO. None of this protects the DATA. The database rules do that. These
// headers protect the PAGE: they stop Gyan being put inside somebody else's website, stop a
// browser guessing that a file is something other than it says, and make it very much harder
// for an injected script to do anything useful if one ever got in.

const development = process.env.NODE_ENV !== 'production';

/**
 * Where the page is allowed to talk to.
 *
 * Supabase is named by its shape rather than by this project's address, because the test
 * project and a future live project have different addresses and the policy should not have
 * to be edited to move between them.
 *
 * In development the Metro server is added, which is what reloads the page as files change.
 */
/**
 * OUR OWN PROJECT BY NAME, not every Supabase project in the world.
 *
 * This started as `https://*.supabase.co`, and that quietly undid the most useful line in
 * the whole policy. Anybody can make a free Supabase project and get their own address at
 * that domain, so a wildcard means an injected script could post somebody's notes to
 * `https://whoever.supabase.co` and the policy would allow it. The stated reason the
 * inline-script allowance is acceptable is that a script would have nowhere to send what it
 * took -- so the wildcard cancelled the thing it was leaning on.
 *
 * Taken from EXPO_PUBLIC_SUPABASE_URL at the moment the app is built, which is the same
 * value the app itself talks to. If it is missing, no Supabase address is allowed at all
 * rather than all of them: a missing setting must never widen a policy.
 */
function supabaseOrigins() {
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!configured) return [];
  try {
    const { host } = new URL(configured);
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return [];
  }
}

const connect = [
  "'self'",
  ...supabaseOrigins(),
  ...(development ? ['ws://localhost:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'http://127.0.0.1:*'] : []),
].join(' ');

/**
 * The Content Security Policy, line by line and with the reason for each.
 *
 * Two of these say 'unsafe-inline', and that is worth being straight about rather than
 * quietly leaving in:
 *
 *   style-src   React Native for web turns every style into an inline style. There is no
 *               version of this app that works without it. This is the normal cost of
 *               React Native on the web.
 *   script-src  The page Expo serves carries a small inline script that starts the app.
 *               Removing this needs Expo to put a nonce on that script, which it does not
 *               do today.
 *
 * So the policy is not the strongest one that exists. What it still does, and what carries
 * most of the value, is everything that is NOT about inline code: nothing may be loaded from
 * another website, the page cannot be framed, there are no plugins, and a form cannot post
 * anywhere else. An injected script could still run, but it could not send anything it stole
 * to an attacker, because connect-src refuses every address but ours.
 */
const contentSecurityPolicy = [
  // Nothing from anywhere else unless a line below allows it.
  "default-src 'self'",
  // See the note above. 'unsafe-eval' is added ONLY while building: the development
  // bundler rebuilds code as you save and may run it with eval, and a policy that blocks
  // that would make the app impossible to work on -- and would fail every browser test at
  // once, since those run against the development server. The real web app never gets it.
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Pictures the app bundles, plus the ones it makes in the browser (a file somebody picks
  // becomes a blob: address) and small built-in ones (data:).
  "img-src 'self' data: blob:",
  // Fonts ship with the app. IBM Plex and Schibsted Grotesk are bundled, not fetched.
  "font-src 'self' data:",
  // Recordings: ones in the browser before upload, and ones played back from storage.
  `media-src 'self' blob: ${supabaseOrigins().filter((o) => o.startsWith('https:')).join(' ')}`.trim(),
  // The MP3 maker runs in a worker built in the browser.
  "worker-src 'self' blob:",
  `connect-src ${connect}`,
  // THE PARTS THAT MATTER MOST, and that nothing weakens.
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
].join('; ');

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    // The headers hang off expo-router, which is the thing that serves the pages.
    [
      'expo-router',
      {
        headers: {
          'Content-Security-Policy': contentSecurityPolicy,
          // Gyan may not be put inside another website. frame-ancestors above says the same
          // thing to newer browsers; this is for older ones.
          'X-Frame-Options': 'DENY',
          // A browser must believe what a file says it is, and not guess from its contents.
          'X-Content-Type-Options': 'nosniff',
          // When somebody follows a link out of Gyan, the other site is told which site they
          // came from, never which page. A note's address can say what a meeting was about.
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          // Switch off things Gyan has no use for. The microphone is deliberately left ON,
          // because recording is the whole product.
          'Permissions-Policy': [
            'camera=()',
            'geolocation=()',
            'payment=()',
            'usb=()',
            'magnetometer=()',
            'gyroscope=()',
            'accelerometer=()',
            'microphone=(self)',
          ].join(', '),
          // Always come back over an encrypted connection. Left off while building, where
          // there is no encryption and this would make localhost unreachable in a browser
          // that remembered it.
          ...(development
            ? {}
            : { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
          // Keep Gyan's pages out of other sites' windows.
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
    ],
    ...(config.plugins ?? []).filter((p) => p !== 'expo-router' && p?.[0] !== 'expo-router'),
  ],
});
