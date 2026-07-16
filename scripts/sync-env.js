/* scripts/sync-env.js — Generates ollama_config.js from .env
 * Run: node scripts/sync-env.js
 *
 * SECURITY: Never emit API keys or bearer secrets into public/ or APK assets.
 * Allowed: OLLAMA_ENDPOINT, OLLAMA_USE_CLOUD, OLLAMA_PROXY_URL, OLLAMA_MODEL
 * Forbidden: OLLAMA_API_KEY, ZEN_API_KEY, any secret token
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const configPath = path.join(__dirname, '..', 'public', 'js', 'ollama_config.js');
const DEFAULT_PROXY = 'https://ollama-proxy-1020976660084.us-central1.run.app';

const FORBIDDEN_KEYS = [
  'OLLAMA_API_KEY',
  'ZEN_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
];

const env = {};
if (!fs.existsSync(envPath)) {
  console.warn('⚠ .env not found at', envPath, '— using defaults only (no secrets)');
} else {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

const lines = [
  '/* js/ollama_config.js — Auto-generated from .env. Do not edit by hand.',
  ' * Edit .env at project root instead (gitignored).',
  ' * SECRETS ARE NEVER WRITTEN HERE — OLLAMA_API_KEY stays server/CI only.',
  ' */',
  'window.OLLAMA_ENDPOINT = ' + JSON.stringify(env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434') + ';',
];

const useCloud =
  env.OLLAMA_USE_CLOUD === 'true' ||
  env.OLLAMA_USE_CLOUD === '1' ||
  (!env.OLLAMA_USE_CLOUD && !!env.OLLAMA_PROXY_URL);

lines.push('window.OLLAMA_USE_CLOUD = ' + (useCloud ? 'true' : 'false') + ';');
lines.push(
  'window.OLLAMA_PROXY_URL = ' +
    JSON.stringify(env.OLLAMA_PROXY_URL || DEFAULT_PROXY) +
    ';'
);

if (env.OLLAMA_MODEL) {
  lines.push('window.OLLAMA_MODEL = ' + JSON.stringify(env.OLLAMA_MODEL) + ';');
}

// Explicitly do not emit forbidden keys (even if present in .env)
for (const k of FORBIDDEN_KEYS) {
  if (env[k]) {
    console.log('ℹ ' + k + ' present in .env — kept server-side only (not written to public/)');
  }
}

lines.push('');
const out = lines.join('\n');

// Safety scan
for (const k of FORBIDDEN_KEYS) {
  if (out.includes(k) && out.includes('window.' + k)) {
    console.error('✗ Refusing to write config: would emit', k);
    process.exit(1);
  }
}

fs.writeFileSync(configPath, out);
try {
  fs.chmodSync(configPath, 0o600);
} catch (_) { /* windows */ }

// Fail CI if secrets already leaked into public or android assets
const scanRoots = [
  path.join(__dirname, '..', 'public'),
  path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets'),
];
let leaked = false;
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch (_) {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      scanDir(p);
    } else if (/\.(js|html|json|txt)$/i.test(name)) {
      try {
        const t = fs.readFileSync(p, 'utf8');
        for (const k of FORBIDDEN_KEYS) {
          // Flag only actual assignments / window bindings of secrets
          if (new RegExp('window\\.' + k + '\\s*=').test(t)) {
            console.error('✗ Secret emission window.' + k, 'in', p);
            leaked = true;
          }
        }
      } catch (_) {}
    }
  }
}
scanDir(scanRoots[0]);
scanDir(scanRoots[1]);
if (leaked) {
  console.error('✗ Secret scan failed — remove keys from client bundles');
  process.exit(1);
}

console.log('Generated:', configPath);
console.log('  OLLAMA_USE_CLOUD=', useCloud);
console.log('  OLLAMA_PROXY_URL=', env.OLLAMA_PROXY_URL || DEFAULT_PROXY);
