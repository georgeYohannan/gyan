/**
 * The headers the web app sends with every page.
 *
 * These are read out of app.config.js by running it, exactly as Expo does, rather than by
 * matching text in a file. A test that greps for a string would still pass if the config
 * stopped being wired to Expo at all.
 *
 * What these protect is the PAGE, not the data. The database rules protect the data. A
 * header stops Gyan being put inside somebody else's website, stops a browser guessing that
 * a file is something other than it says, and makes an injected script far less useful.
 */
function headersFor(mode: 'development' | 'production'): Record<string, string> {
  const before = process.env.NODE_ENV;
  const beforeUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  process.env.NODE_ENV = mode;
  // Set here rather than read from the environment: Jest does not load the .env files, and
  // the policy is built from this value at the moment the app is built.
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://ofnspnobzesxmyqjxzad.supabase.co';
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const makeConfig = require('../app.config.js') as (a: { config: Record<string, unknown> }) => {
    plugins: unknown[];
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const base = (require('../app.json') as { expo: Record<string, unknown> }).expo;
  const config = makeConfig({ config: base });
  process.env.NODE_ENV = before;
  process.env.EXPO_PUBLIC_SUPABASE_URL = beforeUrl;

  const router = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-router') as [
    string,
    { headers: Record<string, string> },
  ];
  return router[1].headers;
}

const live = headersFor('production');
const building = headersFor('development');
const policy = (headers: Record<string, string>, name: string) =>
  new RegExp(`${name} ([^;]*)`).exec(headers['Content-Security-Policy'])?.[1] ?? '';

describe('the headers the real web app sends', () => {
  test('GYAN CANNOT BE PUT INSIDE SOMEBODY ELSE’S WEBSITE', () => {
    // Two ways of saying it, because older browsers only understand the second.
    expect(policy(live, 'frame-ancestors')).toBe("'none'");
    expect(live['X-Frame-Options']).toBe('DENY');
  });

  test('a browser must believe what a file says it is', () => {
    expect(live['X-Content-Type-Options']).toBe('nosniff');
  });

  test('A NOTE’S ADDRESS IS NEVER HANDED TO ANOTHER WEBSITE', () => {
    // An address can say what a meeting was about, so another site is told the site somebody
    // came from and never the page.
    expect(live['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  test('always come back over an encrypted connection', () => {
    expect(live['Strict-Transport-Security']).toContain('max-age=31536000');
  });

  test('things Gyan has no use for are switched off, but recording is not', () => {
    const allowed = live['Permissions-Policy'];
    for (const off of ['camera=()', 'geolocation=()', 'payment=()', 'usb=()']) {
      expect(allowed).toContain(off);
    }
    // The microphone stays on. Recording is the product.
    expect(allowed).toContain('microphone=(self)');
  });

  test('NOTHING MAY BE LOADED FROM ANOTHER WEBSITE', () => {
    expect(policy(live, 'default-src')).toBe("'self'");
    expect(policy(live, 'object-src')).toBe("'none'");
    expect(policy(live, 'base-uri')).toBe("'self'");
    expect(policy(live, 'form-action')).toBe("'self'");
  });

  test('AND NOTHING MAY BE SENT ANYWHERE BUT OURS', () => {
    // This is the line that matters most. Even if a script did get in, it would have
    // nowhere to send what it stole.
    const connect = policy(live, 'connect-src');
    expect(connect).toContain("'self'");
    // OUR OWN PROJECT BY NAME. A wildcard here would quietly undo the whole point: anybody
    // can make a free Supabase project, so https://*.supabase.co would let an injected
    // script post somebody's notes to their own one.
    expect(connect).toContain('https://ofnspnobzesxmyqjxzad.supabase.co');
    expect(connect).not.toContain('*.supabase.co');
    expect(connect).not.toContain('localhost');
  });

  test('the real web app never allows code to be built from text', () => {
    // 'unsafe-eval' is the one that turns an injected string into running code.
    expect(live['Content-Security-Policy']).not.toContain('unsafe-eval');
  });

  test('inline styles and scripts ARE allowed, and here is why', () => {
    // Being honest in a test rather than quiet about it. React Native for web turns every
    // style into an inline style, and the page Expo serves starts the app with an inline
    // script. Neither can be removed without Expo changing. The parts above carry the value.
    expect(policy(live, 'style-src')).toContain("'unsafe-inline'");
    expect(policy(live, 'script-src')).toContain("'unsafe-inline'");
  });

  test('recordings can be played back, and picked before they are uploaded', () => {
    expect(policy(live, 'media-src')).toContain('blob:');
    // Named, not wildcarded, for the same reason as connect-src.
    expect(policy(live, 'media-src')).toContain('https://ofnspnobzesxmyqjxzad.supabase.co');
    expect(policy(live, 'media-src')).not.toContain('*.supabase.co');
    expect(policy(live, 'img-src')).toContain('blob:');
    // The MP3 maker runs in a worker built in the browser.
    expect(policy(live, 'worker-src')).toContain('blob:');
  });

  test('fonts ship with the app, so none is fetched from anywhere', () => {
    expect(policy(live, 'font-src')).toBe("'self' data:");
  });
});

describe('while building, and only while building', () => {
  test('THE WILDCARD IS DEVELOPMENT ONLY, and the real app never gets it', () => {
    // The browser scripts run against a made-up Supabase address, and the settings they
    // build the app with are not always the ones app.config.js is read with, so pinning
    // the policy to one address in development blocks signing in altogether.
    expect(policy(building, 'connect-src')).toContain('https://*.supabase.co');
    // And this is the half that matters: the real web app gets one address, by name.
    expect(policy(live, 'connect-src')).not.toContain('*');
    expect(policy(live, 'connect-src')).toContain('https://ofnspnobzesxmyqjxzad.supabase.co');
  });

  test('the development server is allowed what it needs', () => {
    // The bundler reloads the page over a websocket to localhost, and may run code it has
    // just built. Blocking either would make the app impossible to work on -- and would
    // fail every browser test at once, since those run against this server.
    expect(policy(building, 'connect-src')).toContain('ws://localhost:*');
    expect(building['Content-Security-Policy']).toContain("'unsafe-eval'");
    // No forced encryption on localhost, where there is none to force.
    expect(building['Strict-Transport-Security']).toBeUndefined();
  });

  test('AND THE REAL WEB APP GETS NONE OF IT', () => {
    expect(policy(live, 'connect-src')).not.toContain('ws://localhost');
    expect(live['Content-Security-Policy']).not.toContain('unsafe-eval');
    expect(live['Strict-Transport-Security']).toBeDefined();
  });
});

describe('the rest of the app settings survive', () => {
  test('the splash screen plugin is still there, with its settings', () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const makeConfig = require('../app.config.js') as (a: { config: Record<string, unknown> }) => Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const base = (require('../app.json') as { expo: Record<string, unknown> }).expo;
    const config = makeConfig({ config: base });
    process.env.NODE_ENV = before;

    const names = (config.plugins as unknown[]).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain('expo-splash-screen');
    // expo-router appears once, not twice.
    expect(names.filter((n) => n === 'expo-router')).toHaveLength(1);
    // And everything else from app.json came through untouched.
    expect(config.name).toBe('gyan');
    expect((config.web as { output?: string }).output).toBe('server');
  });
});
