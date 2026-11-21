// Inlines the engine into the app page -> index.html (single file, works offline and as a Claude artifact)
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'src/app.html'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, 'src/engine.js'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), app.replace('/*ENGINE*/', () => engine));
console.log('built index.html', fs.statSync(path.join(__dirname, 'index.html')).size, 'bytes');
