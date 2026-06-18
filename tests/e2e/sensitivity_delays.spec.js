import { test, expect } from '@playwright/test';

const DELAYS_TO_TEST = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
const TOLERANCE = 300;

test.describe('Auto-advance delay sensitivity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#btn-init', { state: 'visible', timeout: 10000 });
  });

  test('waitAndNav delay accuracy via _debugDelayMs', async ({ page }) => {
    const results = [];

    for (const targetDelay of DELAYS_TO_TEST) {
      const measured = await page.evaluate(async (delay) => {
        try {
          window.app.store.prefs._debugDelayMs = delay;
          window.app.store.prefs.audioWait = false;

          let navCalled = false;
          const mockGame = {
            nav: (dir) => { navCalled = true; },
            busy: false,
          };

          const start = performance.now();
          await GameMode.prototype.waitAndNav.call(mockGame, null, 9999);
          const elapsed = performance.now() - start;

          return { elapsed: Math.round(elapsed), navCalled, delay };
        } catch (e) {
          return { error: e.message, delay };
        }
      }, targetDelay);

      if (measured.error) {
        console.log(`Error at delay=${targetDelay}: ${measured.error}`);
        continue;
      }

      results.push({
        delay: targetDelay,
        measured: measured.elapsed,
        navCalled: measured.navCalled,
      });
    }

    console.log('\nwaitAndNav delay accuracy:');
    console.log('Target(ms) | Measured(ms) | Error(ms) | NavCalled | Pass');
    console.log('----------|-------------|----------|-----------|-----');
    for (const r of results) {
      const err = r.measured - r.delay;
      const pass = Math.abs(err) <= TOLERANCE;
      console.log(
        `${String(r.delay).padStart(9)} | ${String(r.measured).padStart(11)} | ${String(err).padStart(8)} | ${String(r.navCalled).padStart(9)} | ${pass ? 'PASS' : 'FAIL'}`
      );
      expect(r.navCalled).toBe(true);
      expect(Math.abs(err)).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  test('waitAndNav delay accuracy via fallbackDelay (no _debugDelayMs)', async ({ page }) => {
    const results = [];
    const FALLBACKS = [500, 1000, 1500, 2000, 2500, 3000];

    for (const fallback of FALLBACKS) {
      const measured = await page.evaluate(async (fb) => {
        try {
          window.app.store.prefs._debugDelayMs = -1; // disable override
          window.app.store.prefs.audioWait = false;

          let navCalled = false;
          const mockGame = {
            nav: (dir) => { navCalled = true; },
            busy: false,
          };

          const start = performance.now();
          await GameMode.prototype.waitAndNav.call(mockGame, null, fb);
          const elapsed = performance.now() - start;

          return { elapsed: Math.round(elapsed), navCalled, fallback: fb };
        } catch (e) {
          return { error: e.message, fallback: fb };
        }
      }, fallback);

      if (measured.error) {
        console.log(`Error at fallback=${fallback}: ${measured.error}`);
        continue;
      }

      results.push({
        fallback,
        measured: measured.elapsed,
        navCalled: measured.navCalled,
      });
    }

    console.log('\nwaitAndNav fallback delay accuracy:');
    console.log('Fallback(ms) | Measured(ms) | Error(ms) | NavCalled | Pass');
    console.log('------------|-------------|----------|-----------|-----');
    for (const r of results) {
      const err = r.measured - r.fallback;
      const pass = Math.abs(err) <= TOLERANCE;
      console.log(
        `${String(r.fallback).padStart(11)} | ${String(r.measured).padStart(11)} | ${String(err).padStart(8)} | ${String(r.navCalled).padStart(9)} | ${pass ? 'PASS' : 'FAIL'}`
      );
      expect(r.navCalled).toBe(true);
      expect(Math.abs(err)).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
