/* Build a Life — user interface. Renders screens with HTML strings and handles clicks
   through data-act attributes (event delegation). */
(function (BAL) {
  'use strict';
  var G = BAL.Game, Store = BAL.Store, fmt = G.fmt, byId = G.byId;
  var UI = BAL.UI = {};
  var S = { screen: 'profiles', tab: 'activities', shopCat: 'toys', creator: null, previewAge: 6, queue: [], modal: null };
  var $app, $modal, $toasts, $fx;

  var PROFILE_EMOJIS = ['🦄', '🐯', '🐸', '🐼', '🦊', '🐙', '🐵', '🐨', '🦁', '🐧', '🐲', '🦖', '🐬', '🦋', '🐝', '🌟'];
  var PROFILE_COLORS = ['#FF6B6B', '#FF9F1C', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA', '#F783AC', '#20C997'];

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function life() { var p = Store.active(); return p ? p.life : null; }
  function save() { Store.save(); }
  function statInfo(id) { return byId(BAL.STATS, id); }
  function reduced() { return globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function btn(label, act, attrs, cls) {
    return '<button class="btn ' + (cls || '') + '" data-act="' + act + '"' + (attrs || '') + '>' + label + '</button>';
  }
  function a(k, v) { return ' data-' + k + '="' + esc(v) + '"'; }
  function fxChips(fx) {
    return Object.keys(fx || {}).map(function (k) {
      var s = statInfo(k); if (!s) return '';
      return '<span class="fxchip ' + (fx[k] < 0 ? 'neg' : '') + '">' + s.emoji + (fx[k] > 0 ? '+' : '') + fx[k] + '</span>';
    }).join('');
  }
  function coinTag(n, free) { return n ? '<span class="price">🪙 ' + fmt(n) + '</span>' : (free ? '<span class="price free">' + free + '</span>' : ''); }
  function bar(v, color, label) {
    return '<div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v) + '" aria-label="' + esc(label || '') + '"><div class="bar-fill" style="width:' + Math.round(v) + '%;background:' + color + '"></div></div>';
  }
  function hearts(v) { return '<div class="hearts" title="Closeness ' + v + '/100">' + bar(v, 'linear-gradient(90deg,#FF8FAB,#FF4D6D)', 'Closeness') + '</div>'; }

  /* ====================== Feedback: toasts, confetti, modals ====================== */
  function toast(msg, emoji, kind, diffs, coins) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    var chips = (diffs || []).reduce(function (acc, d) {
      var found = acc.find(function (x) { return x.stat === d.stat; });
      if (found) found.d += d.d; else acc.push({ stat: d.stat, d: d.d });
      return acc;
    }, []).filter(function (d) { return d.d; }).map(function (d) {
      var s = statInfo(d.stat);
      return '<span class="fxchip ' + (d.d < 0 ? 'neg' : '') + '">' + s.emoji + ' ' + (d.d > 0 ? '+' : '') + d.d + '</span>';
    }).join('');
    if (coins) chips += '<span class="fxchip coin ' + (coins < 0 ? 'neg' : '') + '">🪙 ' + (coins > 0 ? '+' : '') + fmt(coins) + '</span>';
    el.innerHTML = '<span class="toast-emoji">' + esc(emoji || '✨') + '</span><div><div>' + esc(msg) + '</div>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</div>';
    $toasts.appendChild(el);
    while ($toasts.children.length > 3) $toasts.removeChild($toasts.firstChild);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); }, 3600);
  }

  function confetti(big) {
    if (reduced()) return;
    var colors = ['#FF6B6B', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA', '#F783AC', '#FF9F1C'];
    var shapes = ['', 'round', 'strip'];
    var n = big ? 140 : 70;
    for (var i = 0; i < n; i++) {
      var c = document.createElement('i');
      c.className = 'confetti ' + shapes[i % 3];
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.setProperty('--drift', (Math.random() * 200 - 100) + 'px');
      c.style.setProperty('--spin', (Math.random() * 720 + 360) + 'deg');
      $fx.appendChild(c);
      (function (el) { setTimeout(function () { el.remove(); }, 4800); })(c);
    }
  }
  function floaty(emoji) {
    if (reduced()) return;
    for (var i = 0; i < 6; i++) {
      var f = document.createElement('span');
      f.className = 'floaty'; f.textContent = emoji;
      f.style.left = (30 + Math.random() * 40) + 'vw';
      f.style.animationDelay = (i * 0.12) + 's';
      $fx.appendChild(f);
      (function (el) { setTimeout(function () { el.remove(); }, 2600); })(f);
    }
  }

  function openModal(cfg) { S.queue.push(cfg); if (!S.modal) nextModal(); }
  function nextModal() {
    var cfg = S.queue.shift();
    S.modal = cfg || null;
    if (!cfg) { $modal.innerHTML = ''; $modal.hidden = true; document.body.classList.remove('modal-open'); return; }
    if (cfg.onOpen) cfg.onOpen();
    $modal.hidden = false;
    document.body.classList.add('modal-open');
    var buttons = (cfg.buttons || [{ label: 'OK' }]).map(function (b, i) {
      return '<button class="btn big ' + (b.cls || (i === 0 ? 'primary' : '')) + '" data-mbtn="' + i + '"' + (b.disabled ? ' disabled' : '') + '>' + b.label + '</button>';
    }).join('');
    $modal.innerHTML = '<div class="modal-back"></div><div class="modal ' + (cfg.cls || '') + '" role="dialog" aria-modal="true" aria-labelledby="mtitle">' +
      '<button class="speak" data-speak title="Read aloud" aria-label="Read aloud">🔊</button>' +
      (cfg.emoji ? '<div class="modal-emoji">' + cfg.emoji + '</div>' : '') +
      '<h2 id="mtitle">' + cfg.title + '</h2>' +
      '<div class="modal-body">' + (cfg.html || '') + '</div>' +
      '<div class="modal-btns' + ((cfg.buttons || []).length > 2 ? ' stack' : '') + '">' + buttons + '</div></div>';
    var first = $modal.querySelector('input,[data-mbtn]');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function modalClick(e) {
    var sp = e.target.closest('[data-speak]');
    if (sp) { speak($modal.querySelector('.modal').innerText.replace('🔊', '')); return; }
    var mb = e.target.closest('[data-mbtn]');
    if (mb && S.modal) {
      var b = S.modal.buttons[+mb.getAttribute('data-mbtn')];
      BAL.sound('click');
      var keep = b && b.fn ? b.fn($modal) === false : false;
      if (!keep) { stopSpeaking(); nextModal(); render(); }
      return;
    }
    // In-modal pick buttons (e.g. choosing gender / size) toggle a selection.
    var pk = e.target.closest('[data-pick]');
    if (pk) {
      var grp = pk.getAttribute('data-pick');
      $modal.querySelectorAll('[data-pick="' + grp + '"]').forEach(function (x) { x.classList.remove('on'); });
      pk.classList.add('on');
      return;
    }
    var rn = e.target.closest('[data-randname]');
    if (rn) { var inp = $modal.querySelector('input[name="n"]'); if (inp) inp.value = rn.getAttribute('data-randname') === 'pet' ? G.pick(BAL.NAMES.pets) : G.randomName(pickedVal('g') || 'any'); }
  }
  function pickedVal(grp) { var el = $modal.querySelector('[data-pick="' + grp + '"].on'); return el ? el.getAttribute('data-val') : null; }

  function speak(text) {
    try {
      if (!globalThis.speechSynthesis) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ''));
      u.rate = 0.95; u.pitch = 1.1; u.lang = 'en-GB';
      speechSynthesis.speak(u);
    } catch (e) { /* no speech */ }
  }
  function stopSpeaking() { try { if (globalThis.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  function showAchievements(l) {
    while (l.newAch.length) {
      var ach = byId(BAL.ACHIEVEMENTS, l.newAch.shift());
      if (!ach) continue;
      (function (x) {
        openModal({ emoji: '<span class="sticker big">' + x.emoji + '</span>', title: 'New Sticker!', cls: 'sticker-modal',
          html: '<p class="lead"><b>' + esc(x.name) + '</b></p><p>' + esc(x.desc) + '</p><p class="muted">It\'s in your Sticker Book in "My Story" 📖</p>',
          buttons: [{ label: 'Awesome! 🌟' }], onOpen: function () { BAL.sound('sticker'); confetti(false); } });
      })(ach);
    }
    save();
  }

  function feedback(res) {
    var l = life();
    if (!res) return;
    BAL.sound(res.ok ? (res.coinsDelta > 0 ? 'coin' : (res.celebrate ? 'tada' : 'good')) : 'bad');
    toast(res.msg, res.emoji, res.ok ? 'good' : 'bad', res.diffs, res.coinsDelta);
    if (res.celebrate) { confetti(res.big); }
    if (res.offerGlasses) {
      openModal({ emoji: '👓', title: 'Would you like glasses?', html: '<p>Glasses help you see clearly — and they look super cool!</p>',
        buttons: [{ label: 'Yes please! 👓', fn: function () { G.run(l, 'setAccessory', 'glasses'); save(); } }, { label: 'No thanks', cls: 'ghost' }] });
    }
    if (l) showAchievements(l);
    save();
    render();
    if (l && l.ended) endOfLife();
  }

  function act(fn) {
    var l = life(); if (!l) return;
    var args = Array.prototype.slice.call(arguments, 1);
    var res = G.run.apply(null, [l, fn].concat(args));
    feedback(res);
    return res;
  }

  /* ====================== Screens ====================== */
  function render() {
    var p = Store.active();
    if (S.screen === 'game' && (!p || !p.life)) S.screen = p ? 'create' : 'profiles';
    var html = '';
    if (S.screen === 'profiles') html = renderProfiles();
    else if (S.screen === 'create') html = renderCreator();
    else if (S.screen === 'end') html = renderEnd();
    else html = renderGame();
    $app.innerHTML = html;
    $app.setAttribute('data-screen', S.screen);
    var l = life();
    var t = l && S.screen !== 'profiles' ? G.town(l) : null;
    document.documentElement.style.setProperty('--town1', t ? t.colors[0] : '#FFD6E8');
    document.documentElement.style.setProperty('--town2', t ? t.colors[1] : '#C9F2FF');
  }

  function topbar() {
    var p = Store.active();
    return '<header class="topbar">' +
      '<button class="logo" data-act="goProfiles" aria-label="Build a Life — players"><span class="logo-house">🏡</span><span class="logo-text">Build <i>a</i> Life</span></button>' +
      '<div class="topbar-right">' +
      (p ? '<span class="player-chip" style="--pc:' + esc(p.color) + '"><span>' + esc(p.emoji) + '</span>' + esc(p.name) + '</span>' : '') +
      '<button class="icon-btn" data-act="sound" aria-label="Sound on or off" title="Sound">' + (Store.data.sound ? '🔊' : '🔇') + '</button>' +
      '<button class="icon-btn" data-act="help" aria-label="How to play" title="How to play">❓</button>' +
      (S.screen !== 'profiles' ? '<button class="icon-btn" data-act="goProfiles" aria-label="Switch player" title="Switch player">👥</button>' : '') +
      '</div></header>';
  }

  /* ---------- Profiles ---------- */
  function renderProfiles() {
    var ps = Store.data.profiles;
    var cards = ps.map(function (p) {
      var l = p.life, sub;
      if (!l) sub = 'Ready to start a life!';
      else if (l.ended) sub = '🌟 ' + esc(l.name) + '\'s story is complete';
      else sub = esc(l.name) + ' · age ' + l.age + ' · ' + G.town(l).emoji + ' ' + esc(G.town(l).name);
      return '<div class="profile-card pop" style="--pc:' + esc(p.color) + '">' +
        '<button class="profile-main" data-act="pickProfile"' + a('id', p.id) + '>' +
        '<span class="profile-emoji">' + (l && !l.ended ? BAL.avatar(l.look, l.age, l.stats.happy) : esc(p.emoji)) + '</span>' +
        '<span class="profile-name">' + esc(p.name) + '</span><span class="profile-sub">' + sub + '</span>' +
        (p.hall.length ? '<span class="profile-hall">🏆 ' + p.hall.length + ' ' + (p.hall.length === 1 ? 'life' : 'lives') + ' lived</span>' : '') +
        '<span class="btn primary small">▶ Play</span></button>' +
        '<button class="profile-del" data-act="delProfile"' + a('id', p.id) + ' aria-label="Delete player ' + esc(p.name) + '" title="Delete player">🗑️</button></div>';
    }).join('');
    return topbar() + '<main class="profiles-screen">' +
      '<div class="hero"><div class="hero-art" aria-hidden="true">' + heroArt() + '</div>' +
      '<h1>Build <span>a</span> Life</h1><p class="tagline">Grow up, make friends, find a job, adopt pets and build the life of your dreams!</p></div>' +
      '<h2 class="section-title">' + (ps.length ? '👋 Who\'s playing?' : '👋 Welcome! Make your player to begin') + '</h2>' +
      '<div class="profile-grid">' + cards +
      '<button class="profile-card add pop" data-act="newProfile"><span class="profile-emoji">➕</span><span class="profile-name">New Player</span><span class="profile-sub">Everyone gets their own save!</span></button></div>' +
      '<p class="parent-note">👪 <b>For grown-ups:</b> all coins in this game are pretend. There are no real-money purchases, no adverts and no chat. Games are saved only on this device.</p>' +
      '</main>';
  }
  function heroArt() {
    var looks = [
      { skin: '#F6C9A0', hair: 'pigtails', hairColor: '#E9C46A', eyes: '#1F6FEB', outfit: '#FF6B6B', accessory: 'bow' },
      { skin: '#8D5A36', hair: 'afro', hairColor: '#2B1B12', eyes: '#3B2314', outfit: '#4DABF7', accessory: 'none' },
      { skin: '#E0A877', hair: 'bun', hairColor: '#5A3825', eyes: '#2A9D8F', outfit: '#69DB7C', accessory: 'glasses' },
      { skin: '#FFE0C7', hair: 'short', hairColor: '#A0522D', eyes: '#3B2314', outfit: '#9775FA', accessory: 'cap' }
    ];
    var ages = [0, 8, 30, 75];
    return ages.map(function (ag, i) { return '<div class="hero-av" style="--d:' + (i * 0.25) + 's">' + BAL.avatar(looks[i], ag, 90) + '</div>'; }).join('<span class="hero-arrow">➜</span>');
  }

  function newProfileModal() {
    var em = PROFILE_EMOJIS.map(function (e, i) { return '<button class="pick emoji-pick' + (i === 0 ? ' on' : '') + '" data-pick="e" data-val="' + e + '">' + e + '</button>'; }).join('');
    var co = PROFILE_COLORS.map(function (c, i) { return '<button class="pick swatch' + (i === 5 ? ' on' : '') + '" data-pick="c" data-val="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join('');
    openModal({ emoji: '🙋', title: 'New Player', html:
      '<label class="field"><span>What\'s your name?</span><input name="pn" maxlength="16" placeholder="Type your name" autocomplete="off"></label>' +
      '<div class="field"><span>Pick your icon</span><div class="pick-row">' + em + '</div></div>' +
      '<div class="field"><span>Pick your colour</span><div class="pick-row">' + co + '</div></div>',
      buttons: [{ label: 'Create Player ✨', fn: function (m) {
        var name = m.querySelector('input[name="pn"]').value.trim();
        if (!name) { m.querySelector('input[name="pn"]').classList.add('shake'); m.querySelector('input[name="pn"]').placeholder = 'Please type a name 🙂'; return false; }
        var p = Store.addProfile(name, pickedVal('e'), pickedVal('c'));
        Store.data.activeId = p.id; save();
        startCreator();
      } }, { label: 'Cancel', cls: 'ghost' }] });
  }

  /* ---------- Character creator ---------- */
  function startCreator(prefill) {
    var g = G.pick(['girl', 'boy']);
    S.creator = Object.assign({ name: G.randomName(g), gender: g, look: G.randomLook(), townId: 'maple', familyType: 'mumdad' }, prefill || {});
    S.creator.look.accessory = S.creator.look.accessory === 'crown' ? 'none' : S.creator.look.accessory;
    S.previewAge = 6;
    S.screen = 'create';
    render();
    window.scrollTo(0, 0);
  }

  function renderCreator() {
    var c = S.creator || (startCreator(), S.creator);
    var L = BAL.LOOKS, look = c.look;
    function swatches(key, list) {
      return '<div class="pick-row">' + list.map(function (col) {
        return '<button class="pick swatch' + (look[key] === col ? ' on' : '') + '" data-act="look"' + a('k', key) + a('v', col) + ' style="background:' + col + '" aria-label="' + key + ' ' + col + '"></button>';
      }).join('') + '</div>';
    }
    function chips(key, list, val) {
      return '<div class="pick-row">' + list.map(function (o) {
        return '<button class="pick chip' + (val === o.id ? ' on' : '') + '" data-act="' + (key === 'gender' || key === 'familyType' ? 'cset' : 'look') + '"' + a('k', key) + a('v', o.id) + '>' + (o.emoji ? o.emoji + ' ' : '') + esc(o.name) + '</button>';
      }).join('') + '</div>';
    }
    var town = byId(BAL.TOWNS, c.townId);
    var ages = [[0, '👶 Baby'], [6, '🧒 Kid'], [15, '🧑‍🎤 Teen'], [30, '🧑 Grown-up'], [78, '🧓 Old']];
    return topbar() + '<main class="creator">' +
      '<div class="creator-preview card" style="--t1:' + town.colors[0] + ';--t2:' + town.colors[1] + '">' +
      '<div class="preview-av bob">' + BAL.avatar(look, S.previewAge, 90, { label: 'Your character' }) + '</div>' +
      '<div class="preview-name" id="pvname">' + esc(c.name || '…') + '</div>' +
      '<div class="pick-row center">' + ages.map(function (x) { return '<button class="pick chip small' + (S.previewAge === x[0] ? ' on' : '') + '" data-act="previewAge"' + a('v', x[0]) + '>' + x[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small center">See how you\'ll grow up!</p>' +
      '<button class="btn primary huge" data-act="startLife">👶 Start my life!</button>' +
      '<button class="btn ghost" data-act="randomChar">🎲 Surprise me!</button></div>' +
      '<div class="creator-options">' +
      '<h1 class="section-title">✨ Create your character</h1>' +
      '<section class="card opt"><h3>📛 Name</h3><div class="name-row"><input id="cname" maxlength="20" value="' + esc(c.name) + '" aria-label="Character name" autocomplete="off"><button class="btn" data-act="randName" aria-label="Random name">🎲</button></div></section>' +
      '<section class="card opt"><h3>🙂 I am a…</h3>' + chips('gender', [{ id: 'girl', name: 'Girl', emoji: '👧' }, { id: 'boy', name: 'Boy', emoji: '👦' }, { id: 'any', name: 'Just me!', emoji: '🌈' }], c.gender) + '</section>' +
      '<section class="card opt"><h3>🎨 Skin</h3>' + swatches('skin', L.skins) + '</section>' +
      '<section class="card opt"><h3>💇 Hair style</h3>' + chips('hair', L.hairStyles, look.hair) + '<h3>🌈 Hair colour</h3>' + swatches('hairColor', L.hairColors) + '</section>' +
      '<section class="card opt"><h3>👀 Eyes</h3>' + swatches('eyes', L.eyes) + '<h3>👕 Favourite colour</h3>' + swatches('outfit', L.outfits) + '</section>' +
      '<section class="card opt"><h3>🎀 Extras</h3>' + chips('accessory', L.accessories.filter(function (x) { return x.id !== 'crown'; }), look.accessory) + '</section>' +
      '<section class="card opt"><h3>👪 Your family</h3>' + chips('familyType', BAL.FAMILY_TYPES, c.familyType) + '</section>' +
      '<section class="card opt"><h3>📍 Where will you be born?</h3><div class="town-grid">' + BAL.TOWNS.map(function (t) {
        return '<button class="town-card' + (t.id === c.townId ? ' on' : '') + '" data-act="ctown"' + a('v', t.id) + ' style="--t1:' + t.colors[0] + ';--t2:' + t.colors[1] + '"><span class="town-emoji">' + t.emoji + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.kind) + '</small><span class="town-desc">' + esc(t.desc) + '</span></button>';
      }).join('') + '</div></section>' +
      '</div></main>';
  }

  /* ---------- Game screen ---------- */
  var TABS = [
    { id: 'activities', name: 'Activities', emoji: '🎈', color: '#FF6B6B' },
    { id: 'school', name: 'School', emoji: '🏫', color: '#FF9F1C' },
    { id: 'people', name: 'Family & Friends', emoji: '❤️', color: '#F783AC' },
    { id: 'home', name: 'Home & Cars', emoji: '🏠', color: '#4DABF7' },
    { id: 'pets', name: 'Pets', emoji: '🐾', color: '#69DB7C' },
    { id: 'shop', name: 'Shop', emoji: '🛍️', color: '#9775FA' },
    { id: 'health', name: 'Health', emoji: '🏥', color: '#FF5D73' },
    { id: 'chores', name: 'Daily Jobs', emoji: '✅', color: '#20C997' },
    { id: 'towns', name: 'Places', emoji: '🗺️', color: '#3A86FF' },
    { id: 'story', name: 'My Story', emoji: '📖', color: '#F59F00' }
  ];

  function renderGame() {
    var l = life();
    if (!l) return '';
    if (l.ended) { S.screen = 'end'; return renderEnd(); }
    var t = G.town(l), st = BAL.STAGES[G.stage(l.age)];
    var choresLeft = l.chores.filter(function (c) { return !c.done; }).length;
    var tabs = TABS.map(function (tb) {
      var name = tb.name, emoji = tb.emoji, badge = '';
      if (tb.id === 'school') { if (l.age >= 18 && !l.edu.course) { name = 'Work'; emoji = '💼'; } else if (l.age < 3) { name = 'Learning'; emoji = '🧸'; } }
      if (tb.id === 'chores' && choresLeft) badge = '<span class="badge">' + choresLeft + '</span>';
      if (tb.id === 'health' && l.sick) badge = '<span class="badge">!</span>';
      return '<button class="tab' + (S.tab === tb.id ? ' on' : '') + '" data-act="tab"' + a('id', tb.id) + ' style="--tc:' + tb.color + '"><span class="tab-emoji">' + emoji + '</span><span class="tab-name">' + name + '</span>' + badge + '</button>';
    }).join('');
    var pips = '';
    for (var i = 0; i < l.maxEnergy; i++) pips += '<span class="pip' + (i < l.energy ? ' on' : '') + '">⚡</span>';
    var stats = BAL.STATS.map(function (s) {
      return '<div class="stat"><span class="stat-label">' + s.emoji + ' ' + s.name + '</span><span class="stat-num">' + l.stats[s.id] + '</span>' + bar(l.stats[s.id], s.color, s.name) + '</div>';
    }).join('');
    var status = l.job ? G.job(l).emoji + ' ' + esc(G.jobTitle(l)) : l.edu.course ? '🎓 Student' : l.partTime ? byId(BAL.PART_TIME, l.partTime).emoji + ' ' + byId(BAL.PART_TIME, l.partTime).name : l.retired ? '🏖️ Retired' : (G.school(l) ? G.school(l).emoji + ' ' + G.school(l).label.split(' —')[0] : st.emoji + ' ' + st.name);

    return topbar() + '<main class="game">' +
      '<aside class="char card" style="--t1:' + t.colors[0] + ';--t2:' + t.colors[1] + '">' +
      '<div class="char-top"><div class="char-av bob">' + BAL.avatar(l.look, l.age, l.stats.happy, { label: l.name }) + (l.sick ? '<span class="sick-tag" title="Feeling poorly">' + byId(BAL.ILLNESSES, l.sick.id).emoji + '</span>' : '') + '</div>' +
      '<div class="char-id"><div class="char-name">' + esc(l.name) + (l.generation > 1 ? ' <small title="Generation">Gen ' + l.generation + '</small>' : '') + '</div>' +
      '<div class="char-age"><b>' + l.age + '</b> year' + (l.age === 1 ? '' : 's') + ' old</div>' +
      '<div class="chips-row"><span class="chip-s">' + st.emoji + ' ' + st.name + '</span><span class="chip-s">' + t.emoji + ' ' + esc(t.name) + '</span></div>' +
      (status.indexOf(st.name) < 0 ? '<div class="chips-row"><span class="chip-s">' + status + '</span></div>' : '') + '</div></div>' +
      '<div class="coins-row"><span class="coins" title="Coins (pretend money)"><span class="coin-ico">🪙</span> ' + fmt(l.coins) + '</span><span class="year">📅 ' + l.year + '</span></div>' +
      '<div class="energy" title="Energy: each activity uses one ⚡. Age up to get more!"><span class="energy-label">Energy</span>' + pips + '</div>' +
      '<div class="stats">' + stats + '</div>' +
      '<button class="btn ageup" data-act="ageUp"><span class="cake">🎂</span> Age Up!<small>Go to age ' + (l.age + 1) + '</small></button>' +
      '</aside>' +
      '<section class="play"><nav class="tabs" aria-label="Game sections">' + tabs + '</nav>' +
      '<div class="panel card pop" id="panel">' + renderPanel(l) + '</div></section></main>';
  }

  function renderPanel(l) {
    switch (S.tab) {
      case 'school': return panelSchool(l);
      case 'people': return panelPeople(l);
      case 'home': return panelHome(l);
      case 'pets': return panelPets(l);
      case 'shop': return panelShop(l);
      case 'health': return panelHealth(l);
      case 'chores': return panelChores(l);
      case 'towns': return panelTowns(l);
      case 'story': return panelStory(l);
      default: return panelActivities(l);
    }
  }
  function head(emoji, title, sub) { return '<div class="panel-head"><span class="panel-emoji">' + emoji + '</span><div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div></div>'; }
  function energyNote(l) { return l.energy ? '<span class="energy-note">⚡ ' + l.energy + ' energy left this year</span>' : '<div class="tip">😴 Out of energy! Press <b>🎂 Age Up</b> to rest and start a new year.</div>'; }

  function panelActivities(l) {
    var list = G.activities(l).map(function (x) {
      var cost = G.activityCost(l, x);
      return '<button class="act-card" data-act="do" data-fn="activity"' + a('a1', x.id) + (l.energy ? '' : ' disabled') + '>' +
        '<span class="act-emoji">' + x.emoji + '</span><span class="act-name">' + esc(x.name) + '</span>' +
        '<span class="act-fx">' + fxChips(x.fx) + (x.earn ? '<span class="fxchip coin">🪙+</span>' : '') + '</span>' +
        '<span class="act-cost">⚡1 ' + (cost ? ' · 🪙 ' + fmt(cost) : '') + '</span></button>';
    }).join('');
    return head('🎈', 'Things to do', 'Each activity uses 1 ⚡ energy.') + energyNote(l) + '<div class="act-grid">' + list + '</div>';
  }

  function panelSchool(l) {
    var out = '', sch = G.school(l);
    if (l.age < 3) {
      return head('🧸', 'Learning through play', 'Babies learn by playing, cuddling and exploring!') +
        '<div class="big-msg"><span>🍼</span><p>You\'re too little for school. Try <b>Say New Words</b> and <b>Crawl & Explore</b> in Activities! Nursery starts at age 3.</p></div>';
    }
    if (sch) {
      var stars = G.gradeStars(l);
      out += head(sch.emoji, esc(sch.name), esc(sch.label)) +
        '<div class="info-card"><div><b>School report</b><div class="stars" aria-label="' + stars + ' out of 5 stars">' + '⭐'.repeat(stars) + '<span class="dim">' + '⭐'.repeat(5 - stars) + '</span></div></div>' +
        (sch.kind !== 'nursery' ? btn('📚 Study hard <small>⚡1</small>', 'do', a('fn', 'study'), 'primary') : '<p>Painting, singing and story time! 🎨🎵</p>') + '</div>';
      if (sch.kind !== 'nursery') {
        out += '<h3 class="sub">🎯 After-school clubs <small>(pick up to 2 — they give a boost every year)</small></h3><div class="mini-grid">' + BAL.CLUBS.map(function (c) {
          var on = l.edu.clubs.indexOf(c.id) >= 0;
          return '<div class="mini-card' + (on ? ' on' : '') + '"><span class="mini-emoji">' + c.emoji + '</span><b>' + c.name + '</b><span>' + fxChips(c.fx) + '</span>' +
            (on ? btn('Leave', 'do', a('fn', 'leaveClub') + a('a1', c.id), 'small ghost') : btn('Join', 'do', a('fn', 'joinClub') + a('a1', c.id), 'small')) + '</div>';
        }).join('') + '</div>';
      }
      if (l.age >= 13 && l.age < 18) {
        out += '<h3 class="sub">💷 Part-time jobs <small>(earn coins, but you get 1 less ⚡ each year)</small></h3><div class="mini-grid">' + BAL.PART_TIME.map(function (p) {
          var on = l.partTime === p.id;
          return '<div class="mini-card' + (on ? ' on' : '') + '"><span class="mini-emoji">' + p.emoji + '</span><b>' + p.name + '</b><span>🪙 ' + p.pay + '/year</span>' +
            (on ? btn('Stop', 'do', a('fn', 'quitPartTime'), 'small ghost') : (l.age >= p.minAge ? btn('Start', 'do', a('fn', 'partTime') + a('a1', p.id), 'small') : '<small class="muted">From age ' + p.minAge + '</small>')) + '</div>';
        }).join('') + '</div>';
      }
      if (l.age < 18) out += '<div class="tip">💡 When you\'re 18 you can go to college or university, or start a job!</div>';
      if (!l.edu.course) return out;
    }
    // Grown-ups
    if (!sch) out += head('💼', 'Work & Learning', 'Your education: <b>' + BAL.EDU_LEVELS[l.edu.level] + '</b>');
    if (l.job) {
      var j = G.job(l);
      out += '<div class="info-card job"><span class="big-emoji">' + j.emoji + '</span><div class="grow"><b class="lg">' + esc(G.jobTitle(l)) + '</b><div>Pay: 🪙 ' + fmt(G.salary(l)) + ' a year · ' + l.job.years + ' year' + (l.job.years === 1 ? '' : 's') + ' here</div>' +
        '<div class="perf"><span>Work bar</span>' + bar(l.job.perf, 'linear-gradient(90deg,#FFD43B,#FF9F1C)', 'Work performance') + '</div></div></div>' +
        '<div class="btn-row">' + btn('💪 Work hard <small>⚡1</small>', 'do', a('fn', 'workHard'), 'primary') + btn('⬆️ Ask for promotion <small>⚡1</small>', 'do', a('fn', 'askPromotion')) +
        (l.age >= 60 ? btn('🏖️ Retire', 'confirm', a('fn', 'retire')) : '') + btn('👋 Quit job', 'confirm', a('fn', 'quitJob'), 'ghost') + '</div>';
    } else if (!l.edu.course) {
      out += '<div class="info-card"><span class="big-emoji">' + (l.retired ? '🏖️' : '🔍') + '</span><div>' + (l.retired ? '<b>You are retired!</b> Enjoy your hobbies. You can still take a job if you want.' : '<b>No job right now.</b> Pick one from the Job Centre below!') + '</div></div>';
    }
    if (l.edu.course) {
      out += '<div class="tip">📚 While you are studying you get a small student grant each year. Finish your course to unlock better jobs!</div>';
    }
    // Courses
    if (!l.edu.course && l.age >= 18) {
      var courses = ['college', 'uni'].map(function (id) {
        var c = BAL.COURSES[id];
        var done = l.edu.level >= c.level;
        return '<div class="mini-card' + (done ? ' on' : '') + '"><span class="mini-emoji">' + c.emoji + '</span><b>' + c.name + '</b><small>' + c.years + ' years · free</small><small>' + c.desc + '</small>' +
          (done ? '<span class="tag ok">✓ Done</span>' : btn('Enrol', 'do', a('fn', 'enrol') + a('a1', id), 'small')) + '</div>';
      }).join('');
      out += '<h3 class="sub">🎓 Go back to learning</h3><div class="mini-grid two">' + courses + '</div>';
    }
    if (!l.edu.course) {
      var t = G.town(l);
      out += '<h3 class="sub">🏢 Job Centre <small>(applying uses ⚡1)</small></h3><div class="job-grid">' + BAL.JOBS.map(function (jb) {
        var chk = G.jobCheck(l, jb);
        var reqs = [];
        reqs.push('<span class="tag ' + (l.edu.level >= jb.edu ? 'ok' : 'no') + '">🎓 ' + BAL.EDU_LEVELS[jb.edu] + '</span>');
        if (jb.smarts) reqs.push('<span class="tag ' + (l.stats.smarts >= jb.smarts ? 'ok' : 'no') + '">🧠 ' + jb.smarts + '+</span>');
        if (jb.fitness) reqs.push('<span class="tag ' + (l.stats.fitness >= jb.fitness ? 'ok' : 'no') + '">💪 ' + jb.fitness + '+</span>');
        var mine = l.job && l.job.id === jb.id;
        return '<div class="job-card' + (chk.ok ? ' can' : '') + (mine ? ' mine' : '') + '"><span class="job-emoji">' + jb.emoji + '</span><div class="grow"><b>' + jb.name + '</b><div class="pay">🪙 ' + fmt(jb.pay * t.pay) + ' / year</div><div class="reqs">' + reqs.join('') + '</div></div>' +
          (mine ? '<span class="tag ok">Your job</span>' : btn(chk.ok ? 'Apply' : '🔒', 'do', a('fn', 'applyJob') + a('a1', jb.id), 'small' + (chk.ok ? ' primary' : ' ghost'))) + '</div>';
      }).join('') + '</div>';
    }
    return out;
  }

  function personCard(l, p) {
    var role = BAL.ROLES[p.role] || { label: p.role, emoji: '🙂' };
    var label = role.label;
    if (p.role === 'sibling') label = p.gender === 'girl' ? 'Sister' : p.gender === 'boy' ? 'Brother' : 'Sibling';
    if (p.role === 'spouse') label = p.gender === 'girl' ? 'Wife' : 'Husband';
    if (p.role === 'child') label = (p.gender === 'girl' ? 'Daughter' : 'Son') + (p.age >= 18 ? ' (grown up)' : '');
    if (p.role === 'grandchild') label = 'Grandchild';
    var btns = btn('💬 Spend time <small>⚡</small>', 'do', a('fn', 'spendTime') + a('a1', p.id), 'small') + btn('🎁 Gift', 'do', a('fn', 'giveGift') + a('a1', p.id), 'small');
    if (p.role === 'partner' || p.role === 'fiance' || p.role === 'spouse') btns += btn('🌹 Date <small>⚡</small>', 'do', a('fn', 'date') + a('a1', p.id), 'small');
    if (p.role === 'partner') btns += btn('💍 Propose', 'do', a('fn', 'propose') + a('a1', p.id), 'small primary');
    if (p.role === 'fiance') btns += btn('💒 Plan wedding', 'wedding', a('id', p.id), 'small primary');
    if (p.role === 'partner' || p.role === 'fiance' || p.role === 'spouse') btns += btn('🍂', 'confirm', a('fn', 'separate') + a('a1', p.id) + ' title="Go separate ways" aria-label="Go separate ways"', 'small ghost');
    return '<div class="person"><div class="person-av">' + BAL.avatar(p.look, p.age, p.close, { bg: '#fff' }) + '</div>' +
      '<div class="grow"><div class="person-name"><b>' + esc(p.name) + '</b> <span class="role">' + role.emoji + ' ' + label + '</span></div>' +
      '<div class="muted small">Age ' + p.age + (p.parentName ? ' · ' + esc(p.parentName) + '\'s baby' : '') + '</div>' + hearts(p.close) +
      '<div class="btn-row">' + btns + '</div></div></div>';
  }

  function panelPeople(l) {
    var groups = [
      ['👪 Family', ['mum', 'dad', 'grandma', 'grandpa', 'sibling']],
      ['💕 Love', ['partner', 'fiance', 'spouse']],
      ['🧸 Children & Grandchildren', ['child', 'grandchild']],
      ['🤝 Friends', ['friend']]
    ];
    var partner = G.partner(l);
    var top = '<div class="btn-row">';
    if (l.age >= 3) top += btn('🤝 Make a friend <small>⚡1</small>', 'do', a('fn', 'makeFriend'), 'primary');
    if (l.age >= 18 && !partner) top += btn('💘 Find a sweetheart <small>⚡1</small>', 'findLove', '', 'pink');
    if (partner && l.age >= 20 && l.age <= 50) top += btn('👶 Have a baby', 'baby', a('kind', 'haveBaby'), 'pink');
    if (l.age >= 25 && l.age <= 60) top += btn('🏡 Adopt a child', 'baby', a('kind', 'adoptChild'));
    top += '</div>';
    var body = groups.map(function (g) {
      var ps = l.people.filter(function (p) { return g[1].indexOf(p.role) >= 0; });
      if (!ps.length) return '';
      return '<h3 class="sub">' + g[0] + '</h3><div class="people-grid">' + ps.map(function (p) { return personCard(l, p); }).join('') + '</div>';
    }).join('');
    if (!l.people.length) body = '<div class="big-msg"><span>🌱</span><p>Go and meet some people!</p></div>';
    var rem = l.remembered.filter(function (x) { return x.role !== 'pet'; });
    if (rem.length) body += '<h3 class="sub">🌅 Always in your heart</h3><div class="remember">' + rem.map(function (x) { return '<span>💛 ' + esc(x.name) + ' <small>(' + x.age + ')</small></span>'; }).join('') + '</div>';
    var tip = l.age < 18 ? '<div class="tip">💡 Spending time with people fills up their heart bar. Sweethearts and weddings are for grown-ups (18+).</div>' : '<div class="tip">💡 Go on dates to fill the love bar above 70, then propose! 💍</div>';
    return head('❤️', 'Family & Friends', 'The people who make life special.') + energyNote(l) + top + tip + body;
  }

  function panelHome(l) {
    var hi = G.homeInfo(l), out = head('🏠', 'Home & Cars', esc(G.town(l).name) + ' ' + G.town(l).emoji);
    out += '<div class="home-hero"><span class="home-emoji">' + hi.emoji + '</span><div><b class="lg">' + esc(hi.name) + '</b><div>' + esc(hi.kind) + '</div>' +
      (hi.yearly ? '<div>Rent: 🪙 ' + fmt(hi.yearly) + ' a year</div>' : '') +
      (l.home.type === 'own' ? '<div>Worth: 🪙 ' + fmt(l.home.value) + (l.home.owed > 0 ? ' · Still to pay: 🪙 ' + fmt(l.home.owed) + ' (🪙 ' + fmt(l.home.yearly) + '/year)' : ' · <b>Fully paid! 🎉</b>') + '</div>' : '') +
      '<div class="btn-row">' + (l.home.type === 'own' && l.home.owed > 0 ? btn('💰 Pay it all off', 'do', a('fn', 'payOffHome'), 'small') : '') +
      (l.home.type === 'own' ? btn('🪧 Sell home', 'confirm', a('fn', 'sellHome'), 'small ghost') : '') +
      (l.age >= 18 && l.home.type === 'rent' && l.people.some(function (p) { return ['mum', 'dad', 'grandma', 'grandpa'].indexOf(p.role) >= 0; }) ? btn('🏡 Move back with family', 'do', a('fn', 'moveHome'), 'small ghost') : '') +
      '</div></div></div>';
    if (l.age < 18) {
      out += '<div class="tip">🏡 You live with your family. When you\'re 18 you can rent or buy your own home!</div>';
    } else {
      out += '<h3 class="sub">🔑 Homes to rent <small>(pay every year)</small></h3><div class="mini-grid">' + BAL.RENTALS.map(function (h) {
        var on = l.home.type === 'rent' && l.home.id === h.id;
        return '<div class="mini-card' + (on ? ' on' : '') + '"><span class="mini-emoji">' + h.emoji + '</span><b>' + h.name + '</b><span>🪙 ' + fmt(G.price(l, h.rent)) + '/year</span>' + (on ? '<span class="tag ok">You live here</span>' : btn('Rent', 'do', a('fn', 'rentHome') + a('a1', h.id), 'small')) + '</div>';
      }).join('') + '</div>';
      out += '<h3 class="sub">🏡 Homes for sale <small>(pay 20% now, the rest over 20 years)</small></h3><div class="mini-grid">' + BAL.HOMES.map(function (h) {
        var price = G.price(l, h.price), dep = Math.round(price * BAL.HOME_DEPOSIT);
        var on = l.home.type === 'own' && l.home.id === h.id;
        return '<div class="mini-card' + (on ? ' on' : '') + '"><span class="mini-emoji">' + h.emoji + '</span><b>' + h.name + '</b><span>🪙 ' + fmt(price) + '</span><small>First payment: 🪙 ' + fmt(dep) + '</small>' +
          (on ? '<span class="tag ok">Your home</span>' : btn('Buy', 'confirm', a('fn', 'buyHome') + a('a1', h.id), 'small' + (l.coins >= dep ? ' primary' : ''))) + '</div>';
      }).join('') + '</div>';
    }
    out += '<h3 class="sub">🚗 Cars</h3>';
    if (l.age < 17) out += '<div class="tip">🚦 You can learn to drive at 17. Until then — bikes and scooters! 🚲</div>';
    else if (!l.licence) out += '<div class="info-card"><span class="big-emoji">🪪</span><div class="grow"><b>No driving licence yet</b><div>Pass the test to buy a car.</div></div>' + btn('🚦 Take driving test <small>⚡1</small>', 'do', a('fn', 'drivingTest'), 'primary') + '</div>';
    else {
      if (l.cars.length) out += '<div class="mini-grid">' + l.cars.map(function (c) { var cc = byId(BAL.CARS, c.id); return '<div class="mini-card on"><span class="mini-emoji drive">' + cc.emoji + '</span><b>' + cc.name + '</b><span class="tag ok">Yours!</span>' + btn('Sell', 'do', a('fn', 'sellCar') + a('a1', c.uid), 'small ghost') + '</div>'; }).join('') + '</div>';
      out += '<h3 class="sub">🏬 Car showroom</h3><div class="mini-grid">' + BAL.CARS.map(function (c) {
        return '<div class="mini-card"><span class="mini-emoji">' + c.emoji + '</span><b>' + c.name + '</b><span>🪙 ' + fmt(c.price) + '</span>' + btn('Buy', 'do', a('fn', 'buyCar') + a('a1', c.id), 'small' + (l.coins >= c.price ? ' primary' : '')) + '</div>';
      }).join('') + '</div>';
    }
    return out;
  }

  function panelPets(l) {
    var out = head('🐾', 'Pets', 'Love them, play with them and they\'ll make you happy!') + energyNote(l);
    if (l.pets.length) {
      out += '<h3 class="sub">💛 Your pets</h3><div class="people-grid">' + l.pets.map(function (p) {
        var k = byId(BAL.PETS, p.kind);
        return '<div class="person pet"><div class="pet-av wiggle">' + k.emoji + '</div><div class="grow"><div class="person-name"><b>' + esc(p.name) + '</b> <span class="role">' + k.name + '</span></div><div class="muted small">Age ' + p.age + '</div>' +
          hearts(p.love) + '<div class="btn-row">' + btn('🎾 Play <small>⚡</small>', 'do', a('fn', 'playPet') + a('a1', p.id), 'small primary') + btn('🦴 Treat <small>🪙10</small>', 'do', a('fn', 'petTreat') + a('a1', p.id), 'small') +
          btn('🌾', 'confirm', a('fn', 'rehomePet') + a('a1', p.id) + ' title="Find a new home" aria-label="Find ' + esc(p.name) + ' a new home"', 'small ghost') + '</div></div></div>';
      }).join('') + '</div>';
    } else out += '<div class="big-msg"><span>🏠</span><p>No pets yet. Visit the animal shelter below!</p></div>';
    var kid = l.age < 18;
    out += '<h3 class="sub">🏡 Animal Shelter ' + (kid ? '<small>(ask your family — once a year!)</small>' : '<small>(adoption fee + yearly food & vet costs)</small>') + '</h3>';
    if (l.age < 5) out += '<div class="tip">🍼 You can ask for a pet when you\'re 5!</div>';
    out += '<div class="mini-grid">' + BAL.PETS.map(function (k) {
      return '<div class="mini-card"><span class="mini-emoji wiggle-h">' + k.emoji + '</span><b>' + k.name + '</b>' +
        (kid ? '' : '<span>🪙 ' + fmt(G.price(l, k.fee)) + '</span><small>Food: 🪙 ' + fmt(G.price(l, k.cost)) + '/yr</small>') +
        btn(kid ? 'Ask family 🙏' : 'Adopt', 'adoptPet', a('kind', k.id), 'small' + (kid && l.flags.askedPet ? ' ghost' : ' primary')) + '</div>';
    }).join('') + '</div>';
    var rem = l.remembered.filter(function (x) { return x.role === 'pet'; });
    if (rem.length) out += '<h3 class="sub">🌈 Rainbow Bridge friends</h3><div class="remember">' + rem.map(function (x) { var k = byId(BAL.PETS, x.kind); return '<span>' + (k ? k.emoji : '🐾') + ' ' + esc(x.name) + '</span>'; }).join('') + '</div>';
    return out;
  }

  function panelShop(l) {
    var cats = BAL.SHOP_CATS.map(function (c) { return '<button class="pick chip' + (S.shopCat === c.id ? ' on' : '') + '" data-act="shopCat"' + a('id', c.id) + '>' + c.emoji + ' ' + c.name + '</button>'; }).join('');
    var items = BAL.ITEMS.filter(function (it) { return it.cat === S.shopCat; }).map(function (it) {
      var owned = !it.consumable && l.inventory.indexOf(it.id) >= 0;
      var price = G.itemPrice(l, it);
      return '<div class="shop-card' + (owned ? ' owned' : '') + '"><span class="shop-emoji">' + it.emoji + '</span><b>' + it.name + '</b><span class="shop-fx">' + fxChips(it.fx) + '</span>' +
        (owned ? '<span class="tag ok">✓ Owned</span>' : btn('🪙 ' + fmt(price), 'do', a('fn', 'buyItem') + a('a1', it.id), 'small' + (l.coins >= price ? ' primary' : ' ghost'))) + '</div>';
    }).join('');
    var stuff = l.inventory.map(function (id) { var it = byId(BAL.ITEMS, id); return it ? '<span title="' + esc(it.name) + '">' + it.emoji + '</span>' : ''; }).join('');
    var accs = BAL.LOOKS.accessories.filter(function (x) { return x.id !== 'crown' || l.unlocked.indexOf('crown') >= 0; }).map(function (x) {
      return '<button class="pick chip small' + (l.look.accessory === x.id ? ' on' : '') + '" data-act="do" data-fn="setAccessory"' + a('a1', x.id) + '>' + x.emoji + ' ' + x.name + '</button>';
    }).join('');
    return head('🛍️', 'The Shops', 'Spend your coins on fun things! You have 🪙 ' + fmt(l.coins) + '.') +
      (l.age < 18 ? '<div class="tip">🐷 Earn coins from chores, birthdays, pocket money and part-time jobs.</div>' : '') +
      '<div class="pick-row">' + cats + '</div><div class="shop-grid">' + items + '</div>' +
      '<h3 class="sub">🎒 My Stuff</h3><div class="shelf">' + (stuff || '<span class="muted small">Nothing yet — go shopping!</span>') + '</div>' +
      '<h3 class="sub">🪞 Wardrobe</h3><div class="pick-row">' + accs + '</div>';
  }

  function panelHealth(l) {
    var ill = l.sick ? byId(BAL.ILLNESSES, l.sick.id) : null;
    var out = head('🏥', 'Health Centre', l.age < 18 ? 'Free for children! 🎉' : 'Look after yourself.') +
      '<div class="info-card health"><span class="big-emoji heartbeat">' + (ill ? ill.emoji : '❤️') + '</span><div class="grow"><b class="lg">' + (ill ? 'You have ' + ill.name + '!' : (l.stats.health > 70 ? 'You feel great!' : l.stats.health > 40 ? 'You feel OK.' : 'You feel a bit poorly.')) + '</b>' +
      '<div>' + (ill ? 'Visit the ' + (ill.cure === 'gp' ? 'Doctor 🩺' : ill.cure === 'dentist' ? 'Dentist 🦷' : 'Hospital 🏥') + ' to get better.' : 'Health: ' + l.stats.health + ' / 100') + '</div>' + bar(l.stats.health, '#FF5D73', 'Health') + '</div></div>' +
      '<div class="mini-grid">' + BAL.CLINIC.filter(function (c) { return !c.adultOnly || l.age >= 18; }).map(function (c) {
        var cost = G.clinicCost(l, c);
        var cures = ill && (ill.cure === c.id || c.id === 'hospital');
        return '<div class="mini-card' + (cures ? ' glow' : '') + '"><span class="mini-emoji">' + c.emoji + '</span><b>' + c.name + '</b><small>' + c.desc + '</small><span>' + fxChips(c.fx) + '</span>' +
          btn(cost ? '🪙 ' + fmt(cost) : 'Free!', 'do', a('fn', 'clinic') + a('a1', c.id), 'small' + (cures ? ' primary' : '')) + '</div>';
      }).join('') + '</div>' +
      '<h3 class="sub">🌟 Healthy habits</h3><ul class="habits"><li>🍎 Eat fruit and vegetables</li><li>🏃 Move your body every day</li><li>😴 Get plenty of sleep</li><li>🪥 Brush your teeth twice a day</li><li>💧 Drink lots of water</li><li>🤗 Talk about your feelings</li></ul>';
    return out;
  }

  function panelChores(l) {
    var done = l.chores.filter(function (c) { return c.done; }).length;
    return head('✅', 'Daily Jobs', 'Everyday responsibilities. Tick them all off for a bonus!') +
      '<div class="progress-label">' + done + ' of ' + l.chores.length + ' done</div>' + bar(l.chores.length ? done / l.chores.length * 100 : 0, 'linear-gradient(90deg,#69DB7C,#20C997)', 'Daily jobs done') +
      '<div class="chore-list">' + l.chores.map(function (c, i) {
        return '<button class="chore' + (c.done ? ' done' : '') + '" data-act="do" data-fn="chore"' + a('a1', i) + (c.done ? ' disabled' : '') + '><span class="chore-box">' + (c.done ? '✔' : '') + '</span><span class="chore-emoji">' + c.e + '</span><span>' + esc(c.t) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="tip">⭐ Finishing all your daily jobs makes you happier and healthier' + (l.age < 18 ? ', earns 10 coins, and makes your family more likely to say yes to a pet!' : '!') + ' Jobs you forget make you a little grumpy. New jobs arrive every year. Done so far: <b>' + l.totals.helper + '</b> years.</div>';
  }

  function panelTowns(l) {
    var lvl = function (v) { return v >= 1.3 ? 'High' : v >= 1 ? 'Medium' : 'Low'; };
    var stat = function (id) { return statInfo(id).emoji + ' ' + statInfo(id).name; };
    return head('🗺️', 'Towns, Cities & Villages', 'Every place is different! Grown-ups can move.') +
      '<div class="town-grid big">' + BAL.TOWNS.map(function (t) {
        var here = t.id === l.townId;
        return '<div class="town-card' + (here ? ' on' : '') + '" style="--t1:' + t.colors[0] + ';--t2:' + t.colors[1] + '"><span class="town-emoji">' + t.emoji + '</span><b>' + esc(t.name) + '</b><small>' + esc(t.kind) + '</small><span class="town-desc">' + esc(t.desc) + '</span>' +
          '<div class="town-facts"><span>💼 Pay: ' + lvl(t.pay) + '</span><span>🏷️ Prices: ' + lvl(t.price) + '</span><span>✨ Bonus: ' + stat(t.bonus) + '</span></div>' +
          (here ? '<span class="tag ok">📍 You live here</span>' : (l.age >= 18 ? btn('Move here (🪙 ' + fmt(500 * t.price) + ')', 'confirm', a('fn', 'moveTown') + a('a1', t.id), 'small') : '')) + '</div>';
      }).join('') + '</div>' + (l.age < 18 ? '<div class="tip">🧳 You can move to a new place when you\'re 18.</div>' : '');
  }

  function panelStory(l) {
    var stickers = BAL.ACHIEVEMENTS.map(function (x) {
      var got = l.achievements.indexOf(x.id) >= 0;
      return '<div class="sticker-slot' + (got ? ' got' : '') + '" title="' + esc(x.desc) + '"><span class="sticker">' + (got ? x.emoji : '❔') + '</span><b>' + (got ? esc(x.name) : '???') + '</b><small>' + esc(x.desc) + '</small></div>';
    }).join('');
    var log = l.log.slice().reverse().slice(0, 80).map(function (e) { return '<li><span class="tl-age">' + e.age + '</span><span class="tl-e">' + e.e + '</span><span>' + esc(e.t) + '</span></li>'; }).join('');
    var p = Store.active();
    var hall = p && p.hall.length ? '<h3 class="sub">🏆 Hall of Fame <small>(your past lives)</small></h3><div class="hall">' + p.hall.slice().reverse().map(hallCard).join('') + '</div>' : '';
    return head('📖', 'My Story', 'Your stickers and life memories.') +
      '<h3 class="sub">🌟 Sticker Book <small>' + l.achievements.length + ' / ' + BAL.ACHIEVEMENTS.length + '</small></h3><div class="sticker-grid">' + stickers + '</div>' +
      '<h3 class="sub">🕰️ Timeline</h3><ul class="timeline">' + log + '</ul>' + hall;
  }
  function hallCard(h) {
    return '<div class="hall-card"><div class="hall-av">' + BAL.avatar(h.look, h.age, 90, { bg: '#FFF8E1' }) + '</div><div><b>' + esc(h.name) + '</b> <span class="muted small">lived to ' + h.age + '</span><div class="small">' + esc(h.job) + ' · ' + h.townEmoji + ' ' + esc(h.town) + '</div><div>' + '⭐'.repeat(h.stars) + '</div></div></div>';
  }

  /* ---------- End of life ---------- */
  function endOfLife() {
    var p = Store.active(), l = life();
    if (!p || !l || !l.ended) return;
    if (!l.savedToHall) { p.hall.push(G.summary(l)); l.savedToHall = true; save(); }
    S.screen = 'end';
    // Wait for any open modals to finish first; render() will show the end screen.
    if (!S.modal) render();
  }

  function renderEnd() {
    var p = Store.active(), l = life();
    if (!l) return '';
    if (!l.savedToHall && p) { p.hall.push(G.summary(l)); l.savedToHall = true; save(); }
    var s = G.summary(l);
    var kids = G.children(l);
    var facts = [
      ['🎂', 'Lived to', s.age], ['💼', 'Best job', s.job], ['🎓', 'Education', s.edu], ['📍', 'Home town', s.townEmoji + ' ' + s.town],
      ['👶', 'Children', s.children], ['🍼', 'Grandchildren', s.grandchildren], ['🤝', 'Friends made', s.friends], ['🐾', 'Pets adopted', s.pets],
      ['🪙', 'Coins earned', fmt(s.earned)], ['😊', 'Average happiness', s.avgHappy], ['🌟', 'Stickers', s.stickers + ' / ' + BAL.ACHIEVEMENTS.length], ['💍', 'Married', s.married ? 'Yes 💕' : 'No']
    ].map(function (f) { return '<div class="fact"><span>' + f[0] + '</span><small>' + f[1] + '</small><b>' + esc(f[2]) + '</b></div>'; }).join('');
    var highlights = l.log.filter(function (e) { return !/^Sticker unlocked/.test(e.t); }).filter(function (e) { return ['👶', '🎒', '🎓', '💼', '⬆️', '💍', '💒', '🏠', '🏡', '🐶', '🐱', '🏖️', '🪪', '🗺️', '👵', '🤝'].indexOf(e.e) >= 0 || /Bought|Adopted|Married|Promoted|Graduated|Got a job/.test(e.t); }).slice(0, 14)
      .map(function (e) { return '<li><span class="tl-age">' + e.age + '</span><span class="tl-e">' + e.e + '</span><span>' + esc(e.t) + '</span></li>'; }).join('');
    var stickers = l.achievements.map(function (id) { var x = byId(BAL.ACHIEVEMENTS, id); return x ? '<span class="sticker" title="' + esc(x.name) + '">' + x.emoji + '</span>' : ''; }).join('');
    return topbar() + '<main class="end-screen"><div class="end-card card pop">' +
      '<div class="sparkles" aria-hidden="true">✨🌟✨</div>' +
      '<div class="end-av">' + BAL.avatar(l.look, l.age, 95, { label: l.name }) + '</div>' +
      '<h1>' + esc(l.name) + '\'s Life Story</h1>' +
      '<p class="lead">What a wonderful life! ' + esc(l.name) + ' lived to <b>' + l.age + '</b> and made so many happy memories. 💛</p>' +
      '<div class="life-stars" aria-label="' + s.stars + ' out of 5 life stars">' + '⭐'.repeat(s.stars) + '<span class="dim">' + '⭐'.repeat(5 - s.stars) + '</span></div>' +
      '<div class="facts">' + facts + '</div>' +
      (stickers ? '<h3 class="sub">🌟 Stickers collected</h3><div class="shelf stickers">' + stickers + '</div>' : '') +
      (highlights ? '<h3 class="sub">📸 Life highlights</h3><ul class="timeline">' + highlights + '</ul>' : '') +
      '<h2 class="section-title">What next?</h2><div class="end-actions">' +
      (kids.length ? '<div class="card next-card"><b>👶 Play as your child</b><p class="small">Carry on the family story! They get half your coins.</p><div class="btn-row">' + kids.map(function (k) { return btn(esc(k.name) + ' (' + k.age + ')', 'asChild', a('id', k.id), 'primary'); }).join('') + '</div></div>' : '') +
      '<div class="card next-card"><b>✨ Start a brand new life</b><p class="small">Make a new character and begin again as a baby.</p>' + btn('🍼 New life', 'newLife', '', 'primary big') + '</div>' +
      '<div class="card next-card"><b>👥 Switch player</b><p class="small">Let someone else have a turn.</p>' + btn('👥 Players', 'goProfiles', '', 'big') + '</div>' +
      '</div></div></main>';
  }

  /* ====================== Age up flow ====================== */
  function ageUp() {
    var l = life(); if (!l) return;
    var rep = G.ageUp(l);
    save();
    if (!rep) return;
    S.tab = S.tab || 'activities';
    render();
    var plus = rep.money.filter(function (m) { return m.v > 0; }), minus = rep.money.filter(function (m) { return m.v < 0; });
    var moneyHtml = rep.money.length ? '<details class="money"' + (l.age === 18 || l.age === 19 ? ' open' : '') + '><summary>🪙 This year\'s coins: <b class="' + (rep.net < 0 ? 'neg' : 'pos') + '">' + (rep.net >= 0 ? '+' : '') + fmt(rep.net) + '</b></summary><ul>' +
      plus.concat(minus).map(function (m) { return '<li><span>' + m.e + ' ' + esc(m.t) + '</span><b class="' + (m.v < 0 ? 'neg' : 'pos') + '">' + (m.v > 0 ? '+' : '') + fmt(m.v) + '</b></li>'; }).join('') + '</ul></details>' : '';
    var lines = rep.lines.concat(rep.notes).map(function (x) { return '<li><span>' + x.e + '</span> ' + esc(x.t) + '</li>'; }).join('');
    var candles = Math.min(l.age, 10);
    var cake = '<div class="cake-art" aria-hidden="true"><div class="candles">' + new Array(candles + 1).join('<i></i>') + '</div><div class="cake-top"></div><div class="cake-body"><span>' + l.age + '</span></div></div>';
    openModal({ cls: 'birthday', title: rep.ended ? 'Happy ' + l.age + 'th Birthday!' : '🎉 Happy Birthday, ' + esc(l.name) + '! 🎉',
      html: cake + '<p class="lead">You are now <b>' + l.age + '</b> year' + (l.age === 1 ? '' : 's') + ' old!</p>' +
        '<p class="gift">🎁 You got ' + esc(rep.gift.item) + (rep.gift.coins ? ' and <b>' + rep.gift.coins + ' coins</b> from your family!' : '!') + '</p>' +
        (lines ? '<ul class="year-lines">' + lines + '</ul>' : '') + moneyHtml,
      buttons: [{ label: 'Yay! 🎈' }],
      onOpen: function () { BAL.sound('birthday'); confetti(true); floaty('🎈'); } });
    rep.celebrations.forEach(function (c) {
      openModal({ emoji: c.e, title: esc(c.t), html: '<p class="lead">' + esc(c.d) + '</p>', buttons: [{ label: 'Hooray! 🎉' }], onOpen: function () { BAL.sound('tada'); confetti(false); } });
    });
    if (rep.choice === 'future') futureModal();
    if (rep.event) eventModal(rep.event);
    showAchievements(l);
    if (rep.ended) {
      openModal({ emoji: '🌟', title: 'A Wonderful Life', cls: 'ending',
        html: '<p class="lead">After ' + l.age + ' amazing years, ' + esc(l.name) + '\'s life story is complete.</p><p>They made so many memories, and the people who love them will remember them forever. 💛</p>',
        buttons: [{ label: 'See my life story 📖', fn: function () { endOfLife(); } }], onOpen: function () { BAL.sound('tada'); } });
      endOfLife();
    }
  }

  function futureModal() {
    openModal({ emoji: '🧭', title: 'What will you do next?', html: '<p>You\'re 18 and have finished school. Choose your path! (You can change your mind later.)</p>',
      buttons: [
        { label: '🎓 Go to University <small>(3 years)</small>', cls: 'primary', fn: function () { feedback(G.run(life(), 'chooseFuture', 'uni')); } },
        { label: '🏫 Go to College <small>(2 years)</small>', cls: 'primary', fn: function () { feedback(G.run(life(), 'chooseFuture', 'college')); } },
        { label: '💼 Start working', fn: function () { S.tab = 'school'; feedback(G.run(life(), 'chooseFuture', 'work')); } },
        { label: '🎒 Take a gap year', fn: function () { feedback(G.run(life(), 'chooseFuture', 'gap')); } }
      ] });
  }

  function eventModal(id) {
    var e = byId(BAL.EVENTS, id);
    if (!e) return;
    openModal({ emoji: e.emoji, title: esc(e.title), html: '<p class="lead">' + esc(e.text) + '</p>', cls: 'event',
      buttons: e.choices.map(function (c, i) { return { label: esc(c.t), cls: 'primary', fn: function () { feedback(G.run(life(), 'resolveEvent', id, i)); } }; }) });
  }

  /* ====================== Click handling ====================== */
  function nameModal(cfg) {
    var genderPick = cfg.gender ? '<div class="field"><span>Boy or girl?</span><div class="pick-row center">' +
      '<button class="pick chip on" data-pick="g" data-val="girl">👧 Girl</button><button class="pick chip" data-pick="g" data-val="boy">👦 Boy</button></div></div>' : '';
    openModal({ emoji: cfg.emoji, title: cfg.title, html: (cfg.text ? '<p>' + cfg.text + '</p>' : '') + genderPick +
      '<label class="field"><span>' + cfg.label + '</span><div class="name-row"><input name="n" maxlength="20" value="' + esc(cfg.value || '') + '" autocomplete="off"><button class="btn" type="button" data-randname="' + (cfg.pet ? 'pet' : 'person') + '" aria-label="Random name">🎲</button></div></label>',
      buttons: [{ label: cfg.ok, fn: function (m) { var v = m.querySelector('input[name="n"]').value.trim(); cfg.fn(v, pickedVal('g')); } }, { label: 'Cancel', cls: 'ghost' }] });
  }

  var CONFIRMS = {
    quitJob: ['👋', 'Quit your job?', 'You won\'t get paid until you find a new job.'],
    retire: ['🏖️', 'Retire from work?', 'You\'ll get a pension every year and lots of free time!'],
    sellHome: ['🪧', 'Sell your home?', 'You\'ll get the coins back (minus anything still owed) and move into a tiny flat.'],
    separate: ['🍂', 'Go separate ways?', 'Sometimes people are happier apart. You\'ll stay friends.'],
    rehomePet: ['🌾', 'Find your pet a new home?', 'They will go to live on a lovely farm with a kind family.'],
    buyHome: ['🔑', 'Buy this home?', ''],
    moveTown: ['🧳', 'Move to a new town?', '']
  };

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var actName = el.getAttribute('data-act');
    var d = function (k) { return el.getAttribute('data-' + k); };
    var l = life();
    switch (actName) {
      case 'goProfiles': S.screen = 'profiles'; BAL.sound('click'); render(); break;
      case 'sound': Store.data.sound = !Store.data.sound; save(); BAL.sound('click'); render(); break;
      case 'help': helpModal(); break;
      case 'newProfile': newProfileModal(); break;
      case 'pickProfile': {
        Store.data.activeId = d('id'); save(); BAL.sound('click');
        var p = Store.active();
        if (!p.life) startCreator();
        else { S.screen = p.life.ended ? 'end' : 'game'; render(); window.scrollTo(0, 0); }
        break;
      }
      case 'delProfile': {
        var pp = Store.profile(d('id'));
        openModal({ emoji: '🗑️', title: 'Delete ' + esc(pp.name) + '?', html: '<p>This will delete this player and all their lives. This can\'t be undone!</p>',
          buttons: [{ label: 'Yes, delete', cls: 'danger', fn: function () { Store.removeProfile(pp.id); } }, { label: 'No, keep it', cls: 'primary' }] });
        break;
      }
      case 'look': S.creator.look[d('k')] = d('v'); BAL.sound('click'); render(); break;
      case 'cset': S.creator[d('k')] = d('v'); BAL.sound('click'); render(); break;
      case 'ctown': S.creator.townId = d('v'); BAL.sound('click'); render(); break;
      case 'previewAge': S.previewAge = +d('v'); BAL.sound('click'); render(); break;
      case 'randName': S.creator.name = G.randomName(S.creator.gender); render(); break;
      case 'randomChar': {
        var g = G.pick(['girl', 'boy', 'any']);
        Object.assign(S.creator, { name: G.randomName(g), gender: g, look: G.randomLook(), townId: G.pick(BAL.TOWNS).id });
        BAL.sound('good'); render(); break;
      }
      case 'startLife': {
        var c = S.creator;
        if (!c.name || !c.name.trim()) { var inp = document.getElementById('cname'); inp.classList.add('shake'); inp.focus(); return; }
        var prof = Store.active();
        prof.life = G.newLife({ name: c.name, gender: c.gender, look: c.look, townId: c.townId, familyType: c.familyType });
        save(); S.screen = 'game'; S.tab = 'activities'; render(); window.scrollTo(0, 0);
        BAL.sound('tada'); confetti(true);
        var fam = prof.life.people.filter(function (x) { return ['mum', 'dad', 'grandma', 'grandpa'].indexOf(x.role) >= 0; }).map(function (x) { return x.name; });
        openModal({ html: '<div class="welcome-av">' + BAL.avatar(prof.life.look, 0, 95) + '</div><p class="lead">Welcome to the world, <b>' + esc(prof.life.name) + '</b>!</p><p>You were born in ' + G.town(prof.life).emoji + ' <b>' + esc(G.town(prof.life).name) + '</b>' + (fam.length ? ' to ' + esc(fam.join(' and ')) : '') + '.</p>' +
          '<ul class="year-lines"><li><span>🎈</span> Do <b>activities</b> using your ⚡ energy.</li><li><span>✅</span> Finish your <b>daily jobs</b>.</li><li><span>🎂</span> Press <b>Age Up</b> to have a birthday and grow!</li></ul>',
          title: 'It\'s a new life! 👶', buttons: [{ label: 'Let\'s go! 🚀' }] });
        break;
      }
      case 'tab': S.tab = d('id'); BAL.sound('click'); render(); var pn = document.getElementById('panel'); if (pn && window.innerWidth < 900) pn.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); break;
      case 'shopCat': S.shopCat = d('id'); BAL.sound('click'); render(); break;
      case 'ageUp': ageUp(); break;
      case 'do': {
        var a1 = d('a1'), fn = d('fn');
        if (fn === 'chore') a1 = +a1;
        act(fn, a1, d('a2'));
        break;
      }
      case 'confirm': {
        var cf = CONFIRMS[d('fn')] || ['❓', 'Are you sure?', ''];
        var text = cf[2], fn2 = d('fn'), arg = d('a1');
        if (fn2 === 'buyHome') { var hm = byId(BAL.HOMES, arg), pr = G.price(l, hm.price); text = hm.emoji + ' <b>' + hm.name + '</b> costs 🪙 ' + fmt(pr) + '. You pay 🪙 ' + fmt(pr * BAL.HOME_DEPOSIT) + ' now, then 🪙 ' + fmt(Math.ceil(pr * (1 - BAL.HOME_DEPOSIT) / BAL.HOME_LOAN_YEARS)) + ' a year for 20 years.'; }
        if (fn2 === 'moveTown') { var tw = byId(BAL.TOWNS, arg); text = 'Move to ' + tw.emoji + ' <b>' + esc(tw.name) + '</b>? It costs 🪙 ' + fmt(500 * tw.price) + ' to move.'; }
        openModal({ emoji: cf[0], title: cf[1], html: '<p>' + text + '</p>', buttons: [{ label: 'Yes!', fn: function () { act(fn2, arg); } }, { label: 'No', cls: 'ghost' }] });
        break;
      }
      case 'wedding': {
        var pid = d('id');
        openModal({ emoji: '💒', title: 'Plan your wedding', html: '<p>What kind of wedding would you like?</p>',
          buttons: [
            { label: '🌸 Small & cosy <small>🪙 ' + fmt(G.weddingCost(l, 'small')) + '</small>', fn: function () { act('wedding', pid, 'small'); } },
            { label: '🏰 Big & fancy <small>🪙 ' + fmt(G.weddingCost(l, 'big')) + '</small>', fn: function () { act('wedding', pid, 'big'); } },
            { label: 'Not yet', cls: 'ghost' }] });
        break;
      }
      case 'findLove': {
        openModal({ emoji: '💘', title: 'Find a sweetheart', html: '<p>Who would you like to meet?</p>',
          buttons: [{ label: '👩 A woman', fn: function () { act('findLove', 'girl'); } }, { label: '👨 A man', fn: function () { act('findLove', 'boy'); } }, { label: '🌈 Anyone!', fn: function () { act('findLove', 'any'); } }, { label: 'Cancel', cls: 'ghost' }] });
        break;
      }
      case 'baby': {
        var kind = d('kind');
        var fee = G.price(l, 1000);
        nameModal({ emoji: kind === 'haveBaby' ? '👶' : '🏡', title: kind === 'haveBaby' ? 'A new baby!' : 'Adopt a child', gender: true,
          text: kind === 'adoptChild' ? 'Give a child a loving forever home. Adoption costs 🪙 ' + fmt(fee) + '.' : 'Your family is growing! What will you call your baby?',
          label: 'Name', value: G.randomName('girl'), ok: kind === 'haveBaby' ? 'Welcome, baby! 💕' : 'Adopt 💛', fn: function (name, gen) { act(kind, name, gen); } });
        break;
      }
      case 'adoptPet': {
        var k = byId(BAL.PETS, d('kind'));
        if (l.age < 18 && (l.age < 5 || l.flags.askedPet)) { act('adoptPet', k.id); break; }
        nameModal({ emoji: k.emoji, title: (l.age < 18 ? 'Ask for a ' : 'Adopt a ') + k.name, label: 'What will you name your ' + k.name.toLowerCase() + '?', value: G.pick(BAL.NAMES.pets), pet: true,
          text: l.age < 18 ? 'Your family might say yes… fingers crossed! 🤞' : 'Adoption fee: 🪙 ' + fmt(G.price(l, k.fee)),
          ok: l.age < 18 ? 'Ask nicely 🙏' : 'Adopt 💕', fn: function (name) { act('adoptPet', k.id, name); } });
        break;
      }
      case 'asChild': {
        var p2 = Store.active();
        var nl = G.continueAsChild(l, d('id'));
        if (nl) { p2.life = nl; save(); S.screen = 'game'; S.tab = 'activities'; render(); window.scrollTo(0, 0); confetti(true); BAL.sound('tada'); toast('You are now playing as ' + nl.name + '!', '🌟', 'good'); }
        break;
      }
      case 'newLife': {
        var old = l;
        startCreator(old ? { townId: old.townId } : null);
        break;
      }
    }
  }

  function helpModal() {
    openModal({ emoji: '❓', title: 'How to play', cls: 'help', html:
      '<ul class="year-lines">' +
      '<li><span>👶</span> You start as a baby and live a whole life, year by year.</li>' +
      '<li><span>⚡</span> Each year you have some <b>energy</b>. Use it on activities, studying, work, friends and pets.</li>' +
      '<li><span>🎂</span> Press <b>Age Up</b> to have a birthday. Coins come in and bills go out.</li>' +
      '<li><span>😊</span> Keep your <b>Happiness, Health, Smarts and Fitness</b> high!</li>' +
      '<li><span>✅</span> Finish your <b>Daily Jobs</b> each year for a bonus.</li>' +
      '<li><span>🏫</span> Go to school, then college or university, then get a job you love.</li>' +
      '<li><span>🪙</span> Save coins to buy things, homes and cars. Coins are pretend — no real money!</li>' +
      '<li><span>🐾</span> Adopt pets, make friends, fall in love and build a family.</li>' +
      '<li><span>📖</span> Collect stickers in your Sticker Book.</li>' +
      '<li><span>🔊</span> Tap the speaker on any pop-up to hear it read aloud.</li>' +
      '</ul>', buttons: [{ label: 'Got it! 👍' }] });
  }

  function onInput(e) {
    if (e.target.id === 'cname' && S.creator) {
      S.creator.name = e.target.value;
      var pv = document.getElementById('pvname'); if (pv) pv.textContent = e.target.value || '…';
    }
  }
  function onKey(e) {
    if (!S.modal) return;
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { var b = $modal.querySelector('[data-mbtn="0"]'); if (b) b.click(); }
    if (e.key === 'Escape') {
      var btns = S.modal.buttons || [{ label: 'OK' }];
      var cancel = btns.length > 1 && /Cancel|No|Not yet/.test(btns[btns.length - 1].label);
      if (cancel || btns.length <= 1 && !btns[0].fn) { stopSpeaking(); nextModal(); render(); }
    }
  }

  UI.init = function () {
    $app = document.getElementById('app');
    $modal = document.getElementById('modal-root');
    $toasts = document.getElementById('toasts');
    $fx = document.getElementById('fx');
    Store.load();
    var p = Store.active();
    if (p && p.life) S.screen = p.life.ended ? 'end' : 'game';
    document.addEventListener('click', function (e) { if ($modal.contains(e.target)) modalClick(e); else onClick(e); });
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    render();
  };
  UI._state = S; // for debugging/tests
})(globalThis.BAL = globalThis.BAL || {});
