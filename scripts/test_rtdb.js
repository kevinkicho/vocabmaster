const https = require('https');

https.get('https://vocabmaster112225-default-rtdb.firebaseio.com/stories.json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("RTDB DATA:", data);
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
