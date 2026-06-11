/* js/vocabulary-collections.js
 * Collections system (Medium-term work).
 * Provides named scopes (language starters + JLPT/HSK tiers) for practice.
 * Used by data filtering and Story word selection.
 * Higher-tier enriched data is made visible via tag-based tier collections.
 */

const COLLECTIONS = {
  'all': { id: 'all', name: 'All Words', description: 'Your full library', lang: null, level: null, isBuiltIn: true },
  'es-a1': { id: 'es-a1', name: 'Spanish A1', description: 'Beginner Spanish', lang: 'es', level: 'A1', isBuiltIn: true, tags: ['A1'] },
  'jlpt-n5': { id: 'jlpt-n5', name: 'JLPT N5', description: 'Beginner Japanese', lang: 'ja', level: 'N5', isBuiltIn: true, tags: ['N5'] },
  'jlpt-n4': { id: 'jlpt-n4', name: 'JLPT N4', description: 'Elementary Japanese', lang: 'ja', level: 'N4', isBuiltIn: true, tags: ['N4'] },
  'jlpt-n3': { id: 'jlpt-n3', name: 'JLPT N3 (enriched)', description: 'Intermediate Japanese', lang: 'ja', level: 'N3', isBuiltIn: true, tags: ['N3'] },
  'jlpt-n2': { id: 'jlpt-n2', name: 'JLPT N2 (enriched)', description: 'Upper-intermediate', lang: 'ja', level: 'N2', isBuiltIn: true, tags: ['N2'] },
  'jlpt-n1': { id: 'jlpt-n1', name: 'JLPT N1 (enriched)', description: 'Advanced Japanese', lang: 'ja', level: 'N1', isBuiltIn: true, tags: ['N1'] },
  // Add HSK / TOPIK / CEFR collections similarly as needed
};





























const VOCAB_COLLECTIONS = {
    spanishA1: SPANISH_A1,
    spanishA2: SPANISH_A2,
    spanishB1: SPANISH_B1,
    spanishB2: SPANISH_B2,
    frenchA1: FRENCH_A1,
    frenchA2: FRENCH_A2,
    frenchB1: FRENCH_B1,
    frenchB2: FRENCH_B2,
    germanA1: GERMAN_A1,
    germanA2: GERMAN_A2,
    germanB1: GERMAN_B1,
    germanB2: GERMAN_B2,
    italianA1: ITALIAN_A1,
    italianA2: ITALIAN_A2,
    italianB1: ITALIAN_B1,
    italianB2: ITALIAN_B2,
    portugueseA1: PORTUGUESE_A1,
    portugueseA2: PORTUGUESE_A2,
    portugueseB1: PORTUGUESE_B1,
    portugueseB2: PORTUGUESE_B2,
    japaneseN5: JAPANESE_N5,
    japaneseN4: JAPANESE_N4,
    chineseHSK1: CHINESE_HSK1,
    chineseHSK2: CHINESE_HSK2,
    koreanTOPIK1: KOREAN_TOPIK1,
    koreanTOPIK2: KOREAN_TOPIK2,
    russianA1: RUSSIAN_A1,
    russianA2: RUSSIAN_A2
};

// === New Collections API (Medium-term Phase 1) ===

/**
 * Return collection metadata by id. Falls back to 'all'.
 */
function getCollection(id = 'all') {
  return COLLECTIONS[id] || COLLECTIONS['all'];
}

/**
 * Filter the full vocab list to items belonging to the given collection.
 * Uses tags (preferred for tiers like N3) or lang/level.
 */
function getWordsForCollection(fullList = [], collectionId = 'all') {
  if (!collectionId || collectionId === 'all') return fullList;
  const coll = getCollection(collectionId);
  if (!coll) return fullList;

  return fullList.filter(item => {
    if (coll.tags && item.tags && Array.isArray(item.tags)) {
      return coll.tags.some(tag => item.tags.includes(tag));
    }
    if (coll.lang && !item[coll.lang]) return false;
    if (coll.level && item.tags && !item.tags.includes(coll.level)) return false;
    return true;
  });
}

/**
 * List all collections for UI pickers.
 */
function listCollections() {
  return Object.keys(COLLECTIONS).map(id => ({ id, ...COLLECTIONS[id] }));
}

// Made available globally for classic script include (index.html order).
// Existing code using old VOCAB_COLLECTIONS / SPANISH_A1 still works.
window.VOCAB_COLLECTIONS = VOCAB_COLLECTIONS;
window.getCollection = getCollection;
window.getWordsForCollection = getWordsForCollection;
window.listCollections = listCollections;