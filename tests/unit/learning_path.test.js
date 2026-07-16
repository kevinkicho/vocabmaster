/**
 * Learning path helpers — dual-universe filters & unit slicing
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(__dirname, '..', '..', 'public', 'js', 'learning_path.js'), 'utf8');

let filterListByTagsStrict, sliceUnitWordIds, defaultPathProfile;

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
  it('soft-migrates to free path', () => {
    const p = defaultPathProfile({ presetTarget: 'ja', presetSource: 'en' });
    expect(p.pathMode).toBe('free');
    expect(p.framework).toBe('jlpt');
    expect(p.placementStatus).toBe('skipped');
  });
});
