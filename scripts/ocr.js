const https = require('https');
https.get('https://ibb.co/TBg0T54g', (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
        const match = data.match(/<meta property="og:image" content="([^"]+)"/);
        if(match) {
            const imgUrl = match[1];
            console.log('Image URL:', imgUrl);
            const { createWorker } = require('tesseract.js');
            (async () => {
                const worker = await createWorker('eng');
                const ret = await worker.recognize(imgUrl);
                console.log('OCR TEXT:\n', ret.data.text);
                await worker.terminate();
            })();
        } else {
            console.log('Image not found');
        }
    });
});
