// scripts/migrate-stories-to-lang-prefix.js
// Migrates RTDB stories from stories/{pushId} to stories/{lang}/{pushId}
// Run: node scripts/migrate-stories-to-lang-prefix.js [--dry-run]
//
// Requires: firebase-admin service account JSON at $FIREBASE_SERVICE_ACCOUNT or ./google-services.json
// For RTDB migrations, use the RTDB REST API with a database secret (legacy auth)
// or deploy a one-shot Cloud Function. For local dev, this script reads via
// the public REST API using the project ID + database URL.

const fs = require('fs');
const path = require('path');
const https = require('https');

const DRY_RUN = process.argv.includes('--dry-run');

// Get Firebase config from google-services.json (project ID + database URL)
const gsPath = path.join(__dirname, '..', 'google-services.json');
if (!fs.existsSync(gsPath)) {
  console.error('google-services.json not found at', gsPath);
  process.exit(1);
}
const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
const projectId = gs.project_info.project_id;
const dbUrl = gs.project_info.firebase_url; // e.g. https://vocabmaster112225-default-rtdb.firebaseio.com

if (!projectId || !dbUrl) {
  console.error('Missing project_id or firebase_url in google-services.json');
  process.exit(1);
}

console.log(`Migrating stories for project: ${projectId}`);
console.log(`Database URL: ${dbUrl}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

function httpsReq(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try { resolve(body ? JSON.parse(body) : null); }
          catch (e) { resolve(body); }
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  // 1. Read all stories
  const allStories = await httpsReq(`${dbUrl}/stories.json`);
  if (!allStories) {
    console.log('No stories found.');
    return;
  }
  const entries = Object.entries(allStories);
  console.log(`Found ${entries.length} stories at stories/{pushId}`);

  // 2. Detect which need migration (have lang field, no nested under lang key)
  const toMigrate = [];
  for (const [key, value] of entries) {
    if (value && typeof value === 'object' && value.lang && value.storyText) {
      // Already migrated (nested under lang) — skip
      toMigrate.push({ key, value });
    }
  }
  console.log(`Stories to migrate: ${toMigrate.length}`);

  if (DRY_RUN) {
    console.log('DRY RUN — not writing. Sample:');
    toMigrate.slice(0, 3).forEach(({ key, value }) => {
      console.log(`  ${key} -> stories/${value.lang}/${key.slice(0,8)}... | ${value.storyText?.slice(0, 50)}...`);
    });
    return;
  }

  // 3. Migrate: PUT to new path, then DELETE from old path
  for (const { key, value } of toMigrate) {
    const newPath = `stories/${value.lang}/${key}`;
    try {
      await httpsReq(`${dbUrl}/${newPath}.json`, 'PUT', value);
      await httpsReq(`${dbUrl}/stories/${key}.json`, 'DELETE');
      console.log(`  Migrated ${key} -> ${newPath}`);
    } catch (e) {
      console.error(`  Failed to migrate ${key}:`, e.message);
    }
  }
  console.log('Migration complete.');
}

main().catch(e => { console.error('Migration error:', e); process.exit(1); });
