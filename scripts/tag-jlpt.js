// scripts/tag-jlpt.js
// Adds JLPT level tags to Japanese vocab items in Firebase RTDB.
//
// Usage:
//   cd scripts && npm install   (first time)
//   node tag-jlpt.js [--dry-run] [--level N5|N4|N3|N2|N1] [--force] [--service-account path/to/key.json]
//
// Uses Firebase Admin SDK which bypasses security rules.
// Set GOOGLE_APPLICATION_CREDENTIALS env var or pass --service-account flag.
//
// Matching strategy (in priority order):
//   1. Exact kanji match (item.ja === word)
//   2. Kana reading match (item.ja_furi === word)
//   3. Variant match (split on ・、,;/|, match any part)
//
// For kanji matches, we prefer the lowest JLPT level (easiest).

const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const fs = require("fs");
const path = require("path");

// ── Parse args ──

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const forceLevel = args.find((a, i) => args[i - 1] === "--level") || null;
const force = args.includes("--force");
const saFlagIdx = args.indexOf("--service-account");
const serviceAccountPath = saFlagIdx !== -1 ? args[saFlagIdx + 1] : null;

const onlyLevel = forceLevel;
const levelsToProcess = onlyLevel ? [onlyLevel] : ["N5", "N4", "N3", "N2", "N1"];

// ── Initialize Firebase Admin ──

let adminApp;
try {
    if (serviceAccountPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
        adminApp = initializeApp({ credential: cert(serviceAccount), databaseURL: "https://vocabmaster112225-default-rtdb.firebaseio.com" });
    } else {
        adminApp = initializeApp({ credential: applicationDefault(), databaseURL: "https://vocabmaster112225-default-rtdb.firebaseio.com" });
    }
} catch (e) {
    console.error("ERROR: Firebase Admin SDK requires credentials.");
    console.error("Usage: node tag-jlpt.js --service-account path/to/serviceAccountKey.json");
    console.error("Alternatively, set GOOGLE_APPLICATION_CREDENTIALS env var.");
    console.error("Download the key from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key");
    process.exit(1);
}
const db = getDatabase(adminApp);

// ── Comprehensive JLPT Word Map ──

function buildLevelMap() {
    const dataPath = path.join(__dirname, "jlpt-data.json");
    let wordToLevel = {};

    if (fs.existsSync(dataPath)) {
        const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
        wordToLevel = raw.wordToLevel || {};
        console.log(`Loaded ${Object.keys(wordToLevel).length} entries from jlpt-data.json`);
    }

    const extra = {
        "私":"N5","今":"N5","今日":"N5","明日":"N5","昨日":"N5","毎日":"N5","時間":"N5",
        "人":"N5","友達":"N5","先生":"N5","学生":"N5","学校":"N5","大学":"N5","電車":"N5",
        "駅":"N5","道":"N5","右":"N5","左":"N5","上":"N5","下":"N5","中":"N5","前":"N5",
        "後ろ":"N5","外":"N5","近く":"N5","東":"N5","西":"N5","南":"N5","北":"N5",
        "長い":"N5","短い":"N5","高い":"N5","安い":"N5","広い":"N5","狭い":"N5",
        "多い":"N5","少ない":"N5","新しい":"N5","古い":"N5","良い":"N5","悪い":"N5",
        "大きい":"N5","小さい":"N5","早い":"N5","遅い":"N5","暑い":"N5","寒い":"N5",
        "暖かい":"N5","涼しい":"N5","甘い":"N5","辛い":"N5","美味しい":"N5","楽しい":"N5",
        "元気":"N5","静か":"N5","にぎやか":"N5","大変":"N5","一番":"N5","一緒":"N5",
        "全部":"N5","半分":"N5","大体":"N5","色々":"N5",
        "食べる":"N5","飲む":"N5","行く":"N5","来る":"N5","帰る":"N5","見る":"N5",
        "聞く":"N5","読む":"N5","書く":"N5","話す":"N5","買う":"N5","作る":"N5",
        "使う":"N5","待つ":"N5","持つ":"N5","住む":"N5","働く":"N5","遊ぶ":"N5",
        "休む":"N5","寝る":"N5","起きる":"N5","入る":"N5","出る":"N5","開ける":"N5",
        "閉める":"N5","始まる":"N5","終わる":"N5","教える":"N5","習う":"N5","思う":"N5",
        "知る":"N5","分かる":"N5","出来る":"N5","あげる":"N5","もらう":"N5",
        "する":"N5","ある":"N5","いる":"N5","歩く":"N5","走る":"N5","泳ぐ":"N5",
        "飛ぶ":"N5","降る":"N5","返る":"N5",
        "名前":"N5","電話":"N5","天気":"N5","雨":"N5","雪":"N5","風":"N5","山":"N5",
        "川":"N5","海":"N5","花":"N5","木":"N5","色":"N5","白":"N5","黒":"N5",
        "赤":"N5","青":"N5","週末":"N5","仕事":"N5","勉強":"N5","散歩":"N5",
        "料理":"N5","洗濯":"N5","掃除":"N5","旅行":"N5","運動":"N5","映画":"N5",
        "音楽":"N5","写真":"N5","新聞":"N5","銀行":"N5","病院":"N5","病気":"N5",
        "大丈夫":"N5","安心":"N5","心配":"N5","好き":"N5","嫌い":"N5","上手":"N5",
        "下手":"N5","丁寧":"N5","親切":"N5","自由":"N5","必要":"N5","大切":"N5",
        "家":"N5","部屋":"N5","車":"N5","机":"N5","椅子":"N5","窓":"N5","門":"N5",
        "何":"N5","だれ":"N5","どこ":"N5","いつ":"N5","どうして":"N5","いくつ":"N5",
        "いくら":"N5","どれ":"N5","こちら":"N5","あちら":"N5","ありがとう":"N5",
        "おはよう":"N5","こんにちは":"N5","こんばんは":"N5","さようなら":"N5",
        "一万":"N5","千":"N5","百":"N5","十":"N5","皆":"N5","世界":"N5","外国":"N5",
        "英語":"N5","日本語":"N5","朝":"N5","夜":"N5","昼":"N5","今年":"N5",
        "来年":"N5","去年":"N5","春":"N5","夏":"N5","秋":"N5","冬":"N5",
        "肉":"N5","魚":"N5","野菜":"N5","果物":"N5","水":"N5","お茶":"N5",
        "猫":"N5","犬":"N5","鳥":"N5","草":"N5","空":"N5",
        "角":"N5","橋":"N5","信号":"N5","空港":"N5","バス":"N5","タクシー":"N5","自転車":"N5",
        "手紙":"N5","荷物":"N5","切符":"N5","財布":"N5","鍵":"N5","傘":"N5",
        "鞄":"N5","時計":"N5","眼鏡":"N5","帽子":"N5","靴":"N5","服":"N5",
        "顔":"N5","頭":"N5","目":"N5","鼻":"N5","口":"N5","耳":"N5","手":"N5","足":"N5",
        "体":"N5","心":"N5","声":"N5","力":"N5",
    };

    for (const [word, level] of Object.entries(extra)) {
        const n = word.normalize("NFC");
        if (!wordToLevel[n]) wordToLevel[n] = level;
    }

    return wordToLevel;
}

