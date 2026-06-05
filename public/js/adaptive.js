/* js/adaptive.js */

function getWordDifficulty(word, userHistory) {
    if (!userHistory || !userHistory[word]) return 'medium';
    const h = userHistory[word];
    if (typeof h === 'object' && h.correct !== undefined && h.total !== undefined) {
        const rate = h.total > 0 ? h.correct / h.total : 0;
        if (rate >= 0.8) return 'easy';
        if (rate < 0.5) return 'hard';
        return 'medium';
    }
    if (typeof h === 'number') {
        if (h >= 0.8) return 'easy';
        if (h < 0.5) return 'hard';
        return 'medium';
    }
    return 'medium';
}

function selectWordsForReview(wordList, userHistory, count) {
    if (!Array.isArray(wordList) || wordList.length === 0) return [];
    const n = Math.min(count || 10, wordList.length);
    const scored = wordList.map(word => {
        const difficulty = getWordDifficulty(word, userHistory);
        const priority = difficulty === 'hard' ? 0 : difficulty === 'medium' ? 1 : 2;
        return { word, priority };
    });
    scored.sort((a, b) => a.priority - b.priority);
    return scored.slice(0, n).map(s => s.word);
}

function adjustDifficulty(currentLevel, score) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const idx = levels.indexOf(currentLevel);
    if (idx === -1) return currentLevel;
    if (score >= 0.85 && idx < levels.length - 1) return levels[idx + 1];
    if (score < 0.5 && idx > 0) return levels[idx - 1];
    return currentLevel;
}