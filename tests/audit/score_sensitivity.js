/* Sensitivity analysis: Scoring & reward distribution */

const MODES = [
  { key: 'flash',   pts: 10, label: 'Flashcards',  questionsPerSession: 20, isMatch: false },
  { key: 'quiz',    pts: 10, label: 'Quiz',         questionsPerSession: 20, isMatch: false },
  { key: 'tf',      pts: 10, label: 'True/False',   questionsPerSession: 20, isMatch: false },
  { key: 'match',   pts: 10, label: 'Match',        questionsPerSession: 12, isMatch: true },
  { key: 'voice',   pts: 10, label: 'Voice',        questionsPerSession: 20, isMatch: false },
  { key: 'sentences',pts: 10,label: 'Sentences',    questionsPerSession: 20, isMatch: false },
  { key: 'story',   pts: 15, label: 'Story',        questionsPerSession: 10, isMatch: false },
];

const TEST_POINT_VALUES = [5, 10, 15, 20, 25, 30];
const ACCURACY = 0.7; // 70% correct
const SESSIONS = 10000; // Monte Carlo iterations

function simulateSession(mode, pts, accuracy, questionCount) {
  let score = 0;
  let correct = 0;
  let total = questionCount;

  if (mode.isMatch) {
    // Match: each correct match = pts. With 6 pairs, you need 6 correct matches.
    // Each attempt is a pair tap; some will be wrong.
    // Simulate each pair attempt independently
    const pairs = mode.questionsPerSession / 2; // 6 pairs for 12 cards
    for (let p = 0; p < pairs; p++) {
      // For each pair, user may make multiple attempts
      let attempts = 0;
      let matched = false;
      while (!matched) {
        attempts++;
        if (Math.random() < accuracy) {
          score += pts;
          matched = true;
        }
        // else wrong attempt — no score, try again
      }
      correct += attempts; // count total taps for the pair
      total += attempts - 1; // extra attempts beyond the first
    }
  } else {
    for (let q = 0; q < questionCount; q++) {
      if (Math.random() < accuracy) {
        score += pts;
        correct++;
      }
    }
  }

  return { score, correct, total };
}

function simulateLeaderboardRankings(playerCount, avgScore, stddev) {
  // Generate random scores for N players around avgScore
  const scores = [];
  for (let i = 0; i < playerCount; i++) {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const s = Math.round(avgScore + z * stddev);
    scores.push(Math.max(0, s));
  }
  scores.sort((a, b) => b - a);
  return scores;
}