function findLevel(item, wordToLevel) {
    const fields = [item.ja, item.ja_furi].filter(Boolean).map(s => s.normalize("NFC"));

    for (const form of fields) {
        const level = wordToLevel[form];
        if (level) return level;
    }

    const VARIANTS = /[・、,;\/|·]/;
    for (const form of fields) {
        for (const variant of form.split(VARIANTS)) {
            const trimmed = variant.trim();
            if (trimmed && wordToLevel[trimmed]) return wordToLevel[trimmed];
        }
    }

    return null;
}

async function main() {
    console.log("Building JLPT word map...");
    const wordToLevel = buildLevelMap();
    console.log(`  Total unique entries: ${Object.keys(wordToLevel).length}`);

    console.log("Connecting to Firebase RTDB (Admin SDK)...");
    console.log(`  dry-run: ${dryRun}`);
    console.log(`  force:   ${force}`);
    console.log(`  levels:  ${levelsToProcess.join(", ")}`);

    const snap = await db.ref("vocab").once("value");
    if (!snap.exists()) {
        console.error("No vocab data found at /vocab");
        process.exit(1);
    }

    const data = snap.val();
    const isArr = Array.isArray(data);
    const items = isArr ? data : Object.values(data);
    const updates = {};
    let matched = 0;
    let skippedExisting = 0;
    let skippedNoMatch = 0;
    let tagged = 0;

    for (const item of items) {
        if (!item) continue;

        const level = findLevel(item, wordToLevel);

        if (!level) { skippedNoMatch++; continue; }
        if (!levelsToProcess.includes(level)) { skippedNoMatch++; continue; }

        matched++;

        const existingLevel = item.level;
        const existingTags = item.tags || [];

        if (existingLevel && !force) {
            console.log(`  SKIP id=${item.id} "${item.ja}" — already tagged as "${existingLevel}"`);
            skippedExisting++;
            matched--;
            continue;
        }

        const newTags = [...new Set([...existingTags, level])];
        updates[`vocab/${item.id}/level`] = level;
        updates[`vocab/${item.id}/tags`] = newTags;
        tagged++;

        console.log(
            `  TAG id=${item.id} "${item.ja}" → ${level}` +
            (existingLevel ? ` (was: ${existingLevel})` : "")
        );
    }

    console.log(`\nResults:`);
    console.log(`  Total items:         ${items.filter(Boolean).length}`);
    console.log(`  JLPT matched:       ${matched}`);
    console.log(`  Tagged:             ${tagged}`);
    console.log(`  Skipped (no match): ${skippedNoMatch}`);
    console.log(`  Skipped (existing): ${skippedExisting}`);

    if (Object.keys(updates).length === 0) {
        console.log("\nNo updates to write.");
    } else if (dryRun) {
        console.log(`\n[DRY RUN] Would write ${tagged} item updates (${Object.keys(updates).length} paths).`);
    } else {
        console.log(`\nWriting ${tagged} updates to RTDB...`);
        await db.ref().update(updates);
        console.log("Done!");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});