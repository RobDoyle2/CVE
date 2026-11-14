/* Build a Life — cute SVG avatars that grow up with you. */
(function (BAL) {
  'use strict';

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  var clipN = 0;

  /* look: {skin, hair, hairColor, eyes, outfit, accessory}; age: number; mood: 0-100 */
  BAL.avatar = function (look, age, mood, opts) {
    opts = opts || {};
    look = look || {};
    var skin = look.skin || '#F6C9A0';
    var hairC = look.hairColor || '#5A3825';
    var outfit = look.outfit || '#4DABF7';
    var eyes = look.eyes || '#3B2314';
    var stage = BAL.Game ? BAL.Game.stage(age || 0) : 'child';
    if (stage === 'elder') hairC = age > 75 ? '#ECECEC' : '#C9C9C9';
    if (mood === undefined) mood = 70;

    var cx = 50, cy, r, bodyTop, bodyW;
    if (stage === 'baby') { cy = 50; r = 25; bodyTop = 72; bodyW = 40; }
    else if (stage === 'child') { cy = 45; r = 23; bodyTop = 68; bodyW = 46; }
    else if (stage === 'teen') { cy = 41; r = 21; bodyTop = 63; bodyW = 52; }
    else { cy = 40; r = 20.5; bodyTop = 61; bodyW = 58; }

    var s = [];
    var bg = opts.bg;
    if (bg) s.push('<circle cx="50" cy="50" r="50" fill="' + bg + '"/>');

    /* --- hair behind head --- */
    var st = look.hair || 'short';
    if (stage !== 'baby') {
      if (st === 'long') s.push('<path d="M' + (cx - r - 3) + ' ' + (cy - 4) + ' Q' + (cx - r - 6) + ' ' + (cy + r + 14) + ' ' + (cx - r + 6) + ' ' + (cy + r + 16) + ' L' + (cx + r - 6) + ' ' + (cy + r + 16) + ' Q' + (cx + r + 6) + ' ' + (cy + r + 14) + ' ' + (cx + r + 3) + ' ' + (cy - 4) + ' Z" fill="' + hairC + '"/>');
      if (st === 'afro') s.push('<circle cx="' + cx + '" cy="' + (cy - 3) + '" r="' + (r * 1.42) + '" fill="' + hairC + '"/>');
      if (st === 'curly') { for (var i = 0; i < 9; i++) { var a = Math.PI + (i / 8) * Math.PI; s.push('<circle cx="' + (cx + Math.cos(a) * (r + 1)) + '" cy="' + (cy + Math.sin(a) * (r + 1) + 2) + '" r="' + (r * 0.36) + '" fill="' + hairC + '"/>'); } s.push('<circle cx="' + (cx - r) + '" cy="' + (cy + 8) + '" r="' + (r * 0.3) + '" fill="' + hairC + '"/><circle cx="' + (cx + r) + '" cy="' + (cy + 8) + '" r="' + (r * 0.3) + '" fill="' + hairC + '"/>'); }
      if (st === 'ponytail') s.push('<ellipse cx="' + (cx + r + 3) + '" cy="' + (cy + 6) + '" rx="' + (r * 0.32) + '" ry="' + (r * 0.75) + '" fill="' + hairC + '" transform="rotate(-18 ' + (cx + r + 3) + ' ' + (cy + 6) + ')"/>');
      if (st === 'pigtails') s.push('<circle cx="' + (cx - r - 4) + '" cy="' + (cy + 2) + '" r="' + (r * 0.42) + '" fill="' + hairC + '"/><circle cx="' + (cx + r + 4) + '" cy="' + (cy + 2) + '" r="' + (r * 0.42) + '" fill="' + hairC + '"/>');
      if (st === 'bun') s.push('<circle cx="' + cx + '" cy="' + (cy - r - 4) + '" r="' + (r * 0.42) + '" fill="' + hairC + '"/>');
    }

    /* --- body --- */
    var neckW = stage === 'baby' ? 8 : 10;
    s.push('<rect x="' + (cx - neckW / 2) + '" y="' + (cy + r - 5) + '" width="' + neckW + '" height="' + (bodyTop - cy - r + 8) + '" rx="3" fill="' + shade(skin, -12) + '"/>');
    if (stage === 'baby') {
      s.push('<ellipse cx="' + cx + '" cy="' + (bodyTop + 18) + '" rx="' + (bodyW / 2) + '" ry="22" fill="' + outfit + '"/>');
      s.push('<circle cx="' + (cx - 7) + '" cy="' + (bodyTop + 12) + '" r="2" fill="#fff" opacity=".8"/><circle cx="' + (cx + 7) + '" cy="' + (bodyTop + 12) + '" r="2" fill="#fff" opacity=".8"/>');
    } else {
      var bw = bodyW / 2;
      s.push('<path d="M' + (cx - bw) + ' 104 L' + (cx - bw) + ' ' + (bodyTop + 14) + ' Q' + (cx - bw) + ' ' + bodyTop + ' ' + (cx - bw + 14) + ' ' + bodyTop + ' L' + (cx + bw - 14) + ' ' + bodyTop + ' Q' + (cx + bw) + ' ' + bodyTop + ' ' + (cx + bw) + ' ' + (bodyTop + 14) + ' L' + (cx + bw) + ' 104 Z" fill="' + outfit + '"/>');
      s.push('<path d="M' + (cx - 8) + ' ' + bodyTop + ' Q' + cx + ' ' + (bodyTop + 10) + ' ' + (cx + 8) + ' ' + bodyTop + '" fill="' + shade(skin, -12) + '"/>');
      if (stage === 'adult' || stage === 'elder') s.push('<path d="M' + (cx - 10) + ' ' + bodyTop + ' L' + cx + ' ' + (bodyTop + 9) + ' L' + (cx + 10) + ' ' + bodyTop + '" stroke="' + shade(outfit, 40) + '" stroke-width="2.5" fill="none" stroke-linejoin="round"/>');
      else s.push('<circle cx="' + cx + '" cy="' + (bodyTop + 20) + '" r="5" fill="' + shade(outfit, 45) + '"/><path d="M' + (cx - 2.5) + ' ' + (bodyTop + 19) + ' l2.5 2.5 l2.5 -2.5" stroke="' + outfit + '" stroke-width="1.4" fill="none"/>');
    }

    /* --- ears + head --- */
    s.push('<circle cx="' + (cx - r + 1) + '" cy="' + (cy + 2) + '" r="' + (r * 0.22) + '" fill="' + shade(skin, -8) + '"/>');
    s.push('<circle cx="' + (cx + r - 1) + '" cy="' + (cy + 2) + '" r="' + (r * 0.22) + '" fill="' + shade(skin, -8) + '"/>');
    s.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + skin + '"/>');

    /* --- face --- */
    var ey = cy + 1, ex = r * 0.38;
    var eyeR = stage === 'baby' ? 3.6 : 3.1;
    [-1, 1].forEach(function (side) {
      var x = cx + side * ex;
      s.push('<ellipse cx="' + x + '" cy="' + ey + '" rx="' + eyeR + '" ry="' + (eyeR * 1.15) + '" fill="#2b2b2b"/>');
      s.push('<ellipse cx="' + x + '" cy="' + (ey + 0.6) + '" rx="' + (eyeR * 0.62) + '" ry="' + (eyeR * 0.72) + '" fill="' + eyes + '"/>');
      s.push('<circle cx="' + (x + 1) + '" cy="' + (ey - 1.3) + '" r="' + (eyeR * 0.36) + '" fill="#fff"/>');
      if (stage === 'elder') s.push('<path d="M' + (x + side * 4.5) + ' ' + (ey - 1) + ' l' + (side * 2.5) + ' -1 M' + (x + side * 4.5) + ' ' + (ey + 1.5) + ' l' + (side * 2.5) + ' 1" stroke="' + shade(skin, -40) + '" stroke-width=".8" stroke-linecap="round"/>');
    });
    s.push('<ellipse cx="' + (cx - r * 0.58) + '" cy="' + (cy + r * 0.32) + '" rx="' + (r * 0.17) + '" ry="' + (r * 0.11) + '" fill="#FF7A9A" opacity=".45"/>');
    s.push('<ellipse cx="' + (cx + r * 0.58) + '" cy="' + (cy + r * 0.32) + '" rx="' + (r * 0.17) + '" ry="' + (r * 0.11) + '" fill="#FF7A9A" opacity=".45"/>');
    var my = cy + r * 0.45;
    if (mood >= 65) s.push('<path d="M' + (cx - 6) + ' ' + my + ' Q' + cx + ' ' + (my + 8) + ' ' + (cx + 6) + ' ' + my + ' Z" fill="#B23A48"/><path d="M' + (cx - 3.5) + ' ' + (my + 3.4) + ' Q' + cx + ' ' + (my + 6.5) + ' ' + (cx + 3.5) + ' ' + (my + 3.4) + '" fill="#FF8FA3"/>');
    else if (mood >= 35) s.push('<path d="M' + (cx - 5) + ' ' + my + ' Q' + cx + ' ' + (my + 4.5) + ' ' + (cx + 5) + ' ' + my + '" stroke="#8a2f3b" stroke-width="2" fill="none" stroke-linecap="round"/>');
    else s.push('<path d="M' + (cx - 5) + ' ' + (my + 3) + ' Q' + cx + ' ' + (my - 1.5) + ' ' + (cx + 5) + ' ' + (my + 3) + '" stroke="#8a2f3b" stroke-width="2" fill="none" stroke-linecap="round"/>');

    /* --- hair on top --- */
    if (stage === 'baby') {
      s.push('<path d="M' + (cx - 2) + ' ' + (cy - r + 2) + ' q-1 -8 6 -7 q4 1 1 5" stroke="' + hairC + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>');
    } else if (st !== 'afro') {
      var top = cy - r, fr = cy - r * 0.25;
      if (st === 'spiky') {
        var pts = [];
        for (var k = 0; k <= 8; k++) { var px = cx - r - 1 + (k * (2 * r + 2)) / 8; pts.push(px + ',' + (k % 2 ? top - 7 : top + 4)); }
        s.push('<path d="M' + (cx - r - 1) + ' ' + (cy - 2) + ' Q' + (cx - r) + ' ' + (top - 2) + ' ' + cx + ' ' + (top - 2) + ' Q' + (cx + r) + ' ' + (top - 2) + ' ' + (cx + r + 1) + ' ' + (cy - 2) + ' Q' + cx + ' ' + (fr - 6) + ' ' + (cx - r - 1) + ' ' + (cy - 2) + ' Z" fill="' + hairC + '"/>');
        s.push('<polyline points="' + pts.join(' ') + '" fill="' + hairC + '" stroke="' + hairC + '" stroke-width="2" stroke-linejoin="round"/>');
      } else if (st === 'buzz') {
        s.push('<path d="M' + (cx - r + 1) + ' ' + (cy - 5) + ' A' + (r - 1) + ' ' + (r - 1) + ' 0 0 1 ' + (cx + r - 1) + ' ' + (cy - 5) + ' Q' + cx + ' ' + (top + 3) + ' ' + (cx - r + 1) + ' ' + (cy - 5) + ' Z" fill="' + hairC + '" opacity=".8"/>');
      } else if (st === 'curly') {
        for (var m = 0; m < 7; m++) { var aa = Math.PI * 1.08 + (m / 6) * Math.PI * 0.84; s.push('<circle cx="' + (cx + Math.cos(aa) * (r * 0.78)) + '" cy="' + (cy + Math.sin(aa) * (r * 0.78)) + '" r="' + (r * 0.34) + '" fill="' + hairC + '"/>'); }
      } else {
        var sweep = st === 'short' ? cx + r * 0.2 : cx;
        s.push('<path d="M' + (cx - r - 1.5) + ' ' + (cy + 3) + ' Q' + (cx - r - 2) + ' ' + (top - 3) + ' ' + cx + ' ' + (top - 3) + ' Q' + (cx + r + 2) + ' ' + (top - 3) + ' ' + (cx + r + 1.5) + ' ' + (cy + 3) + ' Q' + (cx + r - 4) + ' ' + (fr - 2) + ' ' + sweep + ' ' + fr + ' Q' + (cx - r + 3) + ' ' + (fr - 1) + ' ' + (cx - r - 1.5) + ' ' + (cy + 3) + ' Z" fill="' + hairC + '"/>');
        s.push('<path d="M' + (cx - r * 0.5) + ' ' + (top + 3) + ' Q' + cx + ' ' + (top - 1) + ' ' + (cx + r * 0.4) + ' ' + (top + 2) + '" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none" stroke-linecap="round"/>');
      }
    } else {
      s.push('<path d="M' + (cx - r) + ' ' + (cy - 3) + ' Q' + cx + ' ' + (cy - r * 0.6) + ' ' + (cx + r) + ' ' + (cy - 3) + ' Q' + (cx + r) + ' ' + (cy - r - 4) + ' ' + cx + ' ' + (cy - r - 4) + ' Q' + (cx - r) + ' ' + (cy - r - 4) + ' ' + (cx - r) + ' ' + (cy - 3) + ' Z" fill="' + hairC + '"/>');
    }

    /* --- accessories --- */
    var acc = look.accessory || 'none';
    if (stage !== 'baby' || acc === 'bow' || acc === 'flower') {
      if (acc === 'glasses') {
        s.push('<g fill="rgba(255,255,255,.25)" stroke="#333" stroke-width="1.6"><circle cx="' + (cx - ex) + '" cy="' + ey + '" r="6"/><circle cx="' + (cx + ex) + '" cy="' + ey + '" r="6"/></g><path d="M' + (cx - ex + 6) + ' ' + ey + ' Q' + cx + ' ' + (ey - 2) + ' ' + (cx + ex - 6) + ' ' + ey + '" stroke="#333" stroke-width="1.6" fill="none"/>');
      } else if (acc === 'bow') {
        var bx = cx + r * 0.62, by = cy - r * 0.78;
        s.push('<g transform="rotate(20 ' + bx + ' ' + by + ')"><path d="M' + bx + ' ' + by + ' l-9 -6 v12 z M' + bx + ' ' + by + ' l9 -6 v12 z" fill="#FF4D8D"/><circle cx="' + bx + '" cy="' + by + '" r="2.6" fill="#D6336C"/></g>');
      } else if (acc === 'cap') {
        s.push('<path d="M' + (cx - r - 1) + ' ' + (cy - r * 0.35) + ' Q' + (cx - r) + ' ' + (cy - r - 6) + ' ' + cx + ' ' + (cy - r - 6) + ' Q' + (cx + r) + ' ' + (cy - r - 6) + ' ' + (cx + r + 1) + ' ' + (cy - r * 0.35) + ' Z" fill="' + shade(outfit, -25) + '"/><path d="M' + (cx - r - 2) + ' ' + (cy - r * 0.35) + ' L' + (cx + r + 16) + ' ' + (cy - r * 0.35) + ' Q' + (cx + r + 16) + ' ' + (cy - r * 0.35 + 5) + ' ' + (cx + r) + ' ' + (cy - r * 0.35 + 4) + ' L' + (cx - r - 2) + ' ' + (cy - r * 0.35 + 3) + ' Z" fill="' + shade(outfit, -45) + '"/><circle cx="' + cx + '" cy="' + (cy - r - 6) + '" r="2.2" fill="' + shade(outfit, 30) + '"/>');
      } else if (acc === 'flower') {
        var fx = cx - r * 0.7, fy = cy - r * 0.72;
        for (var p = 0; p < 5; p++) { var pa = p * 1.2566; s.push('<circle cx="' + (fx + Math.cos(pa) * 3.6) + '" cy="' + (fy + Math.sin(pa) * 3.6) + '" r="3" fill="#FFF3B0"/>'); }
        s.push('<circle cx="' + fx + '" cy="' + fy + '" r="2.4" fill="#FF9F1C"/>');
      } else if (acc === 'headband') {
        s.push('<path d="M' + (cx - r + 1) + ' ' + (cy - r * 0.45) + ' Q' + cx + ' ' + (cy - r * 1.32) + ' ' + (cx + r - 1) + ' ' + (cy - r * 0.45) + '" stroke="' + shade(outfit, 20) + '" stroke-width="4" fill="none" stroke-linecap="round"/>');
      } else if (acc === 'crown') {
        var ty = cy - r - 2;
        s.push('<path d="M' + (cx - 11) + ' ' + (ty + 4) + ' L' + (cx - 12) + ' ' + (ty - 9) + ' L' + (cx - 5) + ' ' + (ty - 3) + ' L' + cx + ' ' + (ty - 12) + ' L' + (cx + 5) + ' ' + (ty - 3) + ' L' + (cx + 12) + ' ' + (ty - 9) + ' L' + (cx + 11) + ' ' + (ty + 4) + ' Z" fill="#FFD43B" stroke="#F59F00" stroke-width="1.2" stroke-linejoin="round"/><circle cx="' + cx + '" cy="' + (ty - 1) + '" r="2" fill="#FF4D8D"/>');
      }
    }

    var cls = opts.cls ? ' class="' + opts.cls + '"' : '';
    var label = opts.label ? ' role="img" aria-label="' + opts.label + '"' : ' aria-hidden="true"';
    if (bg) {
      clipN += 1;
      var cid = 'avc' + clipN;
      return '<svg viewBox="0 0 100 100"' + cls + label + ' xmlns="http://www.w3.org/2000/svg"><clipPath id="' + cid + '"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#' + cid + ')">' + s.join('') + '</g></svg>';
    }
    return '<svg viewBox="0 0 100 100"' + cls + label + ' xmlns="http://www.w3.org/2000/svg">' + s.join('') + '</svg>';
  };
})(globalThis.BAL = globalThis.BAL || {});
