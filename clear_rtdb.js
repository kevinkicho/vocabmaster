const fs = require('fs');

async function clearRTDB() {
    console.log("We will just append a unique timestamp to force cache misses, or change the level.");
    // Actually, changing the vocab level in test_suite.js to 99 will bypass cache since no stories exist for level 99!
}
clearRTDB();
