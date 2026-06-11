import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as https from "https";

admin.initializeApp();

// Ollama Cloud API proxy — bypasses CORS for web apps
export const ollamaProxy = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { path, method = "GET", headers = {}, body } = req.body;
  if (!path) {
    res.status(400).json({ error: "Missing path" });
    return;
  }

  const options: https.RequestOptions = {
    hostname: "api.ollama.com",
    path: path,
    method: method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Stream responses (critical for Story mode NDJSON streaming on web)
    res.status(proxyRes.statusCode || 200);

    // Forward key headers so client can treat it like a direct Ollama response
    const contentType = proxyRes.headers['content-type'] || proxyRes.headers['Content-Type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    // Enable chunked transfer for true streaming
    if (proxyRes.headers['transfer-encoding']) {
      res.setHeader('Transfer-Encoding', proxyRes.headers['transfer-encoding']);
    }

    proxyRes.on("data", (chunk) => {
      res.write(chunk);
    });
    proxyRes.on("end", () => {
      res.end();
    });
  });

  proxyReq.on("error", (e) => {
    res.status(502).json({ error: e.message });
  });

  if (body) proxyReq.write(JSON.stringify(body));
  proxyReq.end();
});

const db = admin.database();
const firestore = admin.firestore();

// Run every Sunday at 23:59 UTC
export const weeklyScoreMigration = functions.pubsub
  .schedule("59 23 * * 0")
  .timeZone("UTC")
  // FIX 2: Add type annotation ': functions.EventContext'
  .onRun(async (context: functions.EventContext) => {
    console.log("Starting Weekly Score Migration...");

    // 1. Get all users from Realtime Database
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) {
      console.log("No users found in RTDB.");
      return null;
    }

    const updates: Promise<any>[] = [];
    const batch = firestore.batch();
    let batchCount = 0;

    usersSnap.forEach((childSnap) => {
      const uid = childSnap.key;
      const val = childSnap.val();
      
      // Safety check: ensure 'weekly' exists
      if (!val || !val.weekly) return;

      const weeklyData = val.weekly;

      if (uid && weeklyData) {
        const totalToAdd = weeklyData.total || 0;
        const modes = weeklyData.modes || {};

        if (totalToAdd > 0) {
          const userRef = firestore.collection("users").doc(uid);

          // 2. Prepare Firestore Update (Atomic Increment)
          batch.set(
            userRef,
            {
              lifetime_total: admin.firestore.FieldValue.increment(totalToAdd),
              lifetime_quiz: admin.firestore.FieldValue.increment(modes.quiz || 0),
              lifetime_tf: admin.firestore.FieldValue.increment(modes.tf || 0),
              lifetime_voice: admin.firestore.FieldValue.increment(modes.voice || 0),
              lifetime_match: admin.firestore.FieldValue.increment(modes.match || 0),
              last_updated: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          
          batchCount++;
        }

        // 3. Clear RTDB Weekly Data for this user ("Start Anew")
        updates.push(db.ref(`users/${uid}/weekly`).remove());
      }
    });

    // Commit Firestore Writes
    if (batchCount > 0) {
      await batch.commit();
      console.log(`Migrated scores for ${batchCount} users.`);
    }

    // Commit RTDB Deletions
    await Promise.all(updates);
    console.log("RTDB weekly scores reset.");

    return null;
  });
