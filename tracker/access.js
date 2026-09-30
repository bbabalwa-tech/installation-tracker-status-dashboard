/* Password protection for the dashboard.
   The link to the Google Sheet is never stored in readable form. It is locked
   (AES-GCM encrypted) with the dashboard password, and the locked "access code"
   is kept in a separate Google Sheet. Only someone who types the right password
   can unlock the Sheet link and load the data.
   Used by index.html (to unlock) and admin.html (to make a new access code). */
var Access = (function(){
  var ITERATIONS = 250000;

  function b64(bytes){
    var s=''; bytes=new Uint8Array(bytes);
    for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unb64(s){
    s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='=';
    var bin=atob(s), out=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
    return out;
  }
  function deriveKey(password, salt){
    var enc=new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function(base){
        return crypto.subtle.deriveKey(
          {name:'PBKDF2', salt:salt, iterations:ITERATIONS, hash:'SHA-256'},
          base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
      });
  }

  // Pulls the Sheet ID out of a full Google Sheets link (or accepts a bare ID).
  function sheetIdFrom(linkOrId){
    var s=String(linkOrId||'').trim();
    var m=s.match(/\/spreadsheets\/d\/([\w-]{20,})/);
    if(m) return m[1];
    return /^[\w-]{20,}$/.test(s) ? s : '';
  }

  function makeCode(sheetId, password){
    var salt=crypto.getRandomValues(new Uint8Array(16));
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var data=new TextEncoder().encode(JSON.stringify({s:sheetId}));
    return deriveKey(password, salt).then(function(key){
      return crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, key, data);
    }).then(function(ct){
      return ['wc1', b64(salt), b64(iv), b64(ct)].join('.');
    });
  }

  // Resolves with the Sheet ID, or rejects if the password is wrong.
  function openCode(code, password){
    var p=String(code||'').trim().split('.');
    if(p.length!==4||p[0]!=='wc1') return Promise.reject(new Error('bad code'));
    return deriveKey(password, unb64(p[1])).then(function(key){
      return crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(p[2])}, key, unb64(p[3]));
    }).then(function(plain){
      return JSON.parse(new TextDecoder().decode(plain)).s;
    });
  }

  return { makeCode:makeCode, openCode:openCode, sheetIdFrom:sheetIdFrom };
})();
if(typeof module!=='undefined') module.exports=Access;
