# VocabMaster Scripts

## tag-jlpt.js

Adds JLPT level tags (`level` and `tags` fields) to Japanese vocab items in Firebase RTDB.

### Setup

```bash
cd scripts
npm install
```

### Download Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/) > Project Settings > Service Accounts
2. Click **Generate New Private Key**
3. Save as `scripts/serviceAccountKey.json` (never commit this file)

### Usage

```bash
# Dry run (preview changes without writing)
node tag-jlpt.js --service-account serviceAccountKey.json --dry-run

# Write to RTDB
node tag-jlpt.js --service-account serviceAccountKey.json

# Force overwrite existing level/tags
node tag-jlpt.js --service-account serviceAccountKey.json --force

# Tag only N5 words
node tag-jlpt.js --service-account serviceAccountKey.json --level N5

# Alternative: use env var instead of flag
export GOOGLE_APPLICATION_CREDENTIALS=serviceAccountKey.json
node tag-jlpt.js --dry-run
```

### Matching Strategy

1. **Exact kanji match** — `item.ja` or `item.ja_furi` matches a JLPT word exactly
2. **Variant match** — splits on `・`、`,;/|·` and matches any part
3. When a word appears in multiple levels, the **lowest** (easiest) level is assigned