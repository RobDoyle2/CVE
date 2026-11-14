/* Build a Life — player profiles saved on this device (localStorage), plus tiny sound effects. */
(function (BAL) {
  'use strict';
  var KEY = 'buildALife.v1';
  var memory = null; // fallback when storage is unavailable (private mode etc.)

  var Store = BAL.Store = {
    data: { profiles: [], activeId: null, sound: true },
    load: function () {
      var raw = null;
      try { raw = globalThis.localStorage ? localStorage.getItem(KEY) : memory; } catch (e) { raw = memory; }
      if (raw) {
        try {
          var d = JSON.parse(raw);
          if (d && Array.isArray(d.profiles)) Store.data = Store.migrate(Object.assign({ profiles: [], activeId: null, sound: true }, d));
        } catch (e) { /* corrupted save: start fresh */ }
      }
      return Store.data;
    },
    save: function () {
      var raw = JSON.stringify(Store.data);
      memory = raw;
      try { if (globalThis.localStorage) localStorage.setItem(KEY, raw); } catch (e) { /* storage full or blocked */ }
    },
    // Upgrades older saves: one life per player becomes a list of characters, and looks gain outfits.
    migrate: function (d) {
      d.profiles.forEach(function (p) {
        if (!Array.isArray(p.chars)) {
          p.chars = p.life ? [p.life] : [];
          p.activeCharId = p.life ? p.life.id : null;
          delete p.life;
        }
        if (!Array.isArray(p.hall)) p.hall = [];
        p.chars.forEach(function (l) {
          if (l.gender === 'any' || !l.gender) l.gender = 'me';
          if (!l.pronouns) l.pronouns = l.gender === 'girl' ? 'she' : l.gender === 'boy' ? 'he' : 'they';
          if (!Array.isArray(l.unlocked)) l.unlocked = [];
          if (BAL.Game) l.look = BAL.Game.normalizeLook(l.look);
          if (BAL.Game && BAL.Game.ensureGoals) BAL.Game.ensureGoals(l);
        });
      });
      return d;
    },
    activeChar: function (p) {
      p = p || Store.active();
      if (!p) return null;
      return p.chars.find(function (c) { return c.id === p.activeCharId; }) || null;
    },
    addChar: function (life, p) {
      p = p || Store.active();
      p.chars.push(life);
      p.activeCharId = life.id;
      Store.save();
      return life;
    },
    replaceChar: function (oldId, life, p) {
      p = p || Store.active();
      var i = p.chars.findIndex(function (c) { return c.id === oldId; });
      if (i < 0) p.chars.push(life); else p.chars[i] = life;
      p.activeCharId = life.id;
      Store.save();
    },
    removeChar: function (id, p) {
      p = p || Store.active();
      p.chars = p.chars.filter(function (c) { return c.id !== id; });
      if (p.activeCharId === id) p.activeCharId = null;
      Store.save();
    },
    profile: function (id) { return Store.data.profiles.find(function (p) { return p.id === id; }) || null; },
    active: function () { return Store.profile(Store.data.activeId); },
    addProfile: function (name, emoji, color) {
      var p = { id: BAL.Game.uid(), name: name.trim().slice(0, 16) || 'Player', emoji: emoji || '🦄', color: color || '#9775FA', created: Date.now(), chars: [], activeCharId: null, hall: [] };
      Store.data.profiles.push(p);
      Store.save();
      return p;
    },
    removeProfile: function (id) {
      Store.data.profiles = Store.data.profiles.filter(function (p) { return p.id !== id; });
      if (Store.data.activeId === id) Store.data.activeId = null;
      Store.save();
    }
  };

  /* ---------- Sound (tiny synth, no audio files) ---------- */
  var ctx = null;
  function tone(freq, start, dur, type, vol) {
    try {
      if (!ctx) { var AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return; ctx = new AC(); }
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      var t = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* audio not available */ }
  }
  var SONGS = {
    click: [[660, 0, 0.08, 'triangle', 0.06]],
    good: [[523, 0, 0.12, 'triangle'], [784, 0.08, 0.18, 'triangle']],
    bad: [[330, 0, 0.15, 'sine'], [262, 0.12, 0.22, 'sine']],
    coin: [[988, 0, 0.08, 'square', 0.05], [1319, 0.07, 0.2, 'square', 0.05]],
    tada: [[523, 0, 0.12, 'triangle'], [659, 0.1, 0.12, 'triangle'], [784, 0.2, 0.12, 'triangle'], [1047, 0.3, 0.4, 'triangle']],
    birthday: [[392, 0, 0.18], [392, 0.2, 0.12], [440, 0.34, 0.3], [392, 0.66, 0.3], [523, 0.98, 0.3], [494, 1.3, 0.5]],
    sticker: [[784, 0, 0.1, 'triangle'], [988, 0.09, 0.1, 'triangle'], [1175, 0.18, 0.1, 'triangle'], [1568, 0.27, 0.35, 'triangle']]
  };
  BAL.sound = function (name) {
    if (!Store.data.sound) return;
    (SONGS[name] || []).forEach(function (n) { tone(n[0], n[1], n[2], n[3], n[4]); });
  };
})(globalThis.BAL = globalThis.BAL || {});
