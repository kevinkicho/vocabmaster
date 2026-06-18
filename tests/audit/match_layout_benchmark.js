/* Sensitivity analysis: Match grid layout — final findings */

function scoreLayout(cols, rows, cellW, cellH, w, h, isPortrait, params = {}) {
  const { ratioWeight = -80, areaCapW = 180, areaCapH = 120,
    orientPortrait2 = 60, orientPortrait3 = 30, orientPortrait5plus = -80,
    orientLandscape35 = 40, orientLandscape4 = 20, orientLandscapeRows3 = 15 } = params;
  const ratio = cellW / cellH;
  const ratioScore = -Math.abs(ratio - 1.4) * Math.abs(ratioWeight);
  const areaScore = Math.min(cellW, areaCapW) + Math.min(cellH, areaCapH);
  let orientScore = 0;
  if (isPortrait) {
    if (cols === 2) orientScore += orientPortrait2;
    else if (cols === 3) orientScore += orientPortrait3;
    if (cols >= 5) orientScore += orientPortrait5plus;
  } else {
    if (cols >= 3 && cols <= 5) orientScore += orientLandscape35;
    if (cols === 4) orientScore += orientLandscape4;
    if (rows <= 3) orientScore += orientLandscapeRows3;
  }
  return ratioScore + areaScore + orientScore;
}

function solveLayout(w, h, isPortrait, params = {}) {
  const { gap = 8, headerH = 58, padBottom = 8, minCellW = 56, minCellH = 40 } = params;
  const availH = h - headerH - padBottom;
  const availW = w - 8;
  if (availH <= 0 || availW <= 0) return { pairs: [], map: {}, best: null };
  const validPairs = new Set();
  const configMap = {};
  for (let cols = 2; cols <= 8; cols++) {
    for (let rows = 2; rows <= 12; rows++) {
      if (cols * minCellW + (cols - 1) * gap > availW) continue;
      if (rows * minCellH + (rows - 1) * gap > availH) continue;
      const total = cols * rows;
      if (total % 2 !== 0 || total < 4) continue;
      const pairs = total / 2;
      const cellW = (availW - (cols - 1) * gap) / cols;
      const cellH = (availH - (rows - 1) * gap) / rows;
      const score = scoreLayout(cols, rows, cellW, cellH, availW, availH, isPortrait, { ...params });
      if (!configMap[pairs] || score > configMap[pairs].score) {
        configMap[pairs] = { cols, rows, score, cellW, cellH, area: cellW * cellH };
      }
      validPairs.add(pairs);
    }
  }
  const sorted = Array.from(validPairs).sort((a, b) => a - b);
  const bestPair = sorted.reduce((best, p) => {
    const c = configMap[p];
    return (!best || c.score > configMap[best].score) ? p : best;
  }, null);
  return {
    pairs: sorted,
    map: configMap,
    best: bestPair ? { pairs: bestPair, ...configMap[bestPair] } : null,
  };
}

const VIEWPORTS = [
  { label: 'iPhone SE', w: 375, h: 667 },
  { label: 'iPhone 14', w: 390, h: 844 },
  { label: 'iPhone 15 PM', w: 430, h: 932 },
  { label: 'Galaxy S24', w: 412, h: 915 },
  { label: 'Tab S7 port', w: 800, h: 1280 },
  { label: 'Tab S7 land', w: 1280, h: 800 },
  { label: 'desk 1024', w: 1024, h: 768 },
  { label: 'desk 1440', w: 1440, h: 900 },
  { label: 'desk 1920', w: 1920, h: 1080 },
];

const DEFAULT_SCORE_PARAMS = { ratioWeight: -80, areaCapW: 180, areaCapH: 120,
  orientPortrait2: 60, orientPortrait3: 30, orientPortrait5plus: -80,
  orientLandscape35: 40, orientLandscape4: 20, orientLandscapeRows3: 15 };

console.log('=== Cap tradeoff: per-viewport breakdown ===\n');
const capsToTest = [
  { capW: 180, capH: 120, label: 'baseline (180/120)' },
  { capW: 180, capH: 180, label: 'capH=180' },
  { capW: 250, capH: 180, label: '250/180' },
  { capW: 9999, capH: 9999, label: 'uncapped' },
];

for (const c of capsToTest) {
  console.log(`--- ${c.label} ---`);
  for (const vp of VIEWPORTS) {
    const sol = solveLayout(vp.w, vp.h, vp.w < vp.h, { ...DEFAULT_SCORE_PARAMS, areaCapW: c.capW, areaCapH: c.capH });
    if (sol.best) {
      const coverage = ((sol.best.area * sol.best.pairs * 2) / ((vp.w - 8) * (vp.h - 58 - 8)) * 100).toFixed(1);
      console.log(`  ${vp.label.padEnd(14)} ${sol.best.pairs}p ${sol.best.cols}×${sol.best.rows}  ${sol.best.cellW.toFixed(0)}×${sol.best.cellH.toFixed(0)}  area=${sol.best.area.toFixed(0)}  coverage=${coverage}%`);
    }
  }
  console.log('');
}

console.log('=== What viewport height threshold makes sense for starting pair count? ===\n');
// The current code: window.innerHeight > 800 → 8 else 6
// This determines starting pairs. Let's find what height supports what max pairs.
for (const w of [375, 390, 412, 430, 800, 1280, 1920]) {
  console.log(`Width ${w}px:`);
  for (const h of [600, 700, 800, 900, 1000, 1100, 1200]) {
    const isPortrait = w < h;
    const sol = solveLayout(w, h, isPortrait, DEFAULT_SCORE_PARAMS);
    const maxPairs = sol.pairs.length > 0 ? Math.max(...sol.pairs) : 0;
    const minPairs = sol.pairs.length > 0 ? Math.min(...sol.pairs) : 0;
    console.log(`  h=${h}px → available pairs: ${sol.pairs.join(',')} ${'  '.repeat(Math.max(0, 5 - sol.pairs.length))} (max=${maxPairs})`);
  }
  console.log('');
}
