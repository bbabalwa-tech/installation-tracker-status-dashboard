/* Stitch Studio engine: geometry -> stitches -> Brother PES.
 * Units: millimetres, y grows downward, origin = top-left of the hoop's sewing field.
 * No DOM access in this file, so it runs in the browser and in Node tests. */
(function (root) {
  'use strict';
  const E = {};

  // ---------------------------------------------------------------- machine + materials
  E.HOOPS = {
    '5x7': { label: '5" × 7" (130 × 180 mm)', w: 130, h: 180 },
    '4x4': { label: '4" × 4" (100 × 100 mm)', w: 100, h: 100 },
    '2x6': { label: 'Small 2 × 6 cm', w: 20, h: 60 },
  };

  // Settings an experienced digitizer would pick per fabric.
  // spacing = row spacing (density) in mm, pull = pull compensation per side in mm.
  E.FABRICS = {
    woven:  { label: 'Woven cotton / tote', spacing: 0.42, pull: 0.25, underlay: 'normal', ulSpacing: 2.2, satinSpacing: 0.40,
              stabilizer: 'Medium tear-away. Use cut-away if the item will be washed often or worn.', topping: false },
    knit:   { label: 'T-shirt / stretch knit', spacing: 0.45, pull: 0.35, underlay: 'heavy', ulSpacing: 1.8, satinSpacing: 0.42,
              stabilizer: 'No-show mesh cut-away, fused to the back. Never tear-away on knits.', topping: false },
    fleece: { label: 'Sweatshirt / fleece / hoodie', spacing: 0.43, pull: 0.40, underlay: 'heavy', ulSpacing: 1.8, satinSpacing: 0.40,
              stabilizer: 'Medium cut-away on the back plus water-soluble topping on the front.', topping: true },
    towel:  { label: 'Towel / terry / minky', spacing: 0.40, pull: 0.40, underlay: 'heavy', ulSpacing: 1.6, satinSpacing: 0.38,
              stabilizer: 'Tear-away (or cut-away) on the back. Water-soluble topping on the front is essential.', topping: true },
    denim:  { label: 'Denim / canvas / twill', spacing: 0.42, pull: 0.20, underlay: 'normal', ulSpacing: 2.4, satinSpacing: 0.40,
              stabilizer: 'Medium tear-away.', topping: false },
    felt:   { label: 'Felt / patches', spacing: 0.45, pull: 0.20, underlay: 'light', ulSpacing: 2.6, satinSpacing: 0.42,
              stabilizer: 'Tear-away, or two layers of water-soluble for free-standing patches.', topping: false },
    vinyl:  { label: 'Vinyl / faux leather', spacing: 0.55, pull: 0.15, underlay: 'light', ulSpacing: 3.0, satinSpacing: 0.50,
              stabilizer: 'Tear-away. Never use a heavy fill: each needle hole is permanent.', topping: false },
  };

  E.SATIN_MAX = 7.0;      // longest single satin stitch before it is split
  E.STITCH_LEN = 3.5;     // tatami stitch length
  E.RUN_LEN = 2.5;        // running stitch length
  E.MIN_STITCH = 0.6;     // shorter stitches are merged (thread breaks / bird nests)
  E.JUMP_STITCH = 2.0;    // connect directly up to this distance, otherwise trim
  E.SPM = 650;            // realistic speed for the NV880E on dense designs

  // Brother's 64-colour PEC thread chart (what the machine screen shows).
  E.BROTHER = [[14,31,124,'Prussian Blue'],[10,85,163,'Blue'],[0,135,119,'Teal Green'],[75,107,175,'Cornflower Blue'],[237,23,31,'Red'],[209,92,0,'Reddish Brown'],[145,54,151,'Magenta'],[228,154,203,'Light Lilac'],[145,95,172,'Lilac'],[158,214,125,'Mint Green'],[232,169,0,'Deep Gold'],[254,186,53,'Orange'],[255,255,0,'Yellow'],[112,188,31,'Lime Green'],[186,152,0,'Brass'],[168,168,168,'Silver'],[125,111,0,'Russet Brown'],[255,255,179,'Cream Brown'],[79,85,86,'Pewter'],[0,0,0,'Black'],[11,61,145,'Ultramarine'],[119,1,118,'Royal Purple'],[41,49,51,'Dark Gray'],[42,19,1,'Dark Brown'],[246,74,138,'Deep Rose'],[178,118,36,'Light Brown'],[252,187,197,'Salmon Pink'],[254,55,15,'Vermilion'],[240,240,240,'White'],[106,28,138,'Violet'],[168,221,196,'Seacrest'],[37,132,187,'Sky Blue'],[254,179,67,'Pumpkin'],[255,243,107,'Cream Yellow'],[208,166,96,'Khaki'],[209,84,0,'Clay Brown'],[102,186,73,'Leaf Green'],[19,74,70,'Peacock Blue'],[135,135,135,'Gray'],[216,204,198,'Warm Gray'],[67,86,7,'Dark Olive'],[253,217,222,'Flesh Pink'],[249,147,188,'Pink'],[0,56,34,'Deep Green'],[178,175,212,'Lavender'],[104,106,176,'Wisteria Violet'],[239,227,185,'Beige'],[247,56,102,'Carmine'],[181,75,100,'Amber Red'],[19,43,26,'Olive Green'],[199,1,86,'Dark Fuchsia'],[254,158,50,'Tangerine'],[168,222,235,'Light Blue'],[0,103,62,'Emerald Green'],[78,41,144,'Purple'],[47,126,32,'Moss Green'],[255,204,204,'Flesh Pink'],[255,217,17,'Harvest Gold'],[9,91,166,'Electric Blue'],[240,249,112,'Lemon Yellow'],[227,243,91,'Fresh Green'],[255,153,0,'Orange'],[255,240,141,'Cream Yellow'],[255,200,200,'Applique']];

  function hexToRgb(h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(c) { return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function redMean(a, b) {
    const rm = Math.round((a[0] + b[0]) / 2), r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2];
    return (((512 + rm) * r * r) >> 8) + 4 * g * g + (((767 - rm) * bl * bl) >> 8);
  }
  // index into a 65-entry chart (0 = unknown); entries may be null
  function nearestIndex(rgb, chart) {
    let best = null, bd = Infinity;
    for (let i = 0; i < chart.length; i++) {
      const t = chart[i]; if (!t) continue;
      const d = redMean(rgb, t); if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }
  const PEC_CHART = [null].concat(E.BROTHER);
  E.brotherFor = function (hex) {
    const i = nearestIndex(hexToRgb(hex), PEC_CHART);
    const t = PEC_CHART[i];
    return { index: i, name: t[3], hex: rgbToHex(t.slice(0, 3)) };
  };
  E.hexToRgb = hexToRgb; E.rgbToHex = rgbToHex;

  // ---------------------------------------------------------------- geometry helpers
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  E.dist = dist;
  function ringArea(r) { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  E.ringArea = ringArea;
  function bbox(pointsList) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pts of pointsList) for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  E.bbox = bbox;
  function pointInRings(p, rings) { // even-odd
    let inside = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  E.pointInRings = pointInRings;

  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop(); let md = 0, mi = -1;
      const a = pts[s], b = pts[e], L = dist(a, b) || 1e-9;
      for (let i = s + 1; i < e; i++) {
        const p = pts[i];
        const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  E.simplifyRing = function (ring, eps) {
    if (ring.length < 8) return ring;
    // split the closed ring at its two farthest points so RDP keeps the shape
    let far = 0, fd = 0; for (let i = 1; i < ring.length; i++) { const d = dist(ring[0], ring[i]); if (d > fd) { fd = d; far = i; } }
    const a = rdp(ring.slice(0, far + 1), eps), b = rdp(ring.slice(far).concat([ring[0]]), eps);
    return a.slice(0, -1).concat(b.slice(0, -1));
  };
  E.smoothRing = function (ring, iters, cornerDeg) {
    // Chaikin smoothing that keeps sharp corners (logos, lettering) sharp
    const lim = Math.cos((cornerDeg || 50) * Math.PI / 180);
    let r = ring;
    for (let k = 0; k < iters; k++) {
      const out = [], n = r.length;
      for (let i = 0; i < n; i++) {
        const p0 = r[(i - 1 + n) % n], p = r[i], p1 = r[(i + 1) % n];
        const u = [p[0] - p0[0], p[1] - p0[1]], v = [p1[0] - p[0], p1[1] - p[1]];
        const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1);
        if (cos < lim) { out.push(p); } // sharp corner: keep
        else { out.push([0.75 * p[0] + 0.25 * p0[0], 0.75 * p[1] + 0.25 * p0[1]], [0.75 * p[0] + 0.25 * p1[0], 0.75 * p[1] + 0.25 * p1[1]]); }
      }
      r = out;
    }
    return r;
  };
  E.smoothPath = function (pts, iters) { // open polyline Chaikin, keeps endpoints
    let r = pts;
    for (let k = 0; k < iters; k++) {
      if (r.length < 3) return r;
      const out = [r[0]];
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1];
        out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
      }
      out.push(r[r.length - 1]); r = out;
    }
    return r;
  };

  function pathLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; }
  E.pathLength = pathLength;

  // Even sampling along an open polyline; returns points every `step` mm plus the end.
  function resample(pts, step, keepCorners) {
    if (pts.length < 2) return pts.slice();
    const out = [pts[0]]; let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = dist(a, b); if (L < 1e-9) continue;
      let t = step - carry;
      while (t < L) { out.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); t += step; }
      carry = L - (t - step);
      if (keepCorners && i < pts.length - 1) {
        const c = pts[i + 1];
        const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
        const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
        if (cos < 0.85 && carry > E.MIN_STITCH) { out.push(b); carry = 0; }
      }
    }
    const last = pts[pts.length - 1];
    if (dist(out[out.length - 1], last) > 0.25) out.push(last); else out[out.length - 1] = last;
    return out;
  }
  E.resample = resample;

  function transformPts(pts, t) {
    // t: {x,y,scale,rot(deg)} applied around (cx,cy)
    if (!t) return pts;
    const s = t.scale || 1, a = (t.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const cx = t.cx || 0, cy = t.cy || 0, dx = t.x || 0, dy = t.y || 0;
    return pts.map(p => { const x = (p[0] - cx) * s, y = (p[1] - cy) * s; return [cx + x * c - y * sn + dx, cy + x * sn + y * c + dy]; });
  }
  E.transformPts = transformPts;

  // ---------------------------------------------------------------- SVG path data -> polylines
  E.parsePath = function (d, tol) {
    tol = tol || 0.25;
    const toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const subs = []; let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
    const num = () => parseFloat(toks[i++]);
    const isNum = () => i < toks.length && !/[A-Za-z]/.test(toks[i]);
    const seg = (n) => Math.max(4, Math.min(64, Math.ceil(n / tol / 4)));
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { if (cur) { cur.closed = true; } x = sx; y = sy; cur = null; lq = null; continue; }
      if (!isNum()) { i++; continue; }
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; cur = { pts: [[x, y]], closed: false }; subs.push(cur); cmd = rel ? 'l' : 'L'; lq = null; lcx = x; lcy = y; continue; }
      if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); }
      if (C === 'L') { x = ox + num(); y = oy + num(); cur.pts.push([x, y]); lq = null; }
      else if (C === 'H') { x = ox + num(); cur.pts.push([x, y]); lq = null; }
      else if (C === 'V') { y = oy + num(); cur.pts.push([x, y]); lq = null; }
      else if (C === 'C' || C === 'S') {
        let x1, y1;
        if (C === 'C') { x1 = ox + num(); y1 = oy + num(); } else { x1 = lq === 'c' ? 2 * x - lcx : x; y1 = lq === 'c' ? 2 * y - lcy : y; }
        const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        const n = seg(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(ex - x2, ey - y2));
        for (let k = 1; k <= n; k++) { const t = k / n, m = 1 - t; cur.pts.push([m * m * m * x + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * ex, m * m * m * y + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * ey]); }
        lcx = x2; lcy = y2; x = ex; y = ey; lq = 'c';
      } else if (C === 'Q' || C === 'T') {
        let x1, y1;
        if (C === 'Q') { x1 = ox + num(); y1 = oy + num(); } else { x1 = lq === 'q' ? 2 * x - lcx : x; y1 = lq === 'q' ? 2 * y - lcy : y; }
        const ex = ox + num(), ey = oy + num();
        const n = seg(Math.hypot(x1 - x, y1 - y) + Math.hypot(ex - x1, ey - y1));
        for (let k = 1; k <= n; k++) { const t = k / n, m = 1 - t; cur.pts.push([m * m * x + 2 * m * t * x1 + t * t * ex, m * m * y + 2 * m * t * y1 + t * t * ey]); }
        lcx = x1; lcy = y1; x = ex; y = ey; lq = 'q';
      } else if (C === 'A') {
        const rx = Math.abs(num()), ry = Math.abs(num()), phi = num() * Math.PI / 180, fa = num(), fs = num();
        const ex = ox + num(), ey = oy + num();
        arcTo(cur.pts, x, y, rx, ry, phi, fa, fs, ex, ey, tol); x = ex; y = ey; lq = null;
      } else { i++; }
    }
    return subs.filter(s => s.pts.length > 1);
  };
  function arcTo(out, x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) { out.push([x2, y2]); return; }
    const c = Math.cos(phi), s = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
    let lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(6, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / 1.2));
    for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n; out.push([cx + c * rx * Math.cos(t) - s * ry * Math.sin(t), cy + s * rx * Math.cos(t) + c * ry * Math.sin(t)]); }
  }

  // ---------------------------------------------------------------- fills
  // Scanline fill (even-odd, holes supported). Short rows become satin-style stitches,
  // long rows become tatami with staggered penetrations. Returns array of needle runs.
  function scanRows(rings, angleDeg, spacing) {
    const a = -angleDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const R = rings.map(r => r.map(p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]));
    const bb = bbox(R);
    const rows = [];
    const edges = [];
    for (const r of R) for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; if (p[1] !== q[1]) edges.push(p[1] < q[1] ? [p, q] : [q, p]); }
    let gi = 0;
    for (let y = Math.floor(bb.y0 / spacing) * spacing + spacing / 2; y < bb.y1; y += spacing, gi++) {
      if (y <= bb.y0) continue;
      const xs = [];
      for (const [p, q] of edges) if (y >= p[1] && y < q[1]) xs.push(p[0] + (y - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      xs.sort((u, v) => u - v);
      const segs = []; for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > 0.05) segs.push([xs[k], xs[k + 1]]);
      rows.push({ y, gi: Math.round(y / spacing), segs });
    }
    return { rows, unrot: (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c] };
  }

  function buildBlocks(rows, spacing) {
    const blocks = []; let active = [];
    for (const row of rows) {
      const next = [];
      const segHits = row.segs.map(() => []), blkHits = active.map(() => []);
      row.segs.forEach((sg, si) => active.forEach((b, bi) => { const l = b.last; if (sg[0] < l[1] && sg[1] > l[0]) { segHits[si].push(bi); blkHits[bi].push(si); } }));
      row.segs.forEach((sg, si) => {
        const e = { y: row.y, gi: row.gi, x0: sg[0], x1: sg[1] };
        if (segHits[si].length === 1 && blkHits[segHits[si][0]].length === 1) { const b = active[segHits[si][0]]; b.rows.push(e); b.last = sg; next.push(b); }
        else { const b = { rows: [e], last: sg }; blocks.push(b); next.push(b); }
      });
      active = next;
    }
    return blocks;
  }

  function rowStitches(x0, x1, dir, gi, opt) {
    // returns x positions from start to end (dir: +1 left->right)
    const xs = [];
    const a = dir > 0 ? x0 : x1, b = dir > 0 ? x1 : x0, L = Math.abs(x1 - x0);
    xs.push(a);
    if (L > opt.satinMax) {
      const len = opt.stitchLen, phase = ((gi % 3) + 3) % 3 * len / 3;
      const pts = [];
      let k = Math.ceil((x0 - phase) / len);
      for (let x = phase + k * len; x < x1; x += len) if (x - x0 > opt.minLen && x1 - x > opt.minLen) pts.push(x);
      if (dir < 0) pts.reverse();
      xs.push(...pts);
    }
    xs.push(b);
    return xs;
  }

  E.fillRegion = function (rings, opt, startAt) {
    opt = Object.assign({ angle: 45, spacing: 0.42, stitchLen: E.STITCH_LEN, pull: 0.25, satinMax: E.SATIN_MAX, minLen: E.MIN_STITCH * 1.4, minRow: 0.3 }, opt);
    const { rows, unrot } = scanRows(rings, opt.angle, opt.spacing);
    const blocks = buildBlocks(rows, opt.spacing).filter(b => b.rows.length);
    const runs = []; let cur = null; let pos = startAt || null;
    const remaining = blocks.slice();
    while (remaining.length) {
      // choose the block + entry corner nearest the needle
      let best = null;
      remaining.forEach((b, bi) => {
        const f = b.rows[0], l = b.rows[b.rows.length - 1];
        const opts = [[f, 1, false], [f, -1, false], [l, 1, true], [l, -1, true]];
        for (const [r, dir, rev] of opts) {
          const p = unrot([dir > 0 ? r.x0 - opt.pull : r.x1 + opt.pull, r.y]);
          const d = pos ? dist(pos, p) : (r === f && dir > 0 ? 0 : 1);
          if (!best || d < best.d) best = { d, bi, dir, rev, p };
        }
      });
      const b = remaining.splice(best.bi, 1)[0];
      const rs = best.rev ? b.rows.slice().reverse() : b.rows;
      const pts = []; let dir = best.dir;
      for (const r of rs) {
        const x0 = r.x0 - opt.pull, x1 = r.x1 + opt.pull;
        if (x1 - x0 < opt.minRow) continue;
        for (const x of rowStitches(x0, x1, dir, r.gi, opt)) pts.push(unrot([x, r.y]));
        dir = -dir;
      }
      if (!pts.length) continue;
      // connect: short hop stitches straight, a hop inside the shape travels, otherwise trim
      if (cur && pos) {
        const d = dist(pos, pts[0]);
        const mid = [(pos[0] + pts[0][0]) / 2, (pos[1] + pts[0][1]) / 2];
        if (d <= E.JUMP_STITCH) { cur.push(...pts); }
        else if (d < 25 && insideLine(pos, pts[0], rings)) { cur.push(...resample([pos, pts[0]], E.RUN_LEN).slice(1, -1), ...pts); }
        else { cur = pts.slice(); runs.push(cur); }
      } else { cur = pts.slice(); runs.push(cur); }
      pos = pts[pts.length - 1];
    }
    return runs.map(r => dedupe(r));
  };
  function insideLine(a, b, rings) {
    const n = Math.max(3, Math.ceil(dist(a, b) / 0.8));
    for (let i = 1; i < n; i++) { const t = i / n; if (!pointInRings([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], rings)) return false; }
    return true;
  }
  function dedupe(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (dist(out[out.length - 1], pts[i]) >= 0.2) out.push(pts[i]);
    return out;
  }

  // ---------------------------------------------------------------- satin column along a path
  function tangentAt(path, i) {
    const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
    const L = dist(a, b) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  }
  function offsetPath(path, off) {
    return path.map((p, i) => { const t = tangentAt(path, i); return [p[0] - t[1] * off, p[1] + t[0] * off]; });
  }
  E.satinStroke = function (path, width, opt) {
    opt = Object.assign({ spacing: 0.40, pull: 0.2, satinMax: E.SATIN_MAX, underlay: 'normal' }, opt);
    const center = resample(path, 0.25);
    if (center.length < 2) return [];
    const w = width / 2 + opt.pull;
    const out = [];
    // underlay: centre walk (narrow) or edge walk (wide), finishing where satin starts
    let satinPath = center;
    if (opt.underlay !== 'none') {
      if (width >= 3.5) {
        const inset = Math.max(0.3, width / 2 - 0.5);
        const L = resample(offsetPath(center, inset), 2.0), R = resample(offsetPath(center, -inset), 2.0);
        out.push(...L, ...R.reverse());
        if (width >= 5 && opt.underlay === 'heavy') { // zigzag underlay on top of edge walk
          const zz = resample(center, 2.0).map((p, i, arr) => { const t = tangentAt(arr, i), o = (i % 2 ? 1 : -1) * inset; return [p[0] - t[1] * o, p[1] + t[0] * o]; });
          out.push(...zz);
          satinPath = center.slice().reverse();
        }
      } else if (width >= 1.6) {
        out.push(...resample(center, 2.0));
        satinPath = center.slice().reverse();
      }
    }
    // satin zigzag: `spacing` is peak-to-peak on the same edge (each stitch advances half of it)
    const steps = resample(satinPath, opt.spacing / 2);
    const sp = resample(satinPath, 0.25);
    let side = 1;
    for (let i = 0; i < steps.length; i++) {
      const p = steps[i];
      // tangent from nearest point on fine centre
      let ni = Math.min(sp.length - 1, Math.round(i * opt.spacing / 2 / 0.25));
      const t = tangentAt(sp, ni);
      const L = [p[0] - t[1] * w, p[1] + t[0] * w], R = [p[0] + t[1] * w, p[1] - t[0] * w];
      const from = side > 0 ? L : R, to = side > 0 ? R : L;
      if (i === 0) out.push(from);
      if (2 * w > opt.satinMax) { // split satin: staggered penetrations
        const parts = Math.ceil(2 * w / (opt.satinMax * 0.8));
        const stagger = (i % 2) * 0.5 / parts;
        for (let k = 1; k < parts; k++) { const f = (k + stagger - 0.25 / parts) / parts; out.push([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]); }
      }
      out.push(to);
      side = -side;
    }
    return [dedupe(out)];
  };

  // ---------------------------------------------------------------- running stitch
  E.runStitch = function (path, opt) {
    opt = Object.assign({ len: E.RUN_LEN, triple: false }, opt);
    const pts = resample(path, opt.len, true);
    if (!opt.triple) return [pts];
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) out.push(pts[i], pts[i - 1], pts[i]);
    return [out];
  };

  // ---------------------------------------------------------------- objects -> runs
  // object kinds:
  //  fill  {rings:[[[x,y]..]..], angle, color}
  //  satin {paths:[[[x,y]..]..], width, color}       (satin column along each path)
  //  run   {paths:[...], triple, color}
  //  applique {rings, color}  placement line, stop, tack-down, stop, satin cover
  E.objectGeometry = function (o) {
    const t = o.t;
    if (o.rings) return { rings: o.rings.map(r => transformPts(r, t)) };
    return { paths: (o.paths || []).map(p => transformPts(p, t)) };
  };
  E.objectRuns = function (o, fab, startAt) {
    const F = E.FABRICS[fab] || E.FABRICS.woven;
    const g = E.objectGeometry(o);
    const scale = (o.t && o.t.scale) || 1;
    const runs = [];
    if (o.kind === 'fill') {
      const spacing = o.spacing || F.spacing;
      const ang = o.angle == null ? 45 : o.angle;
      const ul = o.underlay || F.underlay;
      const bb = bbox(g.rings);
      if (ul !== 'none' && Math.min(bb.w, bb.h) > 2.5) {
        // perpendicular tatami underlay, inset so it never peeks out
        runs.push(...E.fillRegion(g.rings, { angle: ang + 90, spacing: ul === 'light' ? F.ulSpacing * 1.4 : F.ulSpacing, stitchLen: 3.0, pull: -0.45, satinMax: 0, minRow: 1.0 }, startAt));
        if (ul === 'heavy' && Math.min(bb.w, bb.h) > 8) runs.push(...E.fillRegion(g.rings, { angle: ang, spacing: F.ulSpacing * 1.6, stitchLen: 3.5, pull: -0.6, satinMax: 0, minRow: 1.5 }, last(runs)));
      }
      runs.push(...E.fillRegion(g.rings, { angle: ang, spacing, pull: o.pull == null ? F.pull : o.pull, satinMax: o.fillOnly ? 0 : E.SATIN_MAX }, last(runs) || startAt));
    } else if (o.kind === 'satin') {
      for (const p of g.paths) runs.push(...E.satinStroke(p, (o.width || 2.5) * (o.scaleWidth === false ? 1 : scale), { spacing: o.spacing || F.satinSpacing, pull: o.pull == null ? F.pull * 0.8 : o.pull, underlay: o.underlay || F.underlay }));
    } else if (o.kind === 'run') {
      for (const p of g.paths) runs.push(...E.runStitch(p, { len: o.len || (o.triple ? 3.0 : E.RUN_LEN), triple: !!o.triple }));
    }
    return runs.filter(r => r && r.length > 1);
  };
  function last(runs) { const r = runs[runs.length - 1]; return r ? r[r.length - 1] : null; }

  // Applique produces three colour blocks with machine stops between them.
  E.appliqueBlocks = function (o, fab) {
    const g = E.objectGeometry(o);
    const blocks = [];
    blocks.push({ label: 'Placement line: lay the fabric over this', runs: g.rings.map(r => E.runStitch(r.concat([r[0]]), { len: 2.5 })[0]) });
    blocks.push({ label: 'Tack-down: then trim the fabric close to the line', runs: g.rings.map(r => E.runStitch(r.concat([r[0]]), { len: 2.0, triple: false })[0]) });
    const cover = [];
    for (const r of g.rings) cover.push(...E.satinStroke(r.concat([r[0], r[1]]), o.width || 3.0, { spacing: (E.FABRICS[fab] || E.FABRICS.woven).satinSpacing, pull: 0.1, underlay: 'normal' }));
    blocks.push({ label: 'Cover satin', runs: cover });
    return blocks;
  };

  // ---------------------------------------------------------------- sequencing
  const ST = 0, JUMP = 1, COLOR = 3, END = 4;
  E.CMD = { ST, JUMP, COLOR, END };

  function tieIn(pts) {
    if (pts.length < 2) return pts;
    const a = pts[0], b = pts[1], L = dist(a, b) || 1, u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k = Math.min(0.7, L * 0.45);
    const q = [a[0] + u[0] * k, a[1] + u[1] * k];
    return [a, q, a, q, a].concat(pts.slice(1));
  }
  function tieOff(pts) {
    if (pts.length < 2) return pts;
    const a = pts[pts.length - 1], b = pts[pts.length - 2], L = dist(a, b) || 1, u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], k = Math.min(0.7, L * 0.45);
    const q = [a[0] + u[0] * k, a[1] + u[1] * k];
    return pts.concat([q, a, q, a]);
  }

  // Reorder so same-colour objects sew together when nothing in between overlaps them.
  E.optimizeOrder = function (objs) {
    const list = objs.slice(); const bbs = new Map(list.map(o => { const g = E.objectGeometry(o); return [o, bbox(g.rings || g.paths)]; }));
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 2; j < list.length; j++) {
        if (list[j].color !== list[i].color || list[i + 1].color === list[i].color) continue;
        let ok = true;
        for (let k = i + 1; k < j; k++) if (hit(bbs.get(list[k]), bbs.get(list[j]))) { ok = false; break; }
        if (ok) { const [o] = list.splice(j, 1); list.splice(i + 1, 0, o); }
        if (list[i + 1].color === list[i].color) break;
      }
    }
    return list;
  };

  // design: {objects:[...], fabric, hoop, optimize}
  E.buildStitches = function (design) {
    const fab = design.fabric || 'woven';
    let objs = (design.objects || []).filter(o => o.visible !== false);
    if (design.optimize !== false) objs = E.optimizeOrder(objs);
    // flatten into colour blocks
    const blocks = [];
    for (const o of objs) {
      if (o.kind === 'applique') { for (const b of E.appliqueBlocks(o, fab)) blocks.push({ color: o.color, runs: b.runs, label: b.label, stop: true, obj: o }); continue; }
      const prev = blocks[blocks.length - 1];
      const startAt = prev ? lastPoint(prev.runs) : null;
      const runs = E.objectRuns(o, fab, startAt);
      if (!runs.length) continue;
      if (prev && prev.color === o.color && !prev.stop) prev.runs.push(...runs.map(r => ({ r, obj: o })).map(x => x.r));
      else blocks.push({ color: o.color, runs, label: o.name || '', obj: o });
    }
    const st = []; const colors = []; let pos = null; let trims = 0, jumps = 0;
    blocks.forEach((b, bi) => {
      if (bi > 0) { st.push([pos[0], pos[1], COLOR]); }
      colors.push({ color: b.color, label: b.label });
      let first = true;
      for (const r of b.runs) {
        let pts = r;
        if (!pos) { st.push([pts[0][0], pts[0][1], JUMP]); pts = tieIn(pts); }
        else if (first || dist(pos, pts[0]) > E.JUMP_STITCH) {
          if (!first) { // tie off the run we leave behind
            trims++;
            const tail = tieOff(st.slice(-2).map(s => [s[0], s[1]])).slice(2);
            for (const p of tail) st.push([p[0], p[1], ST]);
          }
          st.push([pts[0][0], pts[0][1], JUMP]); jumps++;
          pts = tieIn(pts);
        }
        for (const p of pts) st.push([p[0], p[1], ST]);
        pos = pts[pts.length - 1]; first = false;
      }
      // tie off at end of each colour
      const tail = tieOff(st.slice(-2).map(s => [s[0], s[1]])).slice(2);
      for (const p of tail) st.push([p[0], p[1], ST]);
      if (bi < blocks.length - 1) trims++;
    });
    if (pos) st.push([pos[0], pos[1], END]);
    const stitchCount = st.filter(s => s[2] === ST).length;
    let threadMm = 0; for (let i = 1; i < st.length; i++) if (st[i][2] === ST) threadMm += dist(st[i - 1], st[i]);
    const minutes = stitchCount / E.SPM + (colors.length - 1) * 0.6 + trims * 0.08;
    return { stitches: st, colors, stats: { stitchCount, colorCount: colors.length, trims, jumps, minutes, threadM: threadMm * 2.4 / 1000, bounds: st.length ? bbox([st]) : null } };
  };
  function lastPoint(runs) { const r = runs[runs.length - 1]; return r ? r[r.length - 1] : null; }

  // ---------------------------------------------------------------- quality checks
  E.qualityReport = function (design, result) {
    const H = E.HOOPS[design.hoop] || E.HOOPS['5x7'];
    const out = [];
    const b = result.stats.bounds;
    if (b) {
      const rotated = design.rotateForMachine;
      const W = rotated ? H.h : H.w, Hh = rotated ? H.w : H.h;
      if (b.x0 < -0.1 || b.y0 < -0.1 || b.x1 > W + 0.1 || b.y1 > Hh + 0.1) out.push({ level: 'bad', text: `The design goes outside the ${H.label} sewing area. Move or shrink it.` });
    }
    for (const o of design.objects || []) {
      if (o.visible === false) continue;
      const g = E.objectGeometry(o), bb = bbox(g.rings || g.paths);
      const nm = o.name || o.kind;
      if (o.kind === 'satin') {
        const w = (o.width || 2.5) * ((o.t && o.t.scale) || 1);
        if (w < 1.0) out.push({ level: 'warn', text: `“${nm}”: satin narrower than 1 mm sinks into fabric. Use 1.2 mm or more, or switch to a triple run.` });
        if (w > E.SATIN_MAX) out.push({ level: 'info', text: `“${nm}”: satin is ${w.toFixed(1)} mm wide, so it was split automatically to stop snagging.` });
      }
      if (o.isText && bb.h < 6) out.push({ level: 'warn', text: `“${nm}”: lettering under 6 mm tall loses its shape. Make it at least 6 mm, or 10 mm for script fonts.` });
      if (o.kind === 'fill' && bb.w * bb.h < 4) out.push({ level: 'warn', text: `“${nm}”: this filled area is tiny (${bb.w.toFixed(1)} × ${bb.h.toFixed(1)} mm). A run or satin line will look cleaner.` });
    }
    const s = result.stats;
    if (s.stitchCount > 60000) out.push({ level: 'warn', text: `${s.stitchCount.toLocaleString()} stitches is very heavy for a 5×7 hoop. Lower the density or use fewer filled areas.` });
    if (s.colorCount > 8) out.push({ level: 'info', text: `${s.colorCount} thread changes on a single-needle machine. Merge similar colours to save time.` });
    if (!out.length) out.push({ level: 'good', text: 'No problems found. This design is ready to stitch.' });
    return out;
  };

  // ---------------------------------------------------------------- image tracing (pure)
  // img: {data(Uint8ClampedArray RGBA), width, height}; returns layers of rings in pixel space
  E.traceImage = function (img, opt) {
    opt = Object.assign({ colors: 4, removeBg: true, minArea: 30, smooth: 1 }, opt);
    const { width: W, height: Hh, data } = img, N = W * Hh;
    const label = new Int16Array(N).fill(-1);
    // k-means++ over opaque pixels
    const samples = [];
    const stepS = Math.max(1, Math.floor(N / 30000));
    for (let i = 0; i < N; i += stepS) if (data[i * 4 + 3] > 127) samples.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    const K = Math.max(1, Math.min(opt.colors + (opt.removeBg ? 1 : 0), 12));
    let cents = [samples[0] || [255, 255, 255]];
    while (cents.length < K && samples.length) {
      let best = null, bd = -1;
      for (let i = 0; i < samples.length; i += 7) { let d = Infinity; for (const c of cents) d = Math.min(d, sq(samples[i], c)); if (d > bd) { bd = d; best = samples[i]; } }
      if (bd < 40) break; cents.push(best.slice());
    }
    for (let it = 0; it < 14; it++) {
      const acc = cents.map(() => [0, 0, 0, 0]);
      for (const s of samples) { const k = nearC(s, cents); acc[k][0] += s[0]; acc[k][1] += s[1]; acc[k][2] += s[2]; acc[k][3]++; }
      cents = cents.map((c, k) => acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : c);
    }
    for (let i = 0; i < N; i++) if (data[i * 4 + 3] > 127) label[i] = nearC([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], cents);
    // background = most common border label
    let bg = -2;
    if (opt.removeBg) {
      const cnt = new Map();
      for (let x = 0; x < W; x++) { inc(cnt, label[x]); inc(cnt, label[(Hh - 1) * W + x]); }
      for (let y = 0; y < Hh; y++) { inc(cnt, label[y * W]); inc(cnt, label[y * W + W - 1]); }
      let bv = -1; cnt.forEach((v, k) => { if (v > bv) { bv = v; bg = k; } });
    }
    for (let i = 0; i < N; i++) if (label[i] === bg) label[i] = -1;
    // de-speckle: majority filter
    for (let pass = 0; pass < 2; pass++) {
      const copy = label.slice();
      for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
        const m = new Map();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) inc(m, copy[(y + dy) * W + x + dx]);
        let bk = copy[y * W + x], bv = 0; m.forEach((v, k) => { if (v > bv) { bv = v; bk = k; } });
        if (bv >= 5) label[y * W + x] = bk;
      }
    }
    // merge tiny islands into their most common neighbour
    mergeSmall(label, W, Hh, opt.minArea);
    const layers = [];
    for (let k = 0; k < cents.length; k++) {
      let area = 0; for (let i = 0; i < N; i++) if (label[i] === k) area++;
      if (area < opt.minArea) continue;
      const rings = contours(label, W, Hh, k)
        .map(r => E.simplifyRing(r, 0.9))
        .map(r => opt.smooth ? E.smoothRing(r, opt.smooth, 55) : r)
        .filter(r => r.length >= 3 && Math.abs(ringArea(r)) >= opt.minArea * 0.5);
      if (rings.length) layers.push({ color: rgbToHex(cents[k]), rings, area });
    }
    layers.sort((a, b) => b.area - a.area);
    return { layers, width: W, height: Hh, background: bg >= 0 ? rgbToHex(cents[bg]) : null };
  };
  function sq(a, b) { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }
  function nearC(s, cs) { let b = 0, bd = Infinity; for (let k = 0; k < cs.length; k++) { const d = sq(s, cs[k]); if (d < bd) { bd = d; b = k; } } return b; }
  function inc(m, k) { m.set(k, (m.get(k) || 0) + 1); }
  function mergeSmall(label, W, H, minArea) {
    const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (seen[s]) continue; const k = label[s]; let qh = 0, qt = 0; q[qt++] = s; seen[s] = 1; const nb = new Map();
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i / W) | 0;
        const ns = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const j of ns) { if (j < 0) continue; if (label[j] === k) { if (!seen[j]) { seen[j] = 1; q[qt++] = j; } } else inc(nb, label[j]); }
      }
      if (qt < minArea && nb.size) { let bk = k, bv = -1; nb.forEach((v, kk) => { if (v > bv) { bv = v; bk = kk; } }); for (let t = 0; t < qt; t++) label[q[t]] = bk; }
    }
  }
  // pixel-edge boundary chaining: exact outlines (outer rings and holes)
  function contours(label, W, H, k) {
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === k;
    const nextOf = new Map(); const key = (x, y) => y * (W + 1) + x;
    const add = (ax, ay, bx, by) => { const kk = key(ax, ay); const arr = nextOf.get(kk); const v = [bx, by]; if (arr) arr.push(v); else nextOf.set(kk, [v]); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
    const rings = [];
    for (const [startK, arr] of nextOf) {
      while (arr.length) {
        const sx = startK % (W + 1), sy = (startK / (W + 1)) | 0;
        const ring = [[sx, sy]]; let cur = arr.pop(); let guard = 0;
        while (guard++ < 4 * W * H) {
          if (cur[0] === sx && cur[1] === sy) break;
          ring.push(cur);
          const nx = nextOf.get(key(cur[0], cur[1]));
          if (!nx || !nx.length) break;
          cur = nx.pop();
        }
        // keep only corner points (drop collinear)
        const r2 = ring.filter((p, i) => { const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); });
        if (r2.length >= 3) rings.push(r2);
      }
    }
    return rings;
  }

  // ---------------------------------------------------------------- PES / PEC writer (Brother)
  // Ported from pyembroidery (MIT): PES v1 with CEmbOne/CSewSeg blocks + PEC section.
  E.writePES = function (result, opt) {
    opt = opt || {};
    const name = String(opt.name || 'design').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 8) || 'design';
    // to 0.1 mm integer coordinates, centred on the design
    const raw = result.stitches; if (!raw.length) throw new Error('Nothing to stitch yet.');
    let pts = raw.map(s => [s[0] * 10, s[1] * 10, s[2]]);
    if (opt.rotate) pts = pts.map(p => [-p[1], p[0], p[2]]);
    const bb0 = bbox([pts]); const cx = (bb0.x0 + bb0.x1) / 2, cy = (bb0.y0 + bb0.y1) / 2;
    pts = pts.map(p => [Math.round(p[0] - cx), Math.round(p[1] - cy), p[2]]);
    const threads = result.colors.map(c => hexToRgb(c.color));
    const w = new Writer();
    const ext = bbox([pts]);
    // ---- PES header
    w.str('#PES0001');
    const pecPtr = w.pos; w.i32(0);
    w.i16(1); w.i16(1); w.i16(1); // scale-to-fit, 130x180 hoop, 1 block object
    w.i16(0xFFFF); w.i16(0);
    // CEmbOne
    const left = ext.x0, top = ext.y0, right = ext.x1, bottom = ext.y1;
    const width = right - left, height = bottom - top;
    w.i16(7); w.str('CEmbOne');
    for (let i = 0; i < 8; i++) w.i16(0);
    let tx = 350 + 1300 / 2 - width / 2, ty = 100 + height + 1800 / 2 - height / 2;
    w.f32(1); w.f32(0); w.f32(0); w.f32(1); w.f32(tx); w.f32(ty);
    w.i16(1); w.i16(0); w.i16(0); w.i16(Math.round(width)); w.i16(Math.round(height));
    for (let i = 0; i < 8; i++) w.u8(0);
    const secPtr = w.pos; w.i16(0);
    w.i16(0xFFFF); w.i16(0);
    w.i16(7); w.str('CSewSeg');
    // segments
    const adjX = left, adjY = bottom;
    let section = 0, colorlog = [], prevCode = -1, flagSet = false, ci = 0;
    let code = nearestIndex(threads[0] || [0, 0, 0], PEC_CHART);
    let sx = 0, sy = 0;
    const cmdBlocks = [];
    for (const p of pts) { const lb = cmdBlocks[cmdBlocks.length - 1]; if (lb && lb.cmd === p[2] && p[2] !== COLOR) lb.pts.push(p); else cmdBlocks.push({ cmd: p[2], pts: [p] }); }
    for (const blk of cmdBlocks) {
      let seg, flag;
      if (blk.cmd === JUMP) { const lp = blk.pts[blk.pts.length - 1]; seg = [[sx - adjX, sy - adjY], [lp[0] - adjX, lp[1] - adjY]]; flag = 1; }
      else if (blk.cmd === COLOR) { ci++; code = nearestIndex(threads[ci] || [0, 0, 0], PEC_CHART); continue; }
      else if (blk.cmd === ST) { seg = blk.pts.map(p => { sx = p[0]; sy = p[1]; return [p[0] - adjX, p[1] - adjY]; }); flag = 0; }
      else continue;
      if (flagSet) w.i16(0x8003);
      flagSet = true;
      if (prevCode !== code) { colorlog.push([section, code]); prevCode = code; }
      w.i16(flag); w.i16(code); w.i16(seg.length);
      for (const s of seg) { w.i16(Math.trunc(s[0])); w.i16(Math.trunc(s[1])); }
      section++;
    }
    w.i16(colorlog.length); for (const c of colorlog) { w.i16(c[0]); w.i16(c[1]); }
    w.set16(secPtr, section);
    w.i16(0); w.i16(0);
    w.set32(pecPtr, w.pos);
    // ---- PEC
    w.str('LA:' + name.padEnd(16, ' ') + '\r');
    w.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xFF, 0x00]);
    w.u8(6); w.u8(38);
    // unique palette
    const pal = PEC_CHART.slice(); const chart = new Array(PEC_CHART.length).fill(null);
    const uniq = []; for (const t of threads) if (!uniq.some(u => u.join() === t.join())) uniq.push(t);
    for (const t of uniq) { const i = nearestIndex(t, pal); if (i == null) break; pal[i] = null; chart[i] = t; }
    const idx = threads.map(t => nearestIndex(t, chart));
    w.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]);
    w.u8(idx.length - 1); w.bytes(idx);
    for (let i = idx.length; i < 463; i++) w.u8(0x20);
    // stitch block
    const blockStart = w.pos;
    w.bytes([0, 0]); const lenPtr = w.pos; w.u8(0); w.u8(0); w.u8(0);
    w.bytes([0x31, 0xFF, 0xF0]);
    w.i16(Math.round(width)); w.i16(Math.round(height)); w.i16(0x1E0); w.i16(0x1B0);
    pecEncode(w, pts);
    const blen = w.pos - blockStart; w.buf[lenPtr] = blen & 255; w.buf[lenPtr + 1] = (blen >> 8) & 255; w.buf[lenPtr + 2] = (blen >> 16) & 255;
    // thumbnails
    const stitchOnly = pts.filter(p => p[2] === ST);
    w.bytes(icon(ext, stitchOnly, 4));
    let block = [];
    const colorBlocks = [];
    for (const p of pts) { if (p[2] === COLOR) { colorBlocks.push(block); block = []; } else if (p[2] === ST) block.push(p); }
    colorBlocks.push(block);
    for (const b of colorBlocks.slice(0, idx.length)) w.bytes(icon(ext, b, 5));
    return w.out();
  };
  const BLANK = [0,0,0,0,0,0,240,255,255,255,255,15,8,0,0,0,0,16,4,0,0,0,0,32].concat([].concat(...Array(32).fill([2,0,0,0,0,64]))).concat([4,0,0,0,0,32,8,0,0,0,0,16,240,255,255,255,255,15,0,0,0,0,0,0]);
  function icon(ext, points, buffer) {
    const g = BLANK.slice(); const stride = 6, gw = 48, gh = 38;
    const dw = (ext.x1 - ext.x0) || 1, dh = (ext.y1 - ext.y0) || 1;
    const scale = Math.min((gw - buffer) / dw, (gh - buffer) / dh);
    const cx = (ext.x1 + ext.x0) / 2, cy = (ext.y1 + ext.y0) / 2;
    const tx = -cx * scale + gw / 2, ty = -cy * scale + gh / 2;
    for (const p of points) {
      const x = Math.floor(p[0] * scale + tx), y = Math.floor(p[1] * scale + ty);
      const i = y * stride + (x >> 3); if (x >= 0 && i >= 0 && i < g.length) g[i] |= 1 << (x % 8);
    }
    return g;
  }
  function pecEncode(w, pts) {
    let colorTwo = true, jumping = true, init = true, xx = 0, yy = 0;
    const val = (v, long, flag) => {
      if (!long && v > -64 && v < 63) w.u8(v & 0x7F);
      else { let x = (v & 0x0FFF) | 0x8000 | (flag << 8); w.u8((x >> 8) & 0xFF); w.u8(x & 0xFF); }
    };
    for (const p of pts) {
      const dx = Math.round(p[0] - xx), dy = Math.round(p[1] - yy); xx += dx; yy += dy;
      const c = p[2];
      if (c === ST) {
        if (jumping) { if (dx !== 0 && dy !== 0) { val(0); val(0); } jumping = false; }
        // long stitches must be split to stay in range (never happens below 204 mm)
        val(dx, false, 0); val(dy, false, 0);
      } else if (c === JUMP) {
        jumping = true; const f = init ? 0x10 : 0x20; val(dx, true, f); val(dy, true, f);
      } else if (c === COLOR) {
        if (jumping) { val(0); val(0); jumping = false; }
        w.bytes([0xFE, 0xB0, colorTwo ? 2 : 1]); colorTwo = !colorTwo;
      } else if (c === END) { w.u8(0xFF); break; }
      init = false;
    }
  }
  function Writer() { this.buf = new Uint8Array(1 << 16); this.pos = 0; }
  Writer.prototype.grow = function (n) { if (this.pos + n > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n + 1024)); b.set(this.buf); this.buf = b; } };
  Writer.prototype.u8 = function (v) { this.grow(1); this.buf[this.pos++] = v & 255; };
  Writer.prototype.bytes = function (a) { for (const v of a) this.u8(v); };
  Writer.prototype.str = function (s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); };
  Writer.prototype.i16 = function (v) { v = Math.round(v) & 0xFFFF; this.u8(v); this.u8(v >> 8); };
  Writer.prototype.i32 = function (v) { this.i16(v & 0xFFFF); this.i16((v >>> 16) & 0xFFFF); };
  Writer.prototype.f32 = function (v) { const b = new Uint8Array(new Float32Array([v]).buffer); this.bytes(b); };
  Writer.prototype.set16 = function (at, v) { this.buf[at] = v & 255; this.buf[at + 1] = (v >> 8) & 255; };
  Writer.prototype.set32 = function (at, v) { for (let i = 0; i < 4; i++) this.buf[at + i] = (v >>> (8 * i)) & 255; };
  Writer.prototype.out = function () { return this.buf.slice(0, this.pos); };

  // ---------------------------------------------------------------- shapes library
  E.shapes = {
    rect: (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]],
    ellipse: (cx, cy, rx, ry) => { const n = Math.max(24, Math.ceil((rx + ry) * 1.5)); return [Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)])]; },
    star: (cx, cy, r, pts) => { pts = pts || 5; const out = []; for (let i = 0; i < pts * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / pts, rr = i % 2 ? r * 0.45 : r; out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return [out]; },
    heart: (cx, cy, r) => { const out = []; for (let i = 0; i < 80; i++) { const t = i / 80 * 2 * Math.PI; out.push([cx + r * 16 * Math.pow(Math.sin(t), 3) / 17, cy - r * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]); } return [out]; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.Stitch = E;
})(typeof self !== 'undefined' ? self : this);
