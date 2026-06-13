# VocabMaster Scripts

## pregenerate-grammar.js

Pre-generates Grammar Gym exercises for vocab words and saves them to Firebase RTDB at `grammar_exercises/{vocabId}/{langCode}/{token}`. The live Grammar Gym checks this cache first (via `loadCachedGrammarExercise`), so pre-generating avoids the ~100s wait on first visit.

### How it works

1. Reads all vocab from RTDB at `/vocab`
2. For each word+language combo:
   - Checks if RTDB already has cached exercises (skips if `--skip-existing`)
   - Builds the same prompt as the live app's `buildGrammarExercisePrompt`
   - Calls Ollama (`POST /api/generate`, `stream: false`, `temperature: 0`, `num_predict: 2048`)
   - Extracts JSON from the response
   - Validates: 12 exercises, all 12 type variants, answer balance 6A/6B
   - Saves to `grammar_exercises/{vocabId}/{langCode}/{token}` in RTDB

### Setup

```bash
cd scripts
npm install
```

### Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/) > Project Settings > Service Accounts
2. Click **Generate New Private Key**
3. Save as `scripts/serviceAccountKey.json` (never commit)

### Usage

```bash
# Dry run (preview without writing to RTDB)
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --dry-run

# Generate for first 5 words
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --limit 5

# Generate only for Japanese (all words)
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --lang ja

# Generate for a single vocab ID
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --vocab-id 1759

# Generate for all words, skipping ones that already have cache
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --skip-existing

# Use a different model
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --model gemma2:27b

# Use a remote Ollama endpoint
node pregenerate-grammar.js --service-account ../vocabmaster112225-1e8a10d5f0a9.json --ollama http://192.168.1.100:11434

# Set via env var instead of flag
export GOOGLE_APPLICATION_CREDENTIALS=../vocabmaster112225-1e8a10d5f0a9.json
node pregenerate-grammar.js --limit 10
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--dry-run` | off | Preview without writing to RTDB |
| `--limit N` | none | Process only first N vocab items |
| `--lang ja` | all | Only generate for one language |
| `--vocab-id 1759` | all | Only generate for one vocab ID |
| `--skip-existing` | off | Skip words that already have cached exercises |
| `--ollama URL` | `http://127.0.0.1:11434` | Ollama API endpoint |
| `--model NAME` | `gemma4:31b-cloud` | Model name to use |
| `--service-account PATH` | env var | Path to Firebase service account JSON |

### Notes

- Uses Firebase Admin SDK which bypasses security rules
- The RTDB rules at `grammar_exercises/{vocabId}/{langCode}/{token}` require `auth != null` for writes; the admin SDK satisfies this
- Generation takes ~5-15 seconds per word on a fast model, ~30-60s for larger models
- 500ms delay between calls to avoid overwhelming the LLM
- Failed generations are logged but don't stop the script; you can re-run with `--skip-existing` to retry only failed ones

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