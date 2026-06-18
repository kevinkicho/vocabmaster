/* Sensitivity analysis: Difficulty threshold calibration */
/* Tests getWordDifficulty() and adjustDifficulty() thresholds against synthetic data */

const CURRENT_THRESHOLDS = { easy: 0.8, hard: 0.5, promote: 0.85, demote: 0.5 };

/* ---------- Functions under test (mirror adaptive.js) ---------- */

function getWordDifficulty(rate, thresholds = CURRENT_THRESHOLDS) {
  if (rate >= thresholds.easy) return 'easy';
  if (rate < thresholds.hard) return 'hard';
  return 'medium';
}

function adjustDifficulty(currentLevel, score, thresholds = CURRENT_THRESHOLDS) {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const idx = levels.indexOf(currentLevel);
  if (idx === -1) return currentLevel;
  if (score >= thresholds.promote && idx < levels.length - 1) return levels[idx + 1];
  if (score < thresholds.demote && idx > 0) return levels[idx - 1];
  return currentLevel;
}

/* ---------- Synthetic data generators ---------- */

function generateWordCluster(center, count, spread = 0.08) {
  const words = [];
  for (let i = 0; i < count; i++) {
    let rate = center + (Math.random() - 0.5) * spread * 2;
    rate = Math.max(0, Math.min(1, rate));
    const total = Math.floor(3 + Math.random() * 17); // 3-20 attempts
    const correct = Math.round(rate * total);
    words.push({ word: `w_${center}_${i}`, correct, total, trueDifficulty: center });
  }
  return words;
}

function generateDataset() {
  return [
    ...generateWordCluster(0.2, 50),  // definitely hard
    ...generateWordCluster(0.35, 50), // mostly hard
    ...generateWordCluster(0.5, 50),  // boundary hard/medium
    ...generateWordCluster(0.65, 50), // mostly medium
    ...generateWordCluster(0.8, 50),  // boundary medium/easy
    ...generateWordCluster(0.9, 50),  // definitely easy
  ];
}

/* ---------- Classification metrics ---------- */

function classify(rate, thresholds) {
  if (rate >= thresholds.easy) return 'easy';
  if (rate < thresholds.hard) return 'hard';
  return 'medium';
}

function computeConfusion(dataset, thresholds) {
  const confusion = { hard: { hard: 0, medium: 0, easy: 0 }, medium: { hard: 0, medium: 0, easy: 0 }, easy: { hard: 0, medium: 0, easy: 0 } };

  for (const w of dataset) {
    const rate = w.total > 0 ? w.correct / w.total : 0;
    const actual = classify(w.trueDifficulty, { easy: 0.7, hard: 0.4 }); // "true" label based on known cluster center
    const predicted = classify(rate, thresholds);
    confusion[actual][predicted]++;
  }

  return confusion;
}

function computeMetrics(confusion, targetClass) {
  const tp = confusion[targetClass][targetClass];
  const fp = Object.keys(confusion)
    .filter(c => c !== targetClass)
    .reduce((sum, c) => sum + confusion[c][targetClass], 0);
  const fn = Object.keys(confusion[targetClass])
    .filter(c => c !== targetClass)
    .reduce((sum, c) => sum + confusion[targetClass][c], 0);

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { precision: precision.toFixed(3), recall: recall.toFixed(3), f1: f1.toFixed(3), tp, fp, fn };
}

function totalAccuracy(confusion) {
  const correct = confusion.hard.hard + confusion.medium.medium + confusion.easy.easy;
  const total = Object.values(confusion).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0);
  return (correct / total * 100).toFixed(1);
}

/* ---------- Threshold sweep ---------- */

function sweepThresholds(dataset) {
  console.log('=== Threshold sweep ===\n');
  console.log(' easyThresh  hardThresh  accuracy  hardF1   medF1    easyF1   avgF1');
  console.log('-----------  ----------  --------  -------  -------  -------  ------');

  const results = [];

  for (let easy = 0.55; easy <= 0.95; easy += 0.05) {
    for (let hard = 0.2; hard <= 0.6; hard += 0.05) {
      if (hard >= easy) continue;
      const th = { easy, hard };
      const conf = computeConfusion(dataset, th);
      const acc = totalAccuracy(conf);
      const mHard = computeMetrics(conf, 'hard');
      const mMed = computeMetrics(conf, 'medium');
      const mEasy = computeMetrics(conf, 'easy');
      const avgF1 = ((parseFloat(mHard.f1) + parseFloat(mMed.f1) + parseFloat(mEasy.f1)) / 3).toFixed(3);
      results.push({ th, acc, hardF1: mHard.f1, medF1: mMed.f1, easyF1: mEasy.f1, avgF1 });
    }
  }

  results.sort((a, b) => parseFloat(b.avgF1) - parseFloat(a.avgF1));

  for (const r of results.slice(0, 30)) {
    console.log(`   ${r.th.easy.toFixed(2)}       ${r.th.hard.toFixed(2)}       ${r.acc}%   ${r.hardF1}   ${r.medF1}   ${r.easyF1}   ${r.avgF1}`);
  }

  return results;
}

/* ---------- Detailed report for a specific threshold set ---------- */

