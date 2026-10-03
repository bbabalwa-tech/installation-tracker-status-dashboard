// Minimal in-memory fake of the Apps Script services Code.gs uses.
const fs = require('fs'), vm = require('vm');
function makeEnv(sheetName = 'Water Programme Dashboard (DEMO)') {
  const sheets = {}; const props = {}; const cache = {}; const files = []; let fid = 0;
  function sheetObj(name) {
    const rows = sheets[name];
    const width = () => Math.max(1, ...rows.map(r => r.length));
    const cell = (r, c) => ({
      setValue(v) { while (rows.length < r) rows.push([]); rows[r-1][c-1] = v; return this; },
      setNumberFormat() { return this; },
      getValue() { return (rows[r-1] || [])[c-1] ?? ''; },
    });
    return {
      getDataRange: () => ({ getValues: () => rows.map(r => Array.from({length: width()}, (_, i) => r[i] ?? '')) }),
      getRange(a, b, nr, nc) {
        if (typeof a === 'string') {
          return { setNumberFormat() { return this; }, createTextFinder: (t) => ({ matchEntireCell() { return this; },
            findNext: () => { const i = rows.findIndex(r => String(r[1]) === t); return i < 0 ? null : { getRow: () => i + 1 }; } }) };
        }
        if (nr === undefined) return cell(a, b);
        return { getValues: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => (rows[a-1+i] || [])[b-1+j] ?? '')) };
      },
      appendRow: (r) => rows.push(r.slice()),
      getLastRow: () => rows.length,
      setFrozenRows() {},
    };
  }
  const ss = { getName: () => sheetName, getSpreadsheetTimeZone: () => 'Africa/Johannesburg',
    getSheetByName: n => sheets[n] ? sheetObj(n) : null,
    insertSheet: n => { sheets[n] = []; return sheetObj(n); } };
  function folder(name, parent) {
    const f = { id: 'f' + (++fid), name, parent, children: [],
      getId() { return this.id; }, getUrl() { return 'https://drive/' + this.id; },
      getFoldersByName(n) { const m = this.children.filter(c => c.name === n); return { hasNext: () => m.length > 0, next: () => m.shift() }; },
      createFolder(n) { const c = folder(n, this); this.children.push(c); return c; },
      getFiles() { const m = files.filter(x => x.folder === this && !x.trashed); return { hasNext: () => m.length > 0, next: () => m.shift() }; },
      createFile(blob) { if (driveFailAfter.value-- <= 0) throw new Error('Drive is unavailable'); const x = { created: new Date(), folder: this, name: blob.name, bytes: blob.bytes, trashed: false, id: 'x' + (++fid),
        getDateCreated() { return this.created; }, getName() { return this.name; }, getId() { return this.id; }, setName(n) { this.name = n; }, getParents() { const f = this.folder; let done = false; return { hasNext: () => !done, next: () => { done = true; return f; } }; }, setTrashed(v) { this.trashed = v; }, getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; } };
        files.push(x); return x; } };
    allFolders[f.id] = f; return f;
  }
  const allFolders = {}; const uploads = []; const lockBusy = { value: false }; const driveFailAfter = { value: Infinity };
  const ctx = {
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !lockBusy.value, releaseLock() {} }) },
    DriveApp: { createFolder: n => folder(n, null), getFolderById: id => allFolders[id], getFileById: id => { const f = files.find(x => x.id === id); if (!f) throw new Error('No item with the given ID'); return f; } },
    ScriptApp: { getOAuthToken: () => 'TOKEN' },
    UrlFetchApp: { fetch: (url, opts) => { const meta = JSON.parse(opts.payload); uploads.push({ url, opts, meta }); return { getHeaders: () => ({ Location: 'https://upload.test/session/' + (uploads.length - 1) }) }; } },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10), base64Decode: s => Buffer.from(s, 'base64'), newBlob: (bytes, type, name) => ({ bytes, type, name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  // Simulates the phone PUTting bytes to a session URL.
  const finishUpload = (n, bytes) => { const u = uploads[n]; return allFolders[u.meta.parents[0]].createFile({ name: u.meta.name, bytes, type: u.opts.headers['X-Upload-Content-Type'] }).id; };
  return { ctx, sheets, props, files, post, cache, uploads, finishUpload, lockBusy, driveFailAfter };
}
module.exports = { makeEnv };
