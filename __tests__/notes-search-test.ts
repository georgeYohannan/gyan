import fs from 'fs';
import path from 'path';

import {
  EMPTY_VIEW,
  filterCount,
  filtersFor,
  foundInSentence,
  isEmptyView,
  isFiltering,
  MARK_END,
  MARK_START,
  MAX_PAGE,
  plainSnippet,
  splitHighlight,
  viewFromParams,
  viewToParams,
  type ViewState,
} from '@/lib/notes-search';

describe('the two characters that mark a matched word', () => {
  // They are written in three places that cannot import one another: the database, the app, and
  // the browser scripts' stand-in server. If they ever drift apart, matched words stop being
  // marked and nothing else fails, which is exactly the kind of quiet break a test should catch.
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20261121150000_search_and_paging.sql'),
    'utf8',
  );
  const fixture = fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'fixtures', 'fake-api.ts'),
    'utf8',
  );

  test('the app, the database and the browser scripts all use the same two', () => {
    expect(MARK_START).toBe('');
    expect(MARK_END).toBe('');
    // 57344 and 57345 are U+E000 and U+E001 written the way Postgres writes a character.
    expect(MARK_START.codePointAt(0)).toBe(57344);
    expect(MARK_END.codePointAt(0)).toBe(57345);
    expect(migration).toContain('chr(57344)');
    expect(migration).toContain('chr(57345)');
    expect(fixture).toContain("MARK_START = '\\uE000'");
    expect(fixture).toContain("MARK_END = '\\uE001'");
  });

  test('they are not html, because nothing in this app renders html', () => {
    expect(MARK_START).not.toContain('<');
    expect(migration).not.toMatch(/StartSel=</);
  });
});

describe('splitting a snippet into plain and matched words', () => {
  const mark = (text: string) => `${MARK_START}${text}${MARK_END}`;

  test('it marks the matched words and leaves the rest alone', () => {
    expect(splitHighlight(`We talked about ${mark('pricing')} again`)).toEqual([
      { text: 'We talked about ', match: false },
      { text: 'pricing', match: true },
      { text: ' again', match: false },
    ]);
  });

  test('several matches in one snippet all come through', () => {
    const parts = splitHighlight(`${mark('budget')} and ${mark('budget')} again`);
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['budget', 'budget']);
  });

  test('no marks at all is just words', () => {
    expect(splitHighlight('nothing marked here')).toEqual([{ text: 'nothing marked here', match: false }]);
  });

  // A snippet is made out of something a person said, and words a person said are never to be
  // trusted to be well formed. Every one of these must still give readable words back.
  test('a half-written mark still gives readable words', () => {
    expect(plainSnippet(`we said ${MARK_START}pricing`)).toBe('we said pricing');
    expect(plainSnippet(`we said ${MARK_END}pricing`)).toBe('we said pricing');
  });

  test('a mark inside a mark still gives readable words', () => {
    expect(plainSnippet(`${MARK_START}a${MARK_START}b${MARK_END} c`)).toBe('ab c');
  });

  test('marks and nothing else give nothing, not a crash', () => {
    expect(splitHighlight(`${MARK_START}${MARK_END}`)).toEqual([]);
    expect(splitHighlight('')).toEqual([]);
    expect(splitHighlight(undefined)).toEqual([]);
  });

  test('the marks themselves never reach the screen', () => {
    const parts = splitHighlight(`see ${mark('this')} now`);
    for (const part of parts) {
      expect(part.text).not.toContain(MARK_START);
      expect(part.text).not.toContain(MARK_END);
    }
  });
});