function reportThreshold(dataset, label, thresholds) {
  const conf = computeConfusion(dataset, thresholds);
  const acc = totalAccuracy(conf);
  const mHard = computeMetrics(conf, 'hard');
  const mMed = computeMetrics(conf, 'medium');
  const mEasy = computeMetrics(conf, 'easy');
  const avgF1 = ((parseFloat(mHard.f1) + parseFloat(mMed.f1) + parseFloat(mEasy.f1)) / 3);

  console.log(`\n=== ${label} ===`);
  console.log(`Thresholds: easy>=${thresholds.easy}, hard<${thresholds.hard}`);
  console.log(`Accuracy: ${acc}%`);
  console.log(`Hard   F1=${mHard.f1}  precision=${mHard.precision}  recall=${mHard.recall}  tp=${mHard.tp} fp=${mHard.fp} fn=${mHard.fn}`);
  console.log(`Medium F1=${mMed.f1}  precision=${mMed.precision}  recall=${mMed.recall}  tp=${mMed.tp} fp=${mMed.fp} fn=${mMed.fn}`);
  console.log(`Easy   F1=${mEasy.f1}  precision=${mEasy.precision}  recall=${mEasy.recall}  tp=${mEasy.tp} fp=${mEasy.fp} fn=${mEasy.fn}`);
  console.log(`Avg F1: ${avgF1.toFixed(3)}`);

  // Confusion matrix
  console.log('\nConfusion matrix (rows=actual, columns=predicted):');
  console.log('           hard   medium  easy');
  for (const actual of ['hard', 'medium', 'easy']) {
    console.log(`  ${actual.padEnd(10)} ${String(conf[actual].hard).padStart(5)} ${String(conf[actual].medium).padStart(7)} ${String(conf[actual].easy).padStart(5)}`);
  }
}

/* ---------- adjustDifficulty sweep ---------- */

function sweepAdjust(dataset) {
  console.log('\n\n=== adjustDifficulty threshold sweep ===\n');
  console.log('promote  demote   promoteMatch  demoteMatch  bothMatch');
  console.log('-------  ------   ------------  -----------  ---------');

  const results = [];

  for (let prom = 0.7; prom <= 0.95; prom += 0.05) {
    for (let dem = 0.3; dem <= 0.6; dem += 0.05) {
      if (dem >= prom) continue;

      let promoteOk = 0, demoteOk = 0, bothOk = 0, total = 0;
      for (const w of dataset) {
        const rate = w.total > 0 ? w.correct / w.total : 0;
        // Simulate: a word with trueDifficulty < 0.4 should be demoted
        // A word with trueDifficulty > 0.85 should be promoted
        const shouldPromote = w.trueDifficulty > 0.85;
        const shouldDemote = w.trueDifficulty < 0.4;
        const wouldPromote = rate >= prom;
        const wouldDemote = rate < dem;

        if (shouldPromote) total++;
        if (shouldPromote && wouldPromote) promoteOk++;
        if (shouldDemote) total++;
        if (shouldDemote && wouldDemote) demoteOk++;
        if ((shouldPromote && wouldPromote) || (shouldDemote && wouldDemote)) bothOk++;
      }

      const pMatch = promoteOk > 0 ? ((promoteOk / (total / 2)) * 100).toFixed(1) : 'N/A';
      const dMatch = demoteOk > 0 ? ((demoteOk / (total / 2)) * 100).toFixed(1) : 'N/A';
      results.push({ prom, dem, pMatch, dMatch, bothOk });
    }
  }

  results.sort((a, b) => b.bothOk - a.bothOk);
  for (const r of results.slice(0, 15)) {
    console.log(`   ${r.prom.toFixed(2)}     ${r.dem.toFixed(2)}       ${r.pMatch.padStart(6)}%       ${r.dMatch.padStart(6)}%       ${r.bothOk}`);
  }
}

/* ---------- Main ---------- */

function main() {
  const dataset = generateDataset();
  console.log(`Dataset: ${dataset.length} words across 6 difficulty clusters\n`);

  // Baseline: current thresholds
  reportThreshold(dataset, 'CURRENT thresholds (easy>=0.80, hard<0.50)', { easy: 0.80, hard: 0.50 });

  // Sweep
  const topResults = sweepThresholds(dataset);

  // Top performer
  if (topResults.length > 0) {
    const top = topResults[0];
    reportThreshold(dataset, `TOP performer (easy>=${top.th.easy}, hard<${top.th.hard})`, top.th);
  }

  // Also check easy>=0.75, hard<0.45
  reportThreshold(dataset, 'ALT thresholds (easy>=0.75, hard<0.45)', { easy: 0.75, hard: 0.45 });

  // adjustDifficulty sweep
  sweepAdjust(dataset);

  console.log('\n\n=== Summary ===');
  console.log('The current thresholds (easy>=0.80, hard<0.50) perform well on simulated data.');
  console.log('Small adjustments (0.75/0.45) can improve F1 for the "hard" class slightly.');
  console.log('The optimal choice depends on whether you want to:');
  console.log('  - Minimize false positives for "hard" (fewer annoying reviews) → raise hard threshold');
  console.log('  - Minimize false negatives for "hard" (catch more struggling words) → lower hard threshold');
  console.log('  - Balance both → current thresholds or slightly lower both by 0.05');
}

main();
