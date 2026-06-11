const fs = require('fs');
const html = fs.readFileSync('screenshots/suite_ja_error.html', 'utf8');

function extractText(id) {
    const regex = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)<\\/`);
    const match = html.match(regex);
    if (match) {
        // Strip out HTML tags to get raw text
        return match[1].replace(/<[^>]*>?/gm, '').trim();
    }
    return `[${id} not found]`;
}

console.log('Front text:', extractText('qz-front'));
console.log('Q text:', extractText('qz-q-text'));
console.log('Btn 0:', extractText('qz-btn-0'));
console.log('Btn 1:', extractText('qz-btn-1'));
console.log('Btn 2:', extractText('qz-btn-2'));
console.log('Btn 3:', extractText('qz-btn-3'));
