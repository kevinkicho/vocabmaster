const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('vocabmaster112225-1e8a10d5f0a9.json', 'utf8'));
const admin = require('./functions/node_modules/firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://vocabmaster112225-default-rtdb.firebaseio.com'
});
const db = admin.database();

async function checkSpecificErrors() {
  const usersRef = db.ref('users');
  const snapshot = await usersRef.once('value');
  const users = snapshot.val();
  
  if (!users) {
    console.log('No users found.');
    process.exit(0);
  }

  let out = "";
  const recentThreshold = Date.now() - 2 * 60 * 60 * 1000; // last 2 hours

  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.debug_logs && !userData.errors) continue;
    
    // Check specific errors
    if (userData.errors) {
       for (const [eid, err] of Object.entries(userData.errors)) {
          if (err.timestamp && err.timestamp > recentThreshold) {
             out += `RECENT ERROR NODE UID: ${uid} | Time: ${new Date(err.timestamp).toISOString()}\n`;
             out += JSON.stringify(err, null, 2) + '\n\n';
          }
       }
    }

    if (userData.debug_logs && userData.debug_logs.sessions) {
       for (const [sid, session] of Object.entries(userData.debug_logs.sessions)) {
          if (session.batches) {
             for (const [bid, batch] of Object.entries(session.batches)) {
                if (batch.at && batch.at > recentThreshold) {
                   const batchStr = JSON.stringify(batch);
                   if (batchStr.includes('fail') || batchStr.includes('error')) {
                      const errLines = batch.lines.filter(l => l.toLowerCase().includes('fail') || l.toLowerCase().includes('error'));
                      if (errLines.length > 0) {
                         out += `RECENT UID: ${uid} | Session: ${sid} | Date: ${new Date(batch.at).toISOString()}\n`;
                         out += errLines.join('\n') + '\n\n';
                      }
                   }
                }
             }
          }
       }
    }
  }
  
  fs.writeFileSync('error_dump_recent.txt', out);
  console.log('Wrote error_dump_recent.txt');
  process.exit(0);
}

checkSpecificErrors();
