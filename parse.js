const fs = require('fs');
const html = fs.readFileSync('screenshots/suite_ja_error.html', 'utf8');
console.log('--- ALL IDs ---');
const ids = html.match(/id="([^"]+)"/g);
if (ids) {
    const unique = [...new Set(ids.map(id => id.replace('id="', '').replace('"', '')))];
    console.log(unique.join('\n'));
} else {
    console.log('No IDs found');
}
console.log('--- GAME VIEW CONTENT ---');
const gameViewMatch = html.match(/id="game-view"[^>]*>([\s\S]*?)<\/div>\s*<!--/);
if (gameViewMatch) {
    console.log(gameViewMatch[1].trim());
} else {
    console.log('game-view not found');
}
