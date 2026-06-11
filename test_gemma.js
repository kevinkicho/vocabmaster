const http = require('http');

const data = JSON.stringify({
  model: 'gemma2:27b',
  prompt: `Write a very short story (3-5 sentences) in Portuguese using these words: triste, certificado de ensino, recentemente, acostumar

After the story, write 2 comprehension questions, each with 4 answer choices (A, B, C, D) and mark the correct answer.

CRITICAL: Do NOT translate the labels STORY, Q1, Q2, and ANSWER. They MUST remain in English exactly as shown below.

Format exactly like this:
STORY:
(story text here)

Q1:
(question text in Portuguese)
A) ...
B) ...
C) ...
D) ...
ANSWER: (letter)

Q2:
(question text in Portuguese)
A) ...
B) ...
C) ...
D) ...
ANSWER: (letter)`,
  stream: false
});

const options = {
  hostname: '127.0.0.1',
  port: 11434,
  path: '/api/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
     console.log(body);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
