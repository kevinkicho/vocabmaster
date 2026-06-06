#!/usr/bin/env python3
"""Extract JMdict data for tier1 words."""
import json
import sys

# Load JMdict
with open('/mnt/c/Users/kevin/Desktop/vocabmaster-master/scripts/jmdict-eng-common-3.6.2.json') as f:
    jmdict = json.load(f)

# Load word list
with open('/mnt/c/Users/kevin/Desktop/vocabmaster-master/data/tier1_words.txt') as f:
    words = [line.strip() for line in f if line.strip()]

# Build lookup: kanji_text -> entry, kana_text -> entry
kanji_lookup = {}
kana_lookup = {}
for entry in jmdict['words']:
    for k in entry.get('kanji', []):
        t = k['text']
        if t not in kanji_lookup:
            kanji_lookup[t] = entry
            if k.get('common'):
                kanji_lookup[t] = entry  # prefer common
    for r in entry.get('kana', []):
        t = r['text']
        if t not in kana_lookup:
            kana_lookup[t] = entry
            if r.get('common'):
                kana_lookup[t] = entry

# Match words
results = {}
for word in words:
    entry = None
    match_type = None

    # Try exact kanji match
    if word in kanji_lookup:
        entry = kanji_lookup[word]
        match_type = 'kanji_exact'
    # Try exact kana match
    elif word in kana_lookup:
        entry = kana_lookup[word]
        match_type = 'kana_exact'

    if entry:
        # Get best kana reading
        kana_text = ''
        kana_common = False
        for r in entry.get('kana', []):
            if not kana_text or (r.get('common') and not kana_common):
                kana_text = r['text']
                kana_common = r.get('common', False)

        # Get kanji form
        kanji_text = ''
        for k in entry.get('kanji', []):
            if not kanji_text or (k.get('common') and len(kanji_text) == 0):
                kanji_text = k['text']

        # Get English glosses
        glosses = []
        for sense in entry.get('sense', []):
            for g in sense.get('gloss', []):
                if g.get('lang') == 'eng':
                    glosses.append(g['text'])

        results[word] = {
            'ja': kanji_text or word,
            'ja_furi': kana_text,
            'glosses': glosses[:5],
            'match': match_type
        }
    else:
        results[word] = {
            'ja': word,
            'ja_furi': '',
            'glosses': [],
            'match': 'not_found'
        }

# Output
print(f"Total words: {len(words)}")
print(f"Found in JMdict: {sum(1 for v in results.values() if v['match'] != 'not_found')}")
print(f"Not found: {sum(1 for v in results.values() if v['match'] == 'not_found')}")

not_found = [w for w, v in results.items() if v['match'] == 'not_found']
print("\nWords NOT found in JMdict:")
for w in not_found:
    print(f"  {w}")

with open('/tmp/jmdict_extracted.json', 'w') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("\nSaved to /tmp/jmdict_extracted.json")
