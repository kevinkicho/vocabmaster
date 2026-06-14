/* scripts/sync-env.js — Generates ollama_config.js from .env
 * Run: node scripts/sync-env.js
 * This ensures API keys stay in .env (gitignored) and the
 * runtime config is generated from it.
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const configPath = path.join(__dirname, '..', 'public', 'js', 'ollama_config.js');

// Parse .env
const env = {};
if (!fs.existsSync(envPath)) {
  console.warn('⚠ .env not found at', envPath, '— using defaults only (no API keys)');
} else {
  const stat = fs.statSync(envPath);
  const mode = stat.mode & 0o777;
  if (mode & 0o004) {
    console.warn('⚠ .env is world-readable (mode', mode.toString(8), '). Run: chmod 600 .env');
  }
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
  ' */',
  'window.OLLAMA_ENDPOINT = "http://127.0.0.1:11434";',
  'window.OLLAMA_USE_CLOUD = false;',
];

if (env.OLLAMA_API_KEY) {
  lines.push('');
  lines.push('// Ollama Cloud API');
  lines.push(`window.OLLAMA_API_KEY = ${JSON.stringify(env.OLLAMA_API_KEY)};`);
  lines.push(`window.OLLAMA_CLOUD_ENDPOINT = ${JSON.stringify(env.OLLAMA_CLOUD_ENDPOINT || 'https://api.ollama.com')};`);
  lines.push('window.OLLAMA_USE_CLOUD = true;');
}

if (env.ZEN_API_KEY || env.ZEN_ENDPOINT) {
  lines.push('');
  lines.push('// OpenCode Zen backup provider');
  if (env.ZEN_API_KEY) lines.push(`window.ZEN_API_KEY = ${JSON.stringify(env.ZEN_API_KEY)};`);
  lines.push(`window.ZEN_ENDPOINT = ${JSON.stringify(env.ZEN_ENDPOINT || 'https://opencode.ai/zen/go/v1/chat/completions')};`);
  lines.push(`window.ZEN_MODEL = ${JSON.stringify(env.ZEN_MODEL || 'deepseek-v4-flash-free')};`);
}

lines.push('');
fs.writeFileSync(configPath, lines.join('\n'));
fs.chmodSync(configPath, 0o600);
console.log('Generated:', configPath);
