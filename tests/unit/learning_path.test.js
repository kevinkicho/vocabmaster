/**
 * Learning path helpers — dual-universe filters & unit slicing
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'learning_path.js'), 'utf8');

let filterListByTagsStrict, sliceUnitWordIds, defaultPathProfile, buildTierUnitPlan;

beforeAll(() => {
  const g = globalThis;
  g.window = g;
  g.LEVEL_CONFIG = {
    groups: [
      { key: 'jlpt', levels: ['N5', 'N4', 'N3'] },
      { key: 'cefr', levels: ['A1', 'A2'] }
    ]
  };
  // eval path module
  // eslint-disable-next-line no-eval
  eval(src.replace(/window\./g, 'globalThis.'));
  filterListByTagsStrict = g.filterListByTagsStrict;
  sliceUnitWordIds = g.sliceUnitWordIds;
  defaultPathProfile = g.defaultPathProfile;
  buildTierUnitPlan = g.buildTierUnitPlan;
});

describe('filterListByTagsStrict', () => {
  const list = [
    { id: 1, tags: ['N5'] },
    { id: 2, tags: ['N4'] },
    { id: 3, tags: ['N5', 'A1'] },
    { id: 4, tags: [] }
  ];
  it('filters by tag and never expands empty', () => {
    expect(filterListByTagsStrict(list, ['N5']).map((x) => x.id)).toEqual([1, 3]);
    expect(filterListByTagsStrict(list, ['N1'])).toEqual([]);
  });
  it('all returns copy of full list', () => {
    expect(filterListByTagsStrict(list, ['all']).length).toBe(4);
  });
});

describe('sliceUnitWordIds', () => {
  const list = [];
  for (let i = 1; i <= 100; i++) list.push({ id: i, tags: ['N5'] });
  it('slices stable units of size 40', () => {
    const u0 = sliceUnitWordIds(list, 'N5', 0, 40);
    const u1 = sliceUnitWordIds(list, 'N5', 1, 40);
    expect(u0.length).toBe(40);
    expect(u0[0]).toBe(1);
    expect(u1[0]).toBe(41);
    expect(u0).not.toContain(41);
  });
});

describe('defaultPathProfile', () => {
  it('defaults to guided path for daily learning', () => {
    const p = defaultPathProfile({ presetTarget: 'ja', presetSource: 'en' });
    expect(p.pathMode).toBe('guided');
    expect(p.framework).toBe('jlpt');
    expect(p.placementStatus).toBe('skipped');
  });
});

describe('UNIT_THEME_CATALOG', () => {
  it('has curated themes for chat scenarios', () => {
    const cat = globalThis.UNIT_THEME_CATALOG;
    expect(Array.isArray(cat)).toBe(true);
    expect(cat.length).toBeGreaterThanOrEqual(5);
    expect(cat[0].theme).toBeTruthy();
    expect(cat[0].keywords && cat[0].keywords.length).toBeGreaterThan(0);
  });
});

describe('buildTierUnitPlan', () => {
  it('covers every tagged word and clusters by theme knowledge', () => {
    const list = [
      { id: 1, tags: ['N5'], en: 'rice', en_ex: 'I eat rice every day' },
      { id: 2, tags: ['N5'], en: 'train', en_ex: 'The train is late at the station' },
      { id: 3, tags: ['N5'], en: 'ticket', en_ex: 'Ticket at the station platform' },
      { id: 4, tags: ['N5'], en: 'hotel', en_ex: 'Travel hotel near airport' },
      { id: 5, tags: ['N5'], en: 'airport', en_ex: 'Flight airport luggage passport' },
      { id: 6, tags: ['N5'], en: 'delicious', en_ex: 'This food is delicious' },
      { id: 7, tags: ['N5'], en: 'restaurant', en_ex: 'Dinner at a restaurant' },
      { id: 8, tags: ['N5'], en: 'meal', en_ex: 'Cook a meal in the kitchen' },
      { id: 9, tags: ['N5'], en: 'xyzzy', en_ex: 'qwerty nonce' },
      { id: 10, tags: ['N4'], en: 'office', en_ex: 'Work at the company office' }
    ];
    const plan = buildTierUnitPlan(list, 'N5', 30);
    const allIds = plan.flatMap((u) => u.wordIds).sort((a, b) => a - b);
    expect(allIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    const themes = plan.map((u) => u.theme);
    expect(themes).toContain('food');
    expect(themes).toContain('travel');
  });
});
