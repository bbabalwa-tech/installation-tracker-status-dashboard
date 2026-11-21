const E = require('../src/engine.js'); const fs = require('fs');
const S = E.shapes;
const design = { fabric: 'woven', hoop: '5x7', objects: [
  { kind: 'fill', color: '#f2c94c', rings: S.ellipse(65, 70, 35, 35).concat(S.ellipse(65,70,12,12)), angle: 30, name: 'ring' },
  { kind: 'fill', color: '#c0392b', rings: S.heart(65, 72, 10), angle: 135, name: 'heart' },
  { kind: 'satin', color: '#1d3557', paths: [Array.from({length:60},(_,i)=>[20+i*1.5, 130+8*Math.sin(i/6)])], width: 3, name: 'wave' },
  { kind: 'run', color: '#1d3557', paths: [[[20,150],[110,150]]], triple: true, name: 'line' },
  { kind: 'satin', color: '#2a9d8f', paths: [[[20,165],[110,165]]], width: 9, name: 'wide' },
  { kind: 'applique', color: '#2a9d8f', rings: S.star(65,20,14), width:3 , name:'star'},
]};
const r = E.buildStitches(design);
console.log(r.stats, r.colors.map(c=>c.color+' '+E.brotherFor(c.color).name));
console.log(E.qualityReport(design, r));
fs.writeFileSync(process.argv[2] || '/tmp/t.pes', Buffer.from(E.writePES(r, { name: 'Sample' })));