describe('the web address keeps the search and the filters', () => {
  const full: ViewState = {
    query: 'pricing',
    preset: 'custom',
    custom: { from: '2026-11-01', to: '2026-11-03' },
    statuses: ['Ready', 'Failed'],
    sources: ['upload', 'text'],
    openActions: true,
  };

  test('a whole view survives the round trip', () => {
    expect(viewFromParams(viewToParams(full))).toEqual(full);
  });

  test('an untouched Home leaves the address alone', () => {
    expect(viewToParams(EMPTY_VIEW)).toEqual({});
    expect(isEmptyView(EMPTY_VIEW)).toBe(true);
    expect(isEmptyView({ ...EMPTY_VIEW, query: 'x' })).toBe(false);
  });

  test('a preset is remembered as the choice, not as two dates', () => {
    // So a link kept overnight still means "the last 7 days" tomorrow, rather than this week.
    expect(viewToParams({ ...EMPTY_VIEW, preset: 'last7' })).toEqual({ preset: 'last7' });
  });

  test('custom dates are only kept while the range is custom', () => {
    const params = viewToParams({ ...EMPTY_VIEW, preset: 'today', custom: { from: '2026-11-01' } });
    expect(params.from).toBeUndefined();
  });

  test('a hand typed or half copied address still opens Home', () => {
    const view = viewFromParams({
      preset: 'whenever',
      status: 'Ready,Nonsense,Ready',
      source: 'upload,carrier pigeon',
      open: 'yes',
      from: 'last tuesday',
    });
    expect(view.preset).toBe('any');
    expect(view.statuses).toEqual(['Ready']); // the repeat is dropped too
    expect(view.sources).toEqual(['upload']);
    expect(view.openActions).toBe(false);
    expect(view.custom).toEqual({});
  });

  test('an empty address is an empty view', () => {
    expect(viewFromParams({})).toEqual(EMPTY_VIEW);
  });

  test('a key given twice is read rather than thrown away', () => {
    // Expo's own documentation does not say what it does with a repeated key, so the app joins
    // lists with commas -- and reads both shapes, in case it ever hands back an array.
    expect(viewFromParams({ status: ['Ready', 'Failed'] }).statuses).toEqual(['Ready', 'Failed']);
    expect(viewFromParams({ q: ['pricing', 'budget'] }).query).toBe('pricing');
  });

  test('the words searched for keep their spaces and quotes', () => {
    const view = viewFromParams(viewToParams({ ...EMPTY_VIEW, query: '"the budget" or pricing' }));
    expect(view.query).toBe('"the budget" or pricing');
  });
});

describe('turning a view into the question the database is asked', () => {
  const NOW = new Date(2026, 10, 21, 9, 30);

  test('a preset becomes two moments', () => {
    const filters = filtersFor({ ...EMPTY_VIEW, preset: 'today' }, NOW);
    expect(filters.from).toBe(new Date(2026, 10, 21).toISOString());
  });

  test('Any time asks about no dates', () => {
    const filters = filtersFor(EMPTY_VIEW, NOW);
    expect(filters.from).toBeUndefined();
    expect(filters.to).toBeUndefined();
  });

  test('"is anything narrowing the list?" counts the words as well as the filters', () => {
    expect(isFiltering(filtersFor(EMPTY_VIEW, NOW))).toBe(false);
    expect(isFiltering(filtersFor({ ...EMPTY_VIEW, query: 'pricing' }, NOW))).toBe(true);
    expect(isFiltering(filtersFor({ ...EMPTY_VIEW, openActions: true }, NOW))).toBe(true);
  });

  test('the Filters button counts filters, not search words', () => {
    expect(filterCount(filtersFor({ ...EMPTY_VIEW, query: 'pricing' }, NOW))).toBe(0);
    const three = filtersFor(
      { ...EMPTY_VIEW, preset: 'today', statuses: ['Ready'], openActions: true },
      NOW,
    );
    expect(filterCount(three)).toBe(3);
  });
});

describe('saying where the words were found', () => {
  test('one place, two places, three places', () => {
    expect(foundInSentence(['title'])).toBe('Found in the title');
    expect(foundInSentence(['title', 'transcript'])).toBe('Found in the title and the transcript');
    expect(foundInSentence(['transcript', 'summary', 'title'])).toBe(
      'Found in the title, the summary and the transcript',
    );
  });

  test('nowhere says nothing at all', () => {
    expect(foundInSentence([])).toBe('');
  });
});

describe('the page size', () => {
  test('a page can never be more than 30 notes, and the database says so too', () => {
    expect(MAX_PAGE).toBe(30);
    const migration = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20261121150000_search_and_paging.sql'),
      'utf8',
    );
    expect(migration).toContain('least(greatest(coalesce(p_limit, 10), 1), 30)');
  });
});