function main() {
  console.log('=== Scoring Sensitivity Analysis ===\n');
  console.log(`Simulation: ${SESSIONS} sessions per config, ${ACCURACY * 100}% accuracy\n`);

  // Test 1: Score distribution per mode (current point values)
  console.log('--- Test 1: Current point values per mode ---\n');
  console.log('Mode       | Pts | AvgScore  | StdDev    | Min  | Max  | Pts/Session | Pts/Question');
  console.log('-----------|-----|-----------|-----------|------|------|------------|-------------');

  for (const mode of MODES) {
    const scores = [];
    for (let s = 0; s < SESSIONS; s++) {
      const result = simulateSession(mode, mode.pts, ACCURACY, mode.questionsPerSession);
      scores.push(result.score);
    }
    scores.sort((a, b) => a - b);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length);
    const min = scores[0];
    const max = scores[scores.length - 1];
    const qScore = mode.isMatch ? avg / (scores.length > 0 ? 1 : 1) : avg / mode.questionsPerSession;
    console.log(
      `${mode.label.padEnd(10)} | ${String(mode.pts).padStart(3)} | ${String(Math.round(avg)).padStart(9)} | ${String(Math.round(std)).padStart(9)} | ${String(min).padStart(4)} | ${String(max).padStart(4)} | ${String(Math.round(avg)).padStart(9)} | ${(avg / mode.questionsPerSession).toFixed(1)}`
    );
  }

  // Test 2: Sweep point values for Quiz mode
  console.log('\n--- Test 2: Quiz mode — point value sweep ---\n');
  console.log('Pts | AvgScore  | StdDev    | Qs to 100 | Qs to 500 | Min  | Max');
  console.log('----|-----------|-----------|-----------|-----------|------|------');

  for (const pts of TEST_POINT_VALUES) {
    const scores = [];
    for (let s = 0; s < SESSIONS; s++) {
      const result = simulateSession({ isMatch: false }, pts, ACCURACY, 20);
      scores.push(result.score);
    }
    scores.sort((a, b) => a - b);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length);
    const ptsPerQ = pts * ACCURACY;
    const q100 = Math.ceil(100 / ptsPerQ);
    const q500 = Math.ceil(500 / ptsPerQ);
    console.log(
      `${String(pts).padStart(3)} | ${String(Math.round(avg)).padStart(9)} | ${String(Math.round(std)).padStart(9)} | ${String(q100).padStart(9)} | ${String(q500).padStart(9)} | ${String(scores[0]).padStart(4)} | ${String(scores[scores.length - 1]).padStart(4)}`
    );
  }

  // Test 3: Match mode specific — pair count effect
  console.log('\n--- Test 3: Match mode — pair count effect (10pts each) ---\n');
  console.log('Pairs | AvgScore  | StdDev    | AvgTaps   | Min  | Max');
  console.log('------|-----------|-----------|-----------|------|------');

  for (const pairs of [2, 4, 6, 8, 10]) {
    const qCount = pairs * 2;
    const scores = [];
    const taps = [];
    for (let s = 0; s < SESSIONS; s++) {
      // Match specific: each pair requires one-or-more attempts
      let score = 0;
      let totalTaps = 0;
      for (let p = 0; p < pairs; p++) {
        let matched = false;
        while (!matched) {
          totalTaps++;
          if (Math.random() < ACCURACY) {
            score += 10;
            matched = true;
          }
        }
      }
      scores.push(score);
      taps.push(totalTaps);
    }
    scores.sort((a, b) => a - b);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length);
    const avgTaps = taps.reduce((s, v) => s + v, 0) / taps.length;
    console.log(
      `${String(pairs).padStart(4)}  | ${String(Math.round(avg)).padStart(9)} | ${String(Math.round(std)).padStart(9)} | ${avgTaps.toFixed(1).padStart(9)} | ${String(scores[0]).padStart(4)} | ${String(scores[scores.length - 1]).padStart(4)}`
    );
  }

  // Test 4: Time to reach milestones (assuming 5s per question)
  console.log('\n--- Test 4: Time to milestones (5s per question) ---\n');
  console.log('Mode       | Pts | 100pts (min) | 500pts (min) | 1000pts (min)');
  console.log('-----------|-----|-------------|--------------|---------------');

  for (const mode of MODES) {
    for (const pts of [mode.pts, mode.pts * 2]) {
      const ptsPerQ = pts * ACCURACY;
      const q100 = Math.ceil(100 / ptsPerQ);
      const q500 = Math.ceil(500 / ptsPerQ);
      const q1000 = Math.ceil(1000 / ptsPerQ);
      const min100 = (q100 * 5 / 60).toFixed(1);
      const min500 = (q500 * 5 / 60).toFixed(1);
      const min1000 = (q1000 * 5 / 60).toFixed(1);
      console.log(
        `${mode.label.padEnd(10)} | ${String(pts).padStart(3)} | ${String(min100).padStart(10)}  | ${String(min500).padStart(12)} | ${String(min1000).padStart(13)}`
      );
    }
  }

  // Test 5: Leaderboard simulation
  console.log('\n--- Test 5: Leaderboard rank sensitivity (100 players) ---\n');
  console.log('AvgScore | StdDev   | Rank 1 | Rank 10 | Rank 25 | Rank 50 | Rank 100');
  console.log('---------|----------|--------|---------|---------|---------|---------');

  for (const avgScore of [500, 1000, 2000, 5000, 10000]) {
    const stddev = avgScore * 0.3; // 30% CV
    const rankings = simulateLeaderboardRankings(100, avgScore, stddev);
    console.log(
      `${String(avgScore).padStart(7)}  | ${String(Math.round(stddev)).padStart(8)} | ${String(rankings[0]).padStart(6)} | ${String(rankings[9]).padStart(7)} | ${String(rankings[24]).padStart(7)} | ${String(rankings[49]).padStart(7)} | ${String(rankings[99]).padStart(7)}`
    );
  }

  // Test 6: What if scoring was differentiated (Story already is at 15)?
  console.log('\n--- Test 6: Alternative scoring schemes ---\n');
  const schemes = [
    { label: 'Uniform 10', flash: 10, quiz: 10, tf: 10, match: 10, voice: 10, sentences: 10, story: 15 },
    { label: 'Mode-specific', flash: 5, quiz: 10, tf: 8, match: 15, voice: 12, sentences: 10, story: 20 },
    { label: 'Doubled', flash: 10, quiz: 20, tf: 20, match: 20, voice: 20, sentences: 20, story: 30 },
    { label: 'Flat 15', flash: 15, quiz: 15, tf: 15, match: 15, voice: 15, sentences: 15, story: 20 },
  ];

  console.log('Scheme        | Flash  | Quiz   | TF     | Match  | Voice  | Sents  | Story  | Session Total');
  console.log('--------------|--------|--------|--------|--------|--------|--------|--------|--------------');

  for (const scheme of schemes) {
    const totals = [];
    for (const mode of MODES) {
      const pts = scheme[mode.key];
      let sum = 0;
      for (let s = 0; s < 1000; s++) {
        const result = simulateSession(mode, pts, ACCURACY, mode.questionsPerSession);
        sum += result.score;
      }
      totals.push(Math.round(sum / 1000));
    }
    const sessionTotal = totals.reduce((s, v) => s + v, 0);
    console.log(
      `${scheme.label.padEnd(14)} | ${String(totals[0]).padStart(5)}  | ${String(totals[1]).padStart(5)}  | ${String(totals[2]).padStart(5)}  | ${String(totals[3]).padStart(5)}  | ${String(totals[4]).padStart(5)}  | ${String(totals[5]).padStart(5)}  | ${String(totals[6]).padStart(5)}  | ${String(sessionTotal).padStart(12)}`
    );
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log('1. All modes currently award 10pts except Story (15pts).');
  console.log('2. At 70% accuracy, a 20-question session yields ~140pts for 10pt modes.');
  console.log('3. Doubling to 20pts doubles the score proportionally — no non-linear effects.');
  console.log('4. Match mode inherently scores differently due to multi-tap-per-pair mechanic.');
  console.log('5. Leaderboard is highly sensitive to total score inflation if points are increased.');
  console.log('6. If score differentiation is desired, Match (more difficult) and Story (comprehension)');
  console.log('   are natural candidates for higher point values. Flash (recognition) could be lower.');
}

main();
