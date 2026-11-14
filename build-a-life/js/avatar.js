/* Build a Life — cute SVG avatars that grow up with you.
   BAL.avatar(look, age, mood, opts)
     opts.full  → full-body character (clothes, trousers/skirts/dresses, shoes)
     otherwise  → head-and-shoulders portrait
     opts.bg    → circle background colour (portraits)
     opts.label → accessible name; opts.cls → class */
(function (BAL) {
  'use strict';
  var clipN = 0;

  function shade(hex, amt) {
    var n = parseInt(String(hex || '#888888').slice(1), 16);
    if (isNaN(n)) n = 0x888888;
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function light(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 200;
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function rect(x, y, w, h, fill, rx, extra) { return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(Math.max(0, w)) + '" height="' + f(Math.max(0, h)) + '"' + (rx ? ' rx="' + f(rx) + '"' : '') + ' fill="' + fill + '"' + (extra || '') + '/>'; }
  function circ(x, y, r, fill, extra) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }

  /* ===================== Head (shared) ===================== */
  function hairColour(look, group, age) {
    if (age >= 75) return '#ECECEC';
    if (age >= 58) return '#C9C9C9';
    return look.hairColor || '#5A3825';
  }

  function headBack(s, look, group, cx, cy, r, hairC) {
    var st = look.hair || 'short';
    if (group === 'baby') return;
    if (st === 'long') s.push(path('M' + f(cx - r - 3) + ' ' + f(cy - 4) + ' Q' + f(cx - r - 6) + ' ' + f(cy + r + 14) + ' ' + f(cx - r + 6) + ' ' + f(cy + r + 16) + ' L' + f(cx + r - 6) + ' ' + f(cy + r + 16) + ' Q' + f(cx + r + 6) + ' ' + f(cy + r + 14) + ' ' + f(cx + r + 3) + ' ' + f(cy - 4) + ' Z', hairC));
    if (st === 'afro') s.push(circ(cx, cy - 3, r * 1.42, hairC));
    if (st === 'curly') {
      for (var i = 0; i < 9; i++) { var a = Math.PI + (i / 8) * Math.PI; s.push(circ(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1) + 2, r * 0.36, hairC)); }
      s.push(circ(cx - r, cy + 8, r * 0.3, hairC) + circ(cx + r, cy + 8, r * 0.3, hairC));
    }
    if (st === 'ponytail') s.push('<ellipse cx="' + f(cx + r + 3) + '" cy="' + f(cy + 6) + '" rx="' + f(r * 0.32) + '" ry="' + f(r * 0.75) + '" fill="' + hairC + '" transform="rotate(-18 ' + f(cx + r + 3) + ' ' + f(cy + 6) + ')"/>');
    if (st === 'pigtails') s.push(circ(cx - r - 4, cy + 2, r * 0.42, hairC) + circ(cx + r + 4, cy + 2, r * 0.42, hairC));
    if (st === 'bun') s.push(circ(cx, cy - r - 4, r * 0.42, hairC));
  }

  function headFront(s, look, group, cx, cy, r, hairC, mood, age) {
    var skin = look.skin || '#F6C9A0', eyes = look.eyes || '#3B2314';
    s.push(circ(cx - r + 1, cy + 2, r * 0.22, shade(skin, -8)) + circ(cx + r - 1, cy + 2, r * 0.22, shade(skin, -8)));
    s.push(circ(cx, cy, r, skin));
    var ey = cy + 1, ex = r * 0.38, eyeR = group === 'baby' ? r * 0.15 : r * 0.15;
    [-1, 1].forEach(function (side) {
      var x = cx + side * ex;
      s.push('<ellipse cx="' + f(x) + '" cy="' + f(ey) + '" rx="' + f(eyeR) + '" ry="' + f(eyeR * 1.15) + '" fill="#2b2b2b"/>');
      s.push('<ellipse cx="' + f(x) + '" cy="' + f(ey + 0.6) + '" rx="' + f(eyeR * 0.62) + '" ry="' + f(eyeR * 0.72) + '" fill="' + eyes + '"/>');
      s.push(circ(x + 1, ey - 1.3, eyeR * 0.36, '#fff'));
      if (group === 'older') s.push('<path d="M' + f(x + side * 4.5) + ' ' + f(ey - 1) + ' l' + (side * 2.5) + ' -1 M' + f(x + side * 4.5) + ' ' + f(ey + 1.5) + ' l' + (side * 2.5) + ' 1" stroke="' + shade(skin, -40) + '" stroke-width=".8" stroke-linecap="round"/>');
    });
    s.push('<ellipse cx="' + f(cx - r * 0.58) + '" cy="' + f(cy + r * 0.32) + '" rx="' + f(r * 0.17) + '" ry="' + f(r * 0.11) + '" fill="#FF7A9A" opacity=".45"/>');
    s.push('<ellipse cx="' + f(cx + r * 0.58) + '" cy="' + f(cy + r * 0.32) + '" rx="' + f(r * 0.17) + '" ry="' + f(r * 0.11) + '" fill="#FF7A9A" opacity=".45"/>');
    var my = cy + r * 0.45, mw = r * 0.27;
    if (mood >= 65) s.push(path('M' + f(cx - mw) + ' ' + f(my) + ' Q' + f(cx) + ' ' + f(my + mw * 1.35) + ' ' + f(cx + mw) + ' ' + f(my) + ' Z', '#B23A48') + path('M' + f(cx - mw * 0.6) + ' ' + f(my + mw * 0.57) + ' Q' + f(cx) + ' ' + f(my + mw * 1.1) + ' ' + f(cx + mw * 0.6) + ' ' + f(my + mw * 0.57), '#FF8FA3'));
    else if (mood >= 35) s.push('<path d="M' + f(cx - mw * 0.85) + ' ' + f(my) + ' Q' + f(cx) + ' ' + f(my + mw * 0.8) + ' ' + f(cx + mw * 0.85) + ' ' + f(my) + '" stroke="#8a2f3b" stroke-width="2" fill="none" stroke-linecap="round"/>');
    else s.push('<path d="M' + f(cx - mw * 0.85) + ' ' + f(my + 3) + ' Q' + f(cx) + ' ' + f(my - 1.5) + ' ' + f(cx + mw * 0.85) + ' ' + f(my + 3) + '" stroke="#8a2f3b" stroke-width="2" fill="none" stroke-linecap="round"/>');

    // hair on top
    var st = look.hair || 'short', top = cy - r, fr = cy - r * 0.25;
    if (group === 'baby') {
      s.push('<path d="M' + f(cx - 2) + ' ' + f(top + 2) + ' q-1 -8 6 -7 q4 1 1 5" stroke="' + hairC + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
    } else if (st === 'afro') {
      s.push(path('M' + f(cx - r) + ' ' + f(cy - 3) + ' Q' + f(cx) + ' ' + f(cy - r * 0.6) + ' ' + f(cx + r) + ' ' + f(cy - 3) + ' Q' + f(cx + r) + ' ' + f(top - 4) + ' ' + f(cx) + ' ' + f(top - 4) + ' Q' + f(cx - r) + ' ' + f(top - 4) + ' ' + f(cx - r) + ' ' + f(cy - 3) + ' Z', hairC));
    } else if (st === 'spiky') {
      var pts = [];
      for (var k = 0; k <= 8; k++) { var px = cx - r - 1 + (k * (2 * r + 2)) / 8; pts.push(f(px) + ',' + f(k % 2 ? top - 7 : top + 4)); }
      s.push(path('M' + f(cx - r - 1) + ' ' + f(cy - 2) + ' Q' + f(cx - r) + ' ' + f(top - 2) + ' ' + f(cx) + ' ' + f(top - 2) + ' Q' + f(cx + r) + ' ' + f(top - 2) + ' ' + f(cx + r + 1) + ' ' + f(cy - 2) + ' Q' + f(cx) + ' ' + f(fr - 6) + ' ' + f(cx - r - 1) + ' ' + f(cy - 2) + ' Z', hairC));
      if (['cap', 'beanie', 'sunhat', 'flatcap'].indexOf(look.accessory) < 0) s.push('<polyline points="' + pts.join(' ') + '" fill="' + hairC + '" stroke="' + hairC + '" stroke-width="2" stroke-linejoin="round"/>');
    } else if (st === 'buzz') {
      s.push(path('M' + f(cx - r + 1) + ' ' + f(cy - 5) + ' A' + f(r - 1) + ' ' + f(r - 1) + ' 0 0 1 ' + f(cx + r - 1) + ' ' + f(cy - 5) + ' Q' + f(cx) + ' ' + f(top + 3) + ' ' + f(cx - r + 1) + ' ' + f(cy - 5) + ' Z', hairC, ' opacity=".8"'));
    } else if (st === 'curly') {
      for (var m = 0; m < 7; m++) { var aa = Math.PI * 1.08 + (m / 6) * Math.PI * 0.84; s.push(circ(cx + Math.cos(aa) * (r * 0.78), cy + Math.sin(aa) * (r * 0.78), r * 0.34, hairC)); }
    } else {
      var sweep = st === 'short' ? cx + r * 0.2 : cx;
      s.push(path('M' + f(cx - r - 1.5) + ' ' + f(cy + 3) + ' Q' + f(cx - r - 2) + ' ' + f(top - 3) + ' ' + f(cx) + ' ' + f(top - 3) + ' Q' + f(cx + r + 2) + ' ' + f(top - 3) + ' ' + f(cx + r + 1.5) + ' ' + f(cy + 3) + ' Q' + f(cx + r - 4) + ' ' + f(fr - 2) + ' ' + f(sweep) + ' ' + f(fr) + ' Q' + f(cx - r + 3) + ' ' + f(fr - 1) + ' ' + f(cx - r - 1.5) + ' ' + f(cy + 3) + ' Z', hairC));
      s.push('<path d="M' + f(cx - r * 0.5) + ' ' + f(top + 3) + ' Q' + f(cx) + ' ' + f(top - 1) + ' ' + f(cx + r * 0.4) + ' ' + f(top + 2) + '" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none" stroke-linecap="round"/>');
    }

    // head & face accessories
    var acc = look.accessory || 'none', fav = look.fav || '#4DABF7';
    if (acc === 'glasses' || acc === 'sunglasses') {
      var lens = acc === 'sunglasses' ? '#212529' : 'rgba(255,255,255,.25)', gr = r * 0.29;
      s.push('<g fill="' + lens + '" stroke="#333" stroke-width="1.6">' + circ(cx - ex, ey, gr, lens) + circ(cx + ex, ey, gr, lens) + '</g><path d="M' + f(cx - ex + gr) + ' ' + f(ey) + ' Q' + f(cx) + ' ' + f(ey - 2) + ' ' + f(cx + ex - gr) + ' ' + f(ey) + '" stroke="#333" stroke-width="1.6" fill="none"/>');
      if (acc === 'sunglasses') s.push(circ(cx - ex - gr * 0.35, ey - gr * 0.35, gr * 0.22, '#fff', ' opacity=".6"'));
    } else if (acc === 'bow') {
      var bx = cx + r * 0.62, by = cy - r * 0.78;
      s.push('<g transform="rotate(20 ' + f(bx) + ' ' + f(by) + ')">' + path('M' + f(bx) + ' ' + f(by) + ' l-9 -6 v12 z M' + f(bx) + ' ' + f(by) + ' l9 -6 v12 z', '#FF4D8D') + circ(bx, by, 2.6, '#D6336C') + '</g>');
    } else if (acc === 'cap') {
      var cyy = cy - r * 0.35;
      s.push(path('M' + f(cx - r - 1) + ' ' + f(cyy) + ' Q' + f(cx - r) + ' ' + f(top - 6) + ' ' + f(cx) + ' ' + f(top - 6) + ' Q' + f(cx + r) + ' ' + f(top - 6) + ' ' + f(cx + r + 1) + ' ' + f(cyy) + ' Z', shade(fav, -25)) +
        path('M' + f(cx - r - 2) + ' ' + f(cyy) + ' L' + f(cx + r + 16) + ' ' + f(cyy) + ' Q' + f(cx + r + 16) + ' ' + f(cyy + 5) + ' ' + f(cx + r) + ' ' + f(cyy + 4) + ' L' + f(cx - r - 2) + ' ' + f(cyy + 3) + ' Z', shade(fav, -45)) + circ(cx, top - 6, 2.2, shade(fav, 30)));
    } else if (acc === 'beanie') {
      var by2 = cy - r * 0.3;
      s.push(path('M' + f(cx - r - 1.5) + ' ' + f(by2) + ' Q' + f(cx - r) + ' ' + f(top - 8) + ' ' + f(cx) + ' ' + f(top - 8) + ' Q' + f(cx + r) + ' ' + f(top - 8) + ' ' + f(cx + r + 1.5) + ' ' + f(by2) + ' Z', fav) +
        rect(cx - r - 2.5, by2 - 4, 2 * r + 5, 6, shade(fav, -30), 3) + circ(cx, top - 9, 4.5, '#fff'));
    } else if (acc === 'sunhat') {
      s.push('<ellipse cx="' + f(cx) + '" cy="' + f(cy - r * 0.45) + '" rx="' + f(r * 1.65) + '" ry="' + f(r * 0.3) + '" fill="#F4D58D"/>' +
        path('M' + f(cx - r * 0.85) + ' ' + f(cy - r * 0.45) + ' Q' + f(cx - r * 0.85) + ' ' + f(top - 9) + ' ' + f(cx) + ' ' + f(top - 9) + ' Q' + f(cx + r * 0.85) + ' ' + f(top - 9) + ' ' + f(cx + r * 0.85) + ' ' + f(cy - r * 0.45) + ' Z', '#F4D58D') +
        rect(cx - r * 0.85, cy - r * 0.45 - 5, r * 1.7, 4, fav));
    } else if (acc === 'flatcap') {
      s.push(path('M' + f(cx - r - 1) + ' ' + f(cy - r * 0.4) + ' Q' + f(cx - r * 0.6) + ' ' + f(top - 6) + ' ' + f(cx + r * 0.2) + ' ' + f(top - 5) + ' Q' + f(cx + r + 4) + ' ' + f(top - 3) + ' ' + f(cx + r + 6) + ' ' + f(cy - r * 0.45) + ' Q' + f(cx) + ' ' + f(cy - r * 0.2) + ' ' + f(cx - r - 1) + ' ' + f(cy - r * 0.4) + ' Z', '#7A6A5A'));
    } else if (acc === 'flower') {
      var fx = cx - r * 0.7, fy = cy - r * 0.72;
      for (var p = 0; p < 5; p++) { var pa = p * 1.2566; s.push(circ(fx + Math.cos(pa) * 3.6, fy + Math.sin(pa) * 3.6, 3, '#FFF3B0')); }
      s.push(circ(fx, fy, 2.4, '#FF9F1C'));
    } else if (acc === 'headband') {
      s.push('<path d="M' + f(cx - r + 1) + ' ' + f(cy - r * 0.45) + ' Q' + f(cx) + ' ' + f(cy - r * 1.32) + ' ' + f(cx + r - 1) + ' ' + f(cy - r * 0.45) + '" stroke="' + shade(fav, 20) + '" stroke-width="4" fill="none" stroke-linecap="round"/>');
    } else if (acc === 'crown') {
      var ty = top - 2;
      s.push(path('M' + f(cx - 11) + ' ' + f(ty + 4) + ' L' + f(cx - 12) + ' ' + f(ty - 9) + ' L' + f(cx - 5) + ' ' + f(ty - 3) + ' L' + f(cx) + ' ' + f(ty - 12) + ' L' + f(cx + 5) + ' ' + f(ty - 3) + ' L' + f(cx + 12) + ' ' + f(ty - 9) + ' L' + f(cx + 11) + ' ' + f(ty + 4) + ' Z', '#FFD43B', ' stroke="#F59F00" stroke-width="1.2" stroke-linejoin="round"') + circ(cx, ty - 1, 2, '#FF4D8D'));
    }
  }

  /* ===================== Full body ===================== */
  var DIMS = {
    baby: { r: 20, T: 28, L: 20, W: 34, legW: 10, armW: 7.5, shoeH: 6 },
    toddler: { r: 19, T: 30, L: 28, W: 33, legW: 10.5, armW: 7.5, shoeH: 6.5 },
    child: { r: 17.5, T: 36, L: 40, W: 35, legW: 11, armW: 8, shoeH: 7 },
    teen: { r: 16.5, T: 40, L: 50, W: 38, legW: 11.5, armW: 8, shoeH: 7.5 },
    adult: { r: 16, T: 42, L: 52, W: 40, legW: 12, armW: 8.5, shoeH: 7.5 },
    older: { r: 16, T: 41, L: 50, W: 41, legW: 12, armW: 8.5, shoeH: 7.5 }
  };

  function torsoPath(cx, top, bot, w, shoulder) {
    var hw = w / 2, bw = w * 0.46;
    return 'M' + f(cx - bw) + ' ' + f(bot) + ' L' + f(cx - hw) + ' ' + f(top + shoulder) + ' Q' + f(cx - hw) + ' ' + f(top) + ' ' + f(cx - hw + shoulder) + ' ' + f(top) +
      ' L' + f(cx + hw - shoulder) + ' ' + f(top) + ' Q' + f(cx + hw) + ' ' + f(top) + ' ' + f(cx + hw) + ' ' + f(top + shoulder) + ' L' + f(cx + bw) + ' ' + f(bot) + ' Z';
  }

  function fullBody(s, look, group, age, mood) {
    var G = BAL.Game, d = DIMS[group];
    var of = G.outfitFor(look, group);
    var top = G.piece('top', of.top), bottom = G.piece('bottom', of.bottom), shoes = G.piece('shoes', of.shoes);
    var kind = bottom.kind;
    var skin = look.skin || '#F6C9A0', skinD = shade(skin, -14);
    var tc = of.topColor, bc = of.bottomColor, sc = of.shoesColor, xc = of.extraColor;
    var cx = 50, footY = 146;
    var legBot = footY - d.shoeH, legTop = legBot - d.L, tBot = legTop + 4, tTop = tBot - d.T;
    var r = d.r, cy = tTop - r + 1;
    var hw = d.W / 2, sh = Math.min(9, d.W * 0.24);
    var gap = group === 'baby' || group === 'toddler' ? 2 : 3;
    var lx = cx - gap / 2 - d.legW, rx = cx + gap / 2;   // left & right leg x
    var hairC = hairColour(look, group, age);
    var bodyColor = (kind === 'dress' || kind === 'onesie') ? bc : tc;
    var armTopY = tTop + 2, armLen = d.T * 0.82;

    // cape behind everything
    if (of.extra === 'cape') s.push(path('M' + f(cx - hw + 2) + ' ' + f(tTop + 2) + ' L' + f(cx - hw - 8) + ' ' + f(legBot - 2) + ' Q' + f(cx) + ' ' + f(legBot + 4) + ' ' + f(cx + hw + 8) + ' ' + f(legBot - 2) + ' L' + f(cx + hw - 2) + ' ' + f(tTop + 2) + ' Z', '#E03131'));
    headBack(s, look, group, cx, cy, r, hairC);

    /* legs (skin) */
    s.push(rect(lx, legTop, d.legW, d.L + 1, skin, d.legW / 2.4) + rect(rx, legTop, d.legW, d.L + 1, skin, d.legW / 2.4));

    /* bottoms */
    var hipTop = tBot - 7, hipW = d.W * 0.92;
    function legsCloth(len, col, inset) {
      inset = inset || 0;
      s.push(rect(cx - hipW / 2, hipTop, hipW, legTop - hipTop + 4, col, 4));
      s.push(rect(lx + inset, legTop, d.legW - inset, len, col, 3) + rect(rx, legTop, d.legW - inset, len, col, 3));
    }
    if (kind === 'trousers' || kind === 'dungarees') {
      var inset = of.bottom === 'leggings' ? 1.2 : 0;
      legsCloth(d.L + 1, bc, inset);
      if (of.bottom === 'jeans') s.push('<path d="M' + f(lx + d.legW - 2.5) + ' ' + f(legTop + 2) + ' V' + f(legBot - 2) + ' M' + f(rx + 2.5) + ' ' + f(legTop + 2) + ' V' + f(legBot - 2) + '" stroke="' + shade(bc, 45) + '" stroke-width=".9" stroke-dasharray="2 1.5"/>');
      if (of.bottom === 'joggers' || of.bottom === 'babytrousers') s.push(rect(lx, legBot - 4, d.legW, 4, shade(bc, -30), 2) + rect(rx, legBot - 4, d.legW, 4, shade(bc, -30), 2) + '<path d="M' + f(lx + 1.5) + ' ' + f(legTop) + ' V' + f(legBot - 5) + ' M' + f(rx + d.legW - 1.5) + ' ' + f(legTop) + ' V' + f(legBot - 5) + '" stroke="#fff" stroke-width="1.2" opacity=".7"/>');
      if (of.bottom === 'cargo') s.push(rect(lx - 1, legTop + d.L * 0.35, 5, 7, shade(bc, -22), 1) + rect(rx + d.legW - 4, legTop + d.L * 0.35, 5, 7, shade(bc, -22), 1));
      if (of.bottom === 'slacks' || of.bottom === 'trousers') s.push('<path d="M' + f(lx + d.legW / 2) + ' ' + f(legTop + 3) + ' V' + f(legBot - 1) + ' M' + f(rx + d.legW / 2) + ' ' + f(legTop + 3) + ' V' + f(legBot - 1) + '" stroke="' + shade(bc, -25) + '" stroke-width=".7"/>');
    } else if (kind === 'shorts') {
      legsCloth(d.L * 0.38, bc);
      s.push(rect(lx, legTop + d.L * 0.38 - 2.5, d.legW, 2.5, shade(bc, -25)) + rect(rx, legTop + d.L * 0.38 - 2.5, d.legW, 2.5, shade(bc, -25)));
    } else if (kind === 'onesie') {
      var oneLen = of.bottom === 'romper' ? d.L * 0.38 : d.L + 1;
      legsCloth(oneLen, bc);
      if (of.bottom === 'babygrow') s.push(rect(lx - 0.5, legBot - 3, d.legW + 1, 5, shade(bc, -15), 3) + rect(rx - 0.5, legBot - 3, d.legW + 1, 5, shade(bc, -15), 3));
    }

    /* shoes */
    shoeSvg(s, of.shoes, sc, skin, lx, rx, legBot, d);

    /* torso */
    var tOver = kind === 'dress' && of.bottom !== 'pinafore';
    if (kind !== 'onesie' && !tOver) s.push(path(torsoPath(cx, tTop, tBot, d.W, sh), tc));
    if (kind === 'onesie' || tOver) s.push(path(torsoPath(cx, tTop, tBot, d.W, sh), bc));
    if (!tOver && kind !== 'onesie') topDetails(s, of.top, tc, cx, tTop, tBot, d, sh);
    if (kind === 'onesie') {
      if (of.bottom === 'jumpsuit') s.push(rect(cx - hipW / 2, tBot - 9, hipW, 3.5, shade(bc, -35)) + rect(cx - 2.5, tBot - 9.5, 5, 4.5, '#FFD43B', 1));
      else for (var sn = 0; sn < 3; sn++) s.push(circ(cx, tTop + 9 + sn * 6, 1.1, shade(bc, 45)));
    }
    // neckline
    s.push(path('M' + f(cx - 6) + ' ' + f(tTop - 0.5) + ' Q' + f(cx) + ' ' + f(tTop + 7) + ' ' + f(cx + 6) + ' ' + f(tTop - 0.5) + ' Z', skinD));

    /* skirts & dresses */
    if (kind === 'skirt' || kind === 'dress') {
      var sTop = kind === 'dress' ? tBot - 8 : hipTop, sw = hipW / 2, sLen, flare;
      var id = of.bottom;
      sLen = id === 'maxi' || id === 'teadress' ? d.L * 0.8 : id === 'tutu' ? d.L * 0.32 : id === 'party' ? d.L * 0.5 : d.L * 0.45;
      flare = id === 'tutu' || id === 'party' ? 1.75 : id === 'maxi' ? 1.25 : 1.4;
      var sB = legTop + sLen, bwid = sw * flare;
      if (id === 'tutu' || id === 'party') {
        var zz = 'M' + f(cx - sw) + ' ' + f(sTop) + ' L' + f(cx - bwid) + ' ' + f(sB);
        for (var z = 1; z <= 8; z++) zz += ' L' + f(cx - bwid + z * (2 * bwid / 8) - bwid / 8) + ' ' + f(sB + (z % 2 ? 3 : 0)) + ' L' + f(cx - bwid + z * (2 * bwid / 8)) + ' ' + f(sB);
        zz += ' L' + f(cx + sw) + ' ' + f(sTop) + ' Z';
        s.push(path(zz, bc));
        s.push(path('M' + f(cx - sw * 0.9) + ' ' + f(sTop + 3) + ' L' + f(cx - bwid * 0.75) + ' ' + f(sB - 2) + ' L' + f(cx + bwid * 0.75) + ' ' + f(sB - 2) + ' L' + f(cx + sw * 0.9) + ' ' + f(sTop + 3) + ' Z', '#fff', ' opacity=".18"'));
      } else {
        s.push(path('M' + f(cx - sw) + ' ' + f(sTop) + ' L' + f(cx - bwid) + ' ' + f(sB) + ' Q' + f(cx) + ' ' + f(sB + 3) + ' ' + f(cx + bwid) + ' ' + f(sB) + ' L' + f(cx + sw) + ' ' + f(sTop) + ' Z', bc));
      }
      if (id === 'pleated') for (var pl = -2; pl <= 2; pl++) s.push('<path d="M' + f(cx + pl * sw * 0.35) + ' ' + f(sTop + 2) + ' L' + f(cx + pl * bwid * 0.38) + ' ' + f(sB) + '" stroke="' + shade(bc, -28) + '" stroke-width=".8"/>');
      if (id === 'teadress' || id === 'sundress') for (var dt = 0; dt < 7; dt++) s.push(circ(cx - bwid * 0.6 + (dt % 4) * bwid * 0.4, sTop + 5 + Math.floor(dt / 4) * (sLen * 0.4) + (dt % 2) * 3, 1.3, light(bc) ? '#F783AC' : '#fff', ' opacity=".85"'));
      if (kind === 'skirt') s.push(rect(cx - sw, sTop, sw * 2, 3.5, shade(bc, -25), 1.5));
      if (kind === 'dress') {
        if (id === 'pinafore') {
          s.push(rect(cx - hw * 0.62, tTop + d.T * 0.3, hw * 1.24, d.T * 0.7 - 6, bc, 3));
          s.push('<path d="M' + f(cx - hw * 0.55) + ' ' + f(tTop + d.T * 0.32) + ' L' + f(cx - hw * 0.62) + ' ' + f(tTop + 1) + ' M' + f(cx + hw * 0.55) + ' ' + f(tTop + d.T * 0.32) + ' L' + f(cx + hw * 0.62) + ' ' + f(tTop + 1) + '" stroke="' + bc + '" stroke-width="3.2" stroke-linecap="round"/>');
          s.push(circ(cx - hw * 0.4, tTop + d.T * 0.4, 1.4, '#fff') + circ(cx + hw * 0.4, tTop + d.T * 0.4, 1.4, '#fff'));
        } else {
          s.push(rect(cx - hipW / 2 + 1, tBot - 9, hipW - 2, 3, shade(bc, -30), 1.5));
          if (id === 'sundress') s.push(path(torsoPath(cx, tTop - 0.5, tTop + 7, d.W + 1, sh), skin) + '<path d="M' + f(cx - hw * 0.5) + ' ' + f(tTop + 7) + ' L' + f(cx - hw * 0.55) + ' ' + f(tTop) + ' M' + f(cx + hw * 0.5) + ' ' + f(tTop + 7) + ' L' + f(cx + hw * 0.55) + ' ' + f(tTop) + '" stroke="' + bc + '" stroke-width="2.4" stroke-linecap="round"/>');
          if (id === 'teadress') s.push(path('M' + f(cx - 7) + ' ' + f(tTop) + ' L' + f(cx) + ' ' + f(tTop + 7) + ' L' + f(cx + 7) + ' ' + f(tTop) + ' L' + f(cx + 3) + ' ' + f(tTop + 1) + ' L' + f(cx) + ' ' + f(tTop + 4) + ' L' + f(cx - 3) + ' ' + f(tTop + 1) + ' Z', '#fff'));
          if (id === 'party') s.push(circ(cx, tBot - 7.5, 3, '#FFD43B') + circ(cx - 3, tBot - 7.5, 2.2, '#FFE066') + circ(cx + 3, tBot - 7.5, 2.2, '#FFE066'));
        }
      }
    }
    if (kind === 'dungarees') {
      var bibT = tTop + d.T * 0.38;
      s.push(rect(cx - hw * 0.55, bibT, hw * 1.1, tBot - bibT, bc, 2));
      s.push(rect(cx - hw * 0.28, bibT + 3, hw * 0.56, 6, shade(bc, -20), 1.5));
      s.push('<path d="M' + f(cx - hw * 0.48) + ' ' + f(bibT + 1) + ' L' + f(cx - hw * 0.62) + ' ' + f(tTop + 1) + ' M' + f(cx + hw * 0.48) + ' ' + f(bibT + 1) + ' L' + f(cx + hw * 0.62) + ' ' + f(tTop + 1) + '" stroke="' + bc + '" stroke-width="3" stroke-linecap="round"/>');
      s.push(circ(cx - hw * 0.42, bibT + 2, 1.5, '#FFD43B') + circ(cx + hw * 0.42, bibT + 2, 1.5, '#FFD43B'));
    }

    /* arms with sleeves */
    var sleeves = (kind === 'onesie') ? (of.bottom === 'jumpsuit' ? 'long' : 'short') : tOver ? (of.bottom === 'sundress' ? 'none' : of.bottom === 'party' ? 'puff' : 'short') : (top.sleeves || 'short');
    var sleeveC = tOver || kind === 'onesie' ? bc : tc;
    [-1, 1].forEach(function (side) {
      var sx = cx + side * (hw - 1), ang = side * (group === 'baby' ? 22 : 10);
      var g = '<g transform="rotate(' + ang + ' ' + f(sx) + ' ' + f(armTopY + 2) + ')">';
      var ax = side < 0 ? sx - d.armW + 1 : sx - 1;
      g += rect(ax, armTopY, d.armW, armLen, skin, d.armW / 2);
      if (sleeves === 'long') g += rect(ax - 0.4, armTopY, d.armW + 0.8, armLen - 3, sleeveC, d.armW / 2) + rect(ax - 0.4, armTopY + armLen - 6, d.armW + 0.8, 3, shade(sleeveC, -25), 1.5);
      else if (sleeves === 'short') g += rect(ax - 0.6, armTopY, d.armW + 1.2, armLen * 0.38, sleeveC, d.armW / 2.2);
      else if (sleeves === 'puff') g += circ(ax + d.armW / 2, armTopY + 3, d.armW * 0.75, sleeveC);
      g += circ(ax + d.armW / 2, armTopY + armLen, d.armW * 0.58, skin);
      g += '</g>';
      s.push(g);
    });

    /* neck & extras around the neck */
    s.push(rect(cx - 4.5, cy + r - 4, 9, tTop - (cy + r) + 6, skinD, 3));
    extraSvg(s, of.extra, xc, cx, tTop, tBot, d, hw, armTopY, armLen, legBot, group);

    headFront(s, look, group, cx, cy, r, hairC, mood, age);
  }

  function topDetails(s, id, c, cx, top, bot, d, sh) {
    var hw = d.W / 2, dark = shade(c, -28), lite = light(c) ? shade(c, -50) : '#ffffff';
    if (id === 'stripes') for (var y = top + 9; y < bot - 3; y += 6) s.push(rect(cx - hw + 2, y, d.W - 4, 2.6, lite, 1, ' opacity=".7"'));
    if (id === 'hoodie') {
      s.push(path('M' + f(cx - 10) + ' ' + f(top + 1) + ' Q' + f(cx) + ' ' + f(top + 12) + ' ' + f(cx + 10) + ' ' + f(top + 1) + ' L' + f(cx + 8) + ' ' + f(top - 1) + ' Q' + f(cx) + ' ' + f(top + 7) + ' ' + f(cx - 8) + ' ' + f(top - 1) + ' Z', dark));
      s.push(rect(cx - hw * 0.5, bot - d.T * 0.38, hw, d.T * 0.26, dark, 4));
      s.push('<path d="M' + f(cx - 3) + ' ' + f(top + 7) + ' v8 M' + f(cx + 3) + ' ' + f(top + 7) + ' v8" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>');
    }
    if (id === 'jumper' || id === 'rainbow' || id === 'knit' || id === 'school') s.push(rect(cx - d.W * 0.46, bot - 4, d.W * 0.92, 4, dark, 1.5));
    if (id === 'school') {
      s.push(path('M' + f(cx - 7) + ' ' + f(top) + ' L' + f(cx) + ' ' + f(top + 9) + ' L' + f(cx + 7) + ' ' + f(top) + ' Z', '#fff'));
      s.push(circ(cx + hw * 0.45, top + d.T * 0.35, 3.2, '#FFD43B') + circ(cx + hw * 0.45, top + d.T * 0.35, 1.6, dark));
    }
    if (id === 'rainbow') ['#FF6B6B', '#FFD43B', '#69DB7C', '#4DABF7'].forEach(function (col, i) { s.push('<path d="M' + f(cx - 9 + i * 1.8) + ' ' + f(top + d.T * 0.62) + ' A' + f(9 - i * 1.8) + ' ' + f(9 - i * 1.8) + ' 0 0 1 ' + f(cx + 9 - i * 1.8) + ' ' + f(top + d.T * 0.62) + '" stroke="' + col + '" stroke-width="1.8" fill="none"/>'); });
    if (id === 'knit') { var zz = 'M' + f(cx - hw + 3) + ' ' + f(top + d.T * 0.45); for (var k = 0; k < 8; k++) zz += ' l' + f((d.W - 6) / 8 / 2) + ' -3 l' + f((d.W - 6) / 8 / 2) + ' 3'; s.push('<path d="' + zz + '" stroke="#fff" stroke-width="1.5" fill="none"/>'); s.push(rect(cx - hw + 3, top + d.T * 0.55, d.W - 6, 1.5, '#fff', 0, ' opacity=".7"')); }
    if (id === 'shirt' || id === 'polo') {
      s.push(path('M' + f(cx - 7) + ' ' + f(top - 0.5) + ' L' + f(cx - 1) + ' ' + f(top + 6) + ' L' + f(cx - 2) + ' ' + f(top) + ' Z M' + f(cx + 7) + ' ' + f(top - 0.5) + ' L' + f(cx + 1) + ' ' + f(top + 6) + ' L' + f(cx + 2) + ' ' + f(top) + ' Z', light(c) ? '#e9ecef' : shade(c, 40)));
      var nb = id === 'polo' ? 2 : 5;
      for (var b = 0; b < nb; b++) s.push(circ(cx, top + 8 + b * ((d.T - 12) / 5), 0.95, dark));
    }
    if (id === 'blouse') for (var q = -2; q <= 2; q++) s.push(circ(cx + q * 3, top + 1.5 + Math.abs(q) * 0.3, 2, '#fff'));
    if (id === 'denim' || id === 'blazer' || id === 'cardigan') {
      var inner = id === 'cardigan' ? '#fff' : (id === 'denim' ? '#ffffff' : '#f1f3f5');
      s.push(path('M' + f(cx - 5) + ' ' + f(top) + ' L' + f(cx + 5) + ' ' + f(top) + ' L' + f(cx + 3) + ' ' + f(bot) + ' L' + f(cx - 3) + ' ' + f(bot) + ' Z', inner));
      s.push('<path d="M' + f(cx - 3) + ' ' + f(top + 1) + ' L' + f(cx - 3) + ' ' + f(bot) + ' M' + f(cx + 3) + ' ' + f(top + 1) + ' L' + f(cx + 3) + ' ' + f(bot) + '" stroke="' + dark + '" stroke-width="1.2"/>');
      if (id === 'blazer') s.push(path('M' + f(cx - 5) + ' ' + f(top) + ' L' + f(cx - 9) + ' ' + f(top + 6) + ' L' + f(cx - 3) + ' ' + f(top + d.T * 0.5) + ' Z M' + f(cx + 5) + ' ' + f(top) + ' L' + f(cx + 9) + ' ' + f(top + 6) + ' L' + f(cx + 3) + ' ' + f(top + d.T * 0.5) + ' Z', dark));
      if (id === 'denim') s.push(rect(cx - hw + 4, top + 7, 7, 5, dark, 1) + rect(cx + hw - 11, top + 7, 7, 5, dark, 1));
      if (id === 'cardigan') for (var cb = 0; cb < 4; cb++) s.push(circ(cx - 4.5, top + 7 + cb * ((d.T - 10) / 4), 1, dark));
    }
    if (id === 'vest') s.push(path('M' + f(cx - hw - 1) + ' ' + f(top - 1) + ' L' + f(cx - hw * 0.5) + ' ' + f(top - 1) + ' Q' + f(cx - hw * 0.62) + ' ' + f(top + 8) + ' ' + f(cx - hw - 1) + ' ' + f(top + 10) + ' Z M' + f(cx + hw + 1) + ' ' + f(top - 1) + ' L' + f(cx + hw * 0.5) + ' ' + f(top - 1) + ' Q' + f(cx + hw * 0.62) + ' ' + f(top + 8) + ' ' + f(cx + hw + 1) + ' ' + f(top + 10) + ' Z', 'transparent'));
    if (id === 'sports') {
      s.push('<text x="' + f(cx) + '" y="' + f(top + d.T * 0.68) + '" font-size="' + f(d.T * 0.38) + '" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" fill="' + lite + '">7</text>');
      s.push(rect(cx - hw + 1, top + 4, 2.5, d.T - 8, lite, 1) + rect(cx + hw - 3.5, top + 4, 2.5, d.T - 8, lite, 1));
    }
    if (id === 'dino') { var dz = 'M' + f(cx - 8) + ' ' + f(top + d.T * 0.6); for (var dn = 0; dn < 4; dn++) dz += ' l2 -4 l2 4'; s.push(path(dz + ' Z', light(c) ? '#40C057' : '#fff')); s.push(circ(cx + 7, top + d.T * 0.5, 1, light(c) ? '#40C057' : '#fff')); }
    if (id === 'bunny') { s.push(circ(cx, top + d.T * 0.58, 4.2, '#fff') + '<ellipse cx="' + f(cx - 2.2) + '" cy="' + f(top + d.T * 0.58 - 6) + '" rx="1.4" ry="3.5" fill="#fff"/><ellipse cx="' + f(cx + 2.2) + '" cy="' + f(top + d.T * 0.58 - 6) + '" rx="1.4" ry="3.5" fill="#fff"/>' + circ(cx, top + d.T * 0.58 + 0.5, 0.9, '#F783AC')); }
    if (id === 'bodysuit') for (var bs = 0; bs < 3; bs++) s.push(circ(cx - 4 + bs * 4, bot - 3, 0.9, dark));
  }

  function shoeSvg(s, id, c, skin, lx, rx, legBot, d) {
    var w = d.legW, h = d.shoeH;
    [lx, rx].forEach(function (x, i) {
      var out = i === 0 ? -1 : 1, x0 = x - 1 + (out < 0 ? -1.5 : 0), sw = w + 3.5;
      var dark = shade(c, -35);
      if (id === 'barefoot') { s.push(rect(x - 0.5, legBot - 1, w + 1 + (out > 0 ? 1.5 : 0), h - 0.5, skin, h / 2)); return; }
      if (id === 'sandals') {
        s.push(rect(x - 0.5, legBot - 1, w + 1.5, h - 1, skin, h / 2) + rect(x0, legBot + h - 2.5, sw, 2.5, shade(c, -20), 1.2));
        s.push(rect(x - 0.5, legBot + 0.5, w + 1, 1.6, c) + rect(x - 0.5, legBot + 3, w + 1, 1.6, c));
        return;
      }
      if (id === 'wellies' || id === 'boots' || id === 'hightops') {
        var up = id === 'wellies' ? 14 : id === 'boots' ? 9 : 6;
        s.push(rect(x - 0.6, legBot - up, w + 1.2, up + 1, c, 2));
        s.push(rect(x0, legBot - 1, sw, h, c, h / 2.2));
        s.push(rect(x0, legBot + h - 2.4, sw, 2.4, id === 'hightops' ? '#fff' : dark, 1.2));
        if (id === 'wellies') s.push(rect(x + 1.5, legBot - up + 2, 1.6, up - 2, '#fff', 0.8, ' opacity=".45"'));
        if (id === 'boots' || id === 'hightops') s.push('<path d="M' + f(x + 2) + ' ' + f(legBot - up + 3) + ' h' + f(w - 4) + ' M' + f(x + 2) + ' ' + f(legBot - up + 6) + ' h' + f(w - 4) + '" stroke="' + (id === 'hightops' ? '#fff' : shade(c, 50)) + '" stroke-width=".9"/>');
        if (id === 'hightops') s.push(circ(x + w / 2, legBot - up + 1.5, 1.6, '#fff'));
        return;
      }
      if (id === 'socks' || id === 'booties') {
        s.push(rect(x - 0.6, legBot - 5, w + 1.2, h + 4, c, h / 1.6));
        if (id === 'socks') s.push(rect(x - 0.6, legBot - 5, w + 1.2, 1.8, '#fff', 0.8) + rect(x - 0.6, legBot - 1.5, w + 1.2, 1.4, '#fff', 0.7, ' opacity=".7"'));
        else s.push(path('M' + f(x + w / 2) + ' ' + f(legBot + 2.8) + ' l-1.6 -1.6 a1 1 0 0 1 1.6 -1 a1 1 0 0 1 1.6 1 Z', '#F783AC'));
        return;
      }
      if (id === 'slippers') {
        s.push(rect(x0 - 0.5, legBot - 2, sw + 1, h + 1.5, c, h / 1.5));
        s.push(rect(x0 - 0.5, legBot - 2.5, sw + 1, 2.8, '#fff', 1.4));
        s.push(circ(x + w / 2, legBot - 2.5, 2, '#fff'));
        return;
      }
      var shoeC = id === 'gold' ? '#FCC419' : c;
      s.push(rect(x0, legBot - 1, sw, h, shoeC, h / 2.2));
      if (id === 'trainers' || id === 'lightup' || id === 'velcro' || id === 'gold') {
        s.push(rect(x0, legBot + h - 2.6, sw, 2.6, id === 'gold' ? '#F08C00' : '#fff', 1.3));
        if (id === 'velcro') s.push(rect(x, legBot + 0.3, w, 1.8, shade(shoeC, 40), 0.9));
        else s.push('<path d="M' + f(x + 2) + ' ' + f(legBot + 0.8) + ' h' + f(w - 4) + '" stroke="' + (light(shoeC) ? '#868E96' : '#fff') + '" stroke-width="1"/>');
        if (id === 'lightup') ['#FF6B6B', '#69DB7C', '#4DABF7'].forEach(function (lc, k) {
          s.push('<circle cx="' + f(x0 + 2.5 + k * (sw - 5) / 2) + '" cy="' + f(legBot + h - 1.3) + '" r="1" fill="' + lc + '"><animate attributeName="opacity" values="1;.2;1" dur="' + (0.8 + k * 0.25) + 's" repeatCount="indefinite"/></circle>');
        });
        if (id === 'gold') s.push('<path d="M' + f(x + w / 2) + ' ' + f(legBot - 3) + ' l.8 1.8 1.8 .8 -1.8 .8 -.8 1.8 -.8 -1.8 -1.8 -.8 1.8 -.8 Z" fill="#FFF3BF"/>');
      } else if (id === 'schoolshoes' || id === 'smart' || id === 'comfy') {
        s.push(rect(x0, legBot + h - 2, sw, 2, shade(shoeC, -40), 1) + rect(x0 + 2, legBot + 0.5, 3, 1.4, '#fff', 0.7, ' opacity=".5"'));
        if (id === 'comfy') s.push(rect(x, legBot + 0.5, w, 1.8, shade(shoeC, 30), 0.9));
      } else if (id === 'flats' || id === 'heels') {
        s.push(rect(x - 0.3, legBot - 1.5, w + 0.6, 2.2, skin, 1));
        s.push(circ(x + w / 2, legBot + 1, 1.6, shade(shoeC, 40)));
        if (id === 'heels') s.push(rect(x + w / 2 - 1, legBot + h - 1, 2, 2, shade(shoeC, -30)));
      }
    });
  }

  function extraSvg(s, id, c, cx, top, bot, d, hw, armTopY, armLen, legBot, group) {
    if (id === 'scarf') {
      s.push(rect(cx - 9, top - 3, 18, 6, c, 3) + rect(cx + 2, top + 1, 5.5, d.T * 0.45, c, 2));
      s.push('<path d="M' + f(cx + 2.5) + ' ' + f(top + d.T * 0.45) + ' v2 M' + f(cx + 4.5) + ' ' + f(top + d.T * 0.45) + ' v2 M' + f(cx + 6.5) + ' ' + f(top + d.T * 0.45) + ' v2" stroke="' + c + '" stroke-width="1"/>');
    }
    if (id === 'bib') s.push(path('M' + f(cx - 8) + ' ' + f(top) + ' Q' + f(cx - 9) + ' ' + f(top + 14) + ' ' + f(cx) + ' ' + f(top + 15) + ' Q' + f(cx + 9) + ' ' + f(top + 14) + ' ' + f(cx + 8) + ' ' + f(top) + ' Z', '#fff') + circ(cx, top + 8, 2.5, c));
    if (id === 'tie') s.push(path('M' + f(cx - 2) + ' ' + f(top + 1) + ' L' + f(cx + 2) + ' ' + f(top + 1) + ' L' + f(cx + 3) + ' ' + f(top + d.T * 0.62) + ' L' + f(cx) + ' ' + f(top + d.T * 0.7) + ' L' + f(cx - 3) + ' ' + f(top + d.T * 0.62) + ' Z', c) + rect(cx - 2.5, top, 5, 3.2, shade(c, -25), 1));
    if (id === 'bowtie') s.push(path('M' + f(cx) + ' ' + f(top + 2) + ' l-6 -3.5 v7 z M' + f(cx) + ' ' + f(top + 2) + ' l6 -3.5 v7 z', c) + circ(cx, top + 2, 1.6, shade(c, -30)));
    if (id === 'necklace') for (var n = -3; n <= 3; n++) s.push(circ(cx + n * 2.2, top + 2 + (9 - n * n) * 0.45, 1.25, '#fff', ' stroke="#ddd" stroke-width=".3"'));
    if (id === 'backpack') s.push('<path d="M' + f(cx - hw * 0.62) + ' ' + f(top + 1) + ' V' + f(bot - 6) + ' M' + f(cx + hw * 0.62) + ' ' + f(top + 1) + ' V' + f(bot - 6) + '" stroke="' + c + '" stroke-width="3.2" stroke-linecap="round"/>');
    if (id === 'bag') { s.push('<path d="M' + f(cx - hw * 0.6) + ' ' + f(top + 1) + ' L' + f(cx + hw + 3) + ' ' + f(bot - 2) + '" stroke="' + shade(c, -30) + '" stroke-width="1.6"/>'); s.push(rect(cx + hw - 1, bot - 4, 10, 8, c, 2) + rect(cx + hw + 3, bot - 2, 2, 2, '#FFD43B', 0.5)); }
    if (id === 'teddy') { var tx = cx + hw + 4, ty = armTopY + armLen - 2, tr = group === 'baby' ? 4.5 : 5; s.push(circ(tx - tr * 0.7, ty - tr * 0.9, tr * 0.38, '#B07945') + circ(tx + tr * 0.7, ty - tr * 0.9, tr * 0.38, '#B07945') + circ(tx, ty, tr, '#C8915A') + circ(tx, ty + 0.8, tr * 0.42, '#F1D3B3') + circ(tx - 1.6, ty - 1, 0.7, '#222') + circ(tx + 1.6, ty - 1, 0.7, '#222')); }
    if (id === 'stick') { var sx = cx + hw + 6; s.push('<path d="M' + f(sx) + ' ' + f(armTopY + armLen - 1) + ' V' + f(legBot + 7) + '" stroke="#8D5A36" stroke-width="2.2" stroke-linecap="round"/><path d="M' + f(sx) + ' ' + f(armTopY + armLen - 1) + ' q0 -4 -4 -4" stroke="#8D5A36" stroke-width="2.2" fill="none" stroke-linecap="round"/>'); }
    if (id === 'cape') s.push(path('M' + f(cx - 7) + ' ' + f(top + 0.5) + ' Q' + f(cx) + ' ' + f(top + 4) + ' ' + f(cx + 7) + ' ' + f(top + 0.5), 'none', ' stroke="#C92A2A" stroke-width="2"') + circ(cx, top + 3, 2, '#FFD43B'));
  }

  /* ===================== Portrait (head & shoulders) ===================== */
  function bust(s, look, group, age, mood) {
    var G = BAL.Game;
    var of = G.outfitFor(look, group);
    var b = G.piece('bottom', of.bottom);
    var outfit = (b.kind === 'dress' || b.kind === 'onesie') ? of.bottomColor : of.topColor;
    var skin = look.skin || '#F6C9A0';
    var hairC = hairColour(look, group, age);
    var cx = 50, cy, r, bodyTop, bodyW;
    if (group === 'baby') { cy = 50; r = 25; bodyTop = 72; bodyW = 40; }
    else if (group === 'toddler') { cy = 48; r = 24; bodyTop = 70; bodyW = 44; }
    else if (group === 'child') { cy = 45; r = 23; bodyTop = 68; bodyW = 46; }
    else if (group === 'teen') { cy = 41; r = 21; bodyTop = 63; bodyW = 52; }
    else { cy = 40; r = 20.5; bodyTop = 61; bodyW = 58; }
    headBack(s, look, group, cx, cy, r, hairC);
    s.push(rect(cx - 5, cy + r - 5, 10, bodyTop - cy - r + 8, shade(skin, -12), 3));
    var bw = bodyW / 2;
    s.push(path('M' + f(cx - bw) + ' 104 L' + f(cx - bw) + ' ' + f(bodyTop + 14) + ' Q' + f(cx - bw) + ' ' + f(bodyTop) + ' ' + f(cx - bw + 14) + ' ' + f(bodyTop) + ' L' + f(cx + bw - 14) + ' ' + f(bodyTop) + ' Q' + f(cx + bw) + ' ' + f(bodyTop) + ' ' + f(cx + bw) + ' ' + f(bodyTop + 14) + ' L' + f(cx + bw) + ' 104 Z', outfit));
    s.push(path('M' + f(cx - 8) + ' ' + f(bodyTop) + ' Q' + f(cx) + ' ' + f(bodyTop + 10) + ' ' + f(cx + 8) + ' ' + f(bodyTop), shade(skin, -12)));
    if (of.top === 'shirt' || of.top === 'polo' || of.top === 'blazer') s.push('<path d="M' + f(cx - 10) + ' ' + f(bodyTop) + ' L' + f(cx) + ' ' + f(bodyTop + 9) + ' L' + f(cx + 10) + ' ' + f(bodyTop) + '" stroke="' + shade(outfit, 40) + '" stroke-width="2.5" fill="none" stroke-linejoin="round"/>');
    if (of.top === 'stripes' && b.kind !== 'dress' && b.kind !== 'onesie') for (var y = bodyTop + 8; y < 100; y += 7) s.push(rect(cx - bw + 3, y, bodyW - 6, 3, '#fff', 1.5, ' opacity=".6"'));
    if (of.extra === 'scarf') s.push(rect(cx - 12, bodyTop - 3, 24, 7, of.extraColor, 3.5));
    if (of.extra === 'bowtie') s.push(path('M' + f(cx) + ' ' + f(bodyTop + 3) + ' l-7 -4 v8 z M' + f(cx) + ' ' + f(bodyTop + 3) + ' l7 -4 v8 z', of.extraColor));
    headFront(s, look, group, cx, cy, r, hairC, mood, age);
  }

  BAL.avatar = function (look, age, mood, opts) {
    opts = opts || {};
    look = look || {};
    age = age || 0;
    if (mood === undefined) mood = 70;
    var group = BAL.Game.ageGroup(age);
    var s = [];
    var full = !!opts.full;
    if (opts.bg && !full) s.push(circ(50, 50, 50, opts.bg));
    if (full) fullBody(s, look, group, age, mood); else bust(s, look, group, age, mood);
    var cls = opts.cls ? ' class="' + opts.cls + '"' : '';
    var label = opts.label ? ' role="img" aria-label="' + String(opts.label).replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"';
    var vb = full ? '0 0 100 150' : '0 0 100 100';
    if (opts.bg && !full) {
      clipN += 1;
      var cid = 'avc' + clipN;
      return '<svg viewBox="' + vb + '"' + cls + label + ' xmlns="http://www.w3.org/2000/svg"><clipPath id="' + cid + '"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#' + cid + ')">' + s.join('') + '</g></svg>';
    }
    return '<svg viewBox="' + vb + '"' + cls + label + ' xmlns="http://www.w3.org/2000/svg"' + (full ? ' overflow="visible"' : '') + '>' + s.join('') + '</svg>';
  };
})(globalThis.BAL = globalThis.BAL || {});
