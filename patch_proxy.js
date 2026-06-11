const fs = require('fs');
let code = fs.readFileSync('test_suite.js', 'utf8');

const originalProxy = `  const proxy = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      res.end();
      return;
    }

    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
      let body = Buffer.concat(bodyChunks).toString();
      try {
        let json = JSON.parse(body);
        if (!json.model || json.model === 'gemma') json.model = 'gemma3:1b';
        body = JSON.stringify(json);
      } catch(e) {}
      
      const newHeaders = { ...req.headers };
      if (req.method === 'POST') {
          newHeaders['content-length'] = Buffer.byteLength(body);
      }

      const options = {
        hostname: '127.0.0.1',
        port: 11434,
        path: req.url,
        method: req.method,
        headers: newHeaders
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        proxyRes.pipe(res, { end: true });
      });

      if (req.method === 'POST') {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  });`;

const newProxy = `  const proxy = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      res.end();
      return;
    }

    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
      let body = Buffer.concat(bodyChunks).toString();
      if (req.method === 'POST') {
          try {
            let json = JSON.parse(body);
            // Replace any unknown local model with gemma4:31b-cloud so the mock works
            json.model = 'gemma4:31b-cloud';
            body = JSON.stringify(json);
          } catch(e) {}
      }
      
      const newHeaders = { ...req.headers };
      if (req.method === 'POST') {
          newHeaders['content-length'] = Buffer.byteLength(body);
      }

      const options = {
        hostname: '127.0.0.1',
        port: 11434,
        path: req.url,
        method: req.method,
        headers: newHeaders
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        proxyRes.pipe(res, { end: true });
      });

      if (req.method === 'POST' || req.method === 'PUT') {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  });`;

code = code.replace(originalProxy, newProxy);
fs.writeFileSync('test_suite.js', code);
console.log('patched test_suite.js with gemma4:31b-cloud');
