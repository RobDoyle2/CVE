/* Build a Life — game engine. Pure game logic, no DOM. Every action is called via
   BAL.Game.run(life, 'actionName', ...args) which returns
   { ok, msg, emoji, diffs:[{stat,d}], coinsDelta, ...extra }. */
(function (BAL) {
  'use strict';
  var G = BAL.Game = {};

  /* ---------- helpers ---------- */
  G.rng = Math.random;
  function r() { return G.rng(); }
  function randInt(a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  function clamp(v, lo, hi) { return Math.max(lo === undefined ? 0 : lo, Math.min(hi === undefined ? 100 : hi, v)); }
  var idCounter = 0;
  function uid() { idCounter += 1; return Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + Math.floor(r() * 1e6).toString(36); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function fmt(n) { return Math.round(n).toLocaleString('en-GB'); }
  G.fmt = fmt; G.byId = byId; G.clamp = clamp; G.randInt = randInt; G.pick = pick; G.uid = uid;

  function ok(msg, emoji, extra) { return Object.assign({ ok: true, msg: msg, emoji: emoji || '✨' }, extra || {}); }
  function no(msg, emoji) { return { ok: false, msg: msg, emoji: emoji || '🙈' }; }

  /* ---------- lookups ---------- */
  G.stage = function (age) {
    if (age <= 2) return 'baby';
    if (age <= 12) return 'child';
    if (age <= 17) return 'teen';
    if (age <= 64) return 'adult';
    return 'elder';
  };
  G.town = function (life) { return byId(BAL.TOWNS, life.townId) || BAL.TOWNS[0]; };
  G.person = function (life, pid) { return byId(life.people, pid); };
  G.job = function (life) { return life.job ? byId(BAL.JOBS, life.job.id) : null; };
  G.price = function (life, base) { return Math.round(base * G.town(life).price); };
  G.isAdult = function (life) { return life.age >= 18; };

  G.randomName = function (gender) {
    var list = gender === 'girl' ? BAL.NAMES.girl : gender === 'boy' ? BAL.NAMES.boy : BAL.NAMES.girl.concat(BAL.NAMES.boy, BAL.NAMES.any);
    return pick(list);
  };
  G.randomLook = function () {
    var L = BAL.LOOKS;
    return {
      skin: pick(L.skins), hairColor: pick(L.hairColors.slice(0, 6)), hair: pick(L.hairStyles).id,
      eyes: pick(L.eyes), outfit: pick(L.outfits), accessory: r() < 0.25 ? pick(['glasses', 'bow', 'cap', 'flower', 'headband']) : 'none'
    };
  };
  function randomGender() { return pick(['girl', 'boy']); }

  /* ---------- stats, coins, achievements ---------- */
  function applyFx(life, fx, mult) {
    if (!fx) return;
    var bonus = G.town(life).bonus;
    Object.keys(fx).forEach(function (k) {
      if (!(k in life.stats)) return;
      var d = Math.round(fx[k] * (mult || 1));
      if (d > 0 && k === bonus) d += 1;
      var before = life.stats[k];
      life.stats[k] = clamp(before + d);
      var real = life.stats[k] - before;
      if (real !== 0 && life._diffs) life._diffs.push({ stat: k, d: real });
    });
  }
  G.applyFx = applyFx;

  function addCoins(life, n) {
    n = Math.round(n);
    life.coins = Math.max(0, life.coins + n);
    if (n > 0) life.totals.earned += n;
    if (life._diffs) life._coins = (life._coins || 0) + n;
  }

  function unlock(life, id) {
    if (life.achievements.indexOf(id) >= 0) return;
    if (!byId(BAL.ACHIEVEMENTS, id)) return;
    life.achievements.push(id);
    life.newAch.push(id);
    var a = byId(BAL.ACHIEVEMENTS, id);
    addLog(life, 'Sticker unlocked: ' + a.name, a.emoji);
  }
  G.unlock = unlock;

  function checkAchievements(life) {
    var kids = life.people.filter(function (p) { return p.role === 'child'; }).length;
    if (life.coins >= 100000) unlock(life, 'rich');
    if (life.coins >= 1000000) unlock(life, 'millionaire');
    if (life.stats.fitness >= 95) unlock(life, 'fit');
    if (life.stats.smarts >= 95) unlock(life, 'brainy');
    if (life.pets.length >= 3) unlock(life, 'pet_lover');
    if (kids >= 3) unlock(life, 'big_family');
    if (life.totals.items >= 10) unlock(life, 'shopper');
    if (life.totals.holidays >= 3) unlock(life, 'traveller');
    if (life.totals.kind >= 5) unlock(life, 'kind');
    if (life.totals.helper >= 10) unlock(life, 'helper');
    if (life.age >= 100) unlock(life, 'century');
  }
  G.checkAchievements = checkAchievements;

  function addLog(life, text, emoji) { life.log.push({ age: life.age, year: life.year, t: text, e: emoji || '•' }); }
  G.addLog = addLog;

  function needEnergy(life) { return life.energy >= 1; }
  var TIRED = 'You are out of energy ⚡ for this year! Tap "Age Up" to rest and grow.';

  /* ---------- creating a life ---------- */
  function freshName(life, gender) {
    var taken = [life.name].concat(life.people.map(function (p) { return p.name; }));
    var n = G.randomName(gender);
    for (var i = 0; i < 12 && taken.indexOf(n) >= 0; i++) n = G.randomName(gender);
    return n;
  }
  G.freshName = freshName;

  function makePerson(role, age, gender, extra) {
    return Object.assign({
      id: uid(), role: role, name: G.randomName(gender), gender: gender, age: age,
      look: G.randomLook(), close: randInt(55, 75), lifeEnd: randInt(86, 100)
    }, extra || {});
  }
  G.makePerson = makePerson;

  G.newLife = function (o) {
    o = o || {};
    var age = o.age || 0;
    var life = {
      v: 1, id: uid(), name: (o.name || 'Sam').trim().slice(0, 20), gender: o.gender || 'any',
      look: Object.assign(G.randomLook(), o.look || {}), townId: o.townId || 'maple', familyType: o.familyType || 'mumdad',
      age: age, year: (o.year || BAL.START_YEAR) + age, generation: o.generation || 1,
      stats: { happy: 85, health: randInt(82, 95), smarts: randInt(10, 22), fitness: randInt(10, 22) },
      coins: o.coins || 0, energy: 0, maxEnergy: 0,
      edu: { level: 0, grade: 50, course: null, clubs: [] },
      job: null, partTime: null, retired: false, pension: 0, bestJob: null,
      home: { type: 'family' }, cars: [], licence: false,
      people: [], pets: [], inventory: [], unlocked: [], remembered: [],
      sick: null, chores: [], log: [], achievements: [], newAch: [],
      lifeEnd: randInt(86, 101), ended: false, seen: {},
      flags: {},
      totals: { earned: 0, items: 0, holidays: 0, kind: 0, helper: 0, activities: 0, happySum: 0, years: 0, petsAdopted: 0, friendsMade: 0 }
    };
    if (o.stats) Object.assign(life.stats, o.stats);
    if (life.look.accessory === 'crown') life.look.accessory = 'none';

    if (o.parents) {
      o.parents.forEach(function (p) { life.people.push(p); });
    } else {
      var fam = byId(BAL.FAMILY_TYPES, life.familyType) || BAL.FAMILY_TYPES[0];
      fam.roles.forEach(function (role) {
        var g = (role === 'mum' || role === 'grandma') ? 'girl' : 'boy';
        var pAge = role === 'grandma' || role === 'grandpa' ? randInt(55, 64) : randInt(25, 38);
        life.people.push(makePerson(role, pAge + age, g, { close: randInt(80, 95), name: freshName(life, g) }));
      });
    }
    if (o.siblings) {
      o.siblings.forEach(function (s) { life.people.push(s); });
    } else {
      var nSib = randInt(0, 2);
      for (var i = 0; i < nSib; i++) {
        var sg = randomGender();
        life.people.push(makePerson('sibling', randInt(1, 8) + age, sg, { close: randInt(60, 85), name: freshName(life, sg) }));
      }
    }

    // Starting part-way through life (playing as your child).
    if (age >= 11) life.edu.level = 1;
    if (age >= 18) { life.edu.level = 2; life.home = { type: 'rent', id: 'tinyflat' }; }
    if (age >= 3) { life.stats.smarts = clamp(30 + age * 2 + randInt(0, 10)); life.stats.fitness = randInt(35, 60); }

    resetYear(life);
    addLog(life, age === 0 ? 'Born in ' + G.town(life).name + '! Welcome to the world, ' + life.name + '.' : life.name + ' starts their own story at age ' + age + '.', age === 0 ? '👶' : '🌟');
    return life;
  };

  function resetYear(life) {
    var st = G.stage(life.age);
    var max = BAL.STAGES[st].energy;
    if (life.partTime) max -= 1;
    if (life.job) max -= 1;
    life.maxEnergy = Math.max(3, max);
    life.energy = life.maxEnergy;
    life.chores = makeChores(life);
    life.flags.askedPet = false;
    life.flags.babyYear = false;
  }

  function makeChores(life) {
    var st = G.stage(life.age);
    var pool = BAL.CHORES[st].slice();
    var out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    if (life.pets.length) out.push(pick(BAL.CHORES.pet));
    var littleKids = life.people.some(function (p) { return p.role === 'child' && p.age >= 4 && p.age < 12; });
    if (littleKids) out.push(pick(BAL.CHORES.kids));
    return out.map(function (c) { return { t: c.t, e: c.e, done: false }; });
  }

  /* ---------- run wrapper ---------- */
  G.run = function (life, name) {
    var args = Array.prototype.slice.call(arguments, 2);
    if (life.ended) return no('This life story is complete. Start a new one!', '📕');
    if (typeof G.actions[name] !== 'function') return no('Unknown action');
    life._diffs = []; life._coins = 0;
    var res = G.actions[name].apply(null, [life].concat(args)) || ok('');
    res.diffs = life._diffs; res.coinsDelta = life._coins;
    delete life._diffs; delete life._coins;
    if (res.ok) checkAchievements(life);
    return res;
  };
  var A = G.actions = {};

  /* ---------- activities ---------- */
  G.activities = function (life) {
    return BAL.ACTIVITIES.filter(function (a) { return life.age >= a.min && life.age <= a.max; });
  };
  G.activityCost = function (life, a) {
    if (!a.cost) return 0;
    if (life.age < 16) return 0; // your family pays when you're young
    return G.price(life, a.cost);
  };

  A.activity = function (life, id) {
    var a = byId(BAL.ACTIVITIES, id);
    if (!a || life.age < a.min || life.age > a.max) return no('You can\'t do that right now.');
    if (!needEnergy(life)) return no(TIRED, '😴');
    var cost = G.activityCost(life, a);
    if (cost > life.coins) return no('You need ' + fmt(cost) + ' coins for that. 🪙', '🪙');
    life.energy -= 1;
    if (cost) addCoins(life, -cost);
    applyFx(life, a.fx);
    if (a.earn) addCoins(life, randInt(a.earn[0], a.earn[1]));
    if (a.family) life.people.forEach(function (p) { if (['mum', 'dad', 'grandma', 'grandpa', 'sibling', 'child', 'spouse', 'grandchild'].indexOf(p.role) >= 0) p.close = clamp(p.close + a.family); });
    if (a.friends) life.people.forEach(function (p) { if (p.role === 'friend') p.close = clamp(p.close + a.friends); });
    if (a.kind) life.totals.kind += 1;
    if (a.counter) life.totals[a.counter] = (life.totals[a.counter] || 0) + 1;
    if (a.ach) unlock(life, a.ach);
    life.totals.activities += 1;
    if (a.id === 'holiday') addLog(life, 'Went on a lovely holiday', '✈️');
    return ok(a.msg, a.emoji);
  };

  /* ---------- school & study ---------- */
  G.school = function (life) {
    var t = G.town(life);
    if (life.edu.course) {
      var c = BAL.COURSES[life.edu.course.id];
      return { kind: 'course', name: t.name + ' ' + c.name, emoji: c.emoji, label: c.name + ' — year ' + (life.edu.course.done + 1) + ' of ' + c.years };
    }
    if (life.age < 3) return null;
    if (life.age < 5) return { kind: 'nursery', name: t.school + ' Nursery', emoji: '🎨', label: 'Nursery' };
    if (life.age < 11) return { kind: 'primary', name: t.school + ' Primary School', emoji: '🎒', label: 'Primary School — Year ' + (life.age - 4) };
    if (life.age < 18) return { kind: 'secondary', name: t.school + ' High School', emoji: '🏫', label: 'Secondary School — Year ' + (life.age - 4) };
    return null;
  };
  G.gradeStars = function (life) { return clamp(1 + Math.floor(life.edu.grade / 20.01), 1, 5); };

  A.study = function (life) {
    var s = G.school(life);
    if (!s || s.kind === 'nursery') return no('There\'s nothing to study right now.');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    applyFx(life, { smarts: randInt(4, 6), happy: -1 });
    life.edu.grade = clamp(life.edu.grade + randInt(7, 11));
    return ok(pick(['You studied really hard!', 'Homework done, and done well!', 'You aced your practice quiz!', 'Your teacher says you are improving fast!']), '📚');
  };

  A.joinClub = function (life, id) {
    var s = G.school(life);
    if (!s || s.kind === 'nursery') return no('Clubs start when you go to school.');
    var c = byId(BAL.CLUBS, id);
    if (!c) return no('No such club');
    if (life.edu.clubs.indexOf(id) >= 0) return no('You are already in the ' + c.name + '!');
    if (life.edu.clubs.length >= 2) return no('You can be in 2 clubs at once. Leave one first!');
    life.edu.clubs.push(id);
    applyFx(life, { happy: 3 });
    addLog(life, 'Joined the ' + c.name, c.emoji);
    return ok('Welcome to the ' + c.name + '! You\'ll get a boost every year.', c.emoji);
  };
  A.leaveClub = function (life, id) {
    life.edu.clubs = life.edu.clubs.filter(function (x) { return x !== id; });
    return ok('You left the club.', '👋');
  };

  A.chooseFuture = function (life, opt) {
    if (opt === 'uni' || opt === 'college') return A.enrol(life, opt);
    if (opt === 'gap') { applyFx(life, { happy: 10, smarts: 3 }); addLog(life, 'Took a gap year to explore', '🎒'); return ok('A gap year of adventures! Explore and decide later.', '🎒'); }
    addLog(life, 'Decided to start working', '💼');
    return ok('Time to find a job! Visit the Job Centre in School & Work.', '💼');
  };

  A.enrol = function (life, id) {
    var c = BAL.COURSES[id];
    if (!c) return no('No such course');
    if (life.age < 18) return no('You can go to ' + c.name + ' when you are 18.');
    if (life.edu.course) return no('You are already studying!');
    if (life.edu.level < 2) return no('Finish secondary school first.');
    if (life.edu.level >= c.level) return no('You already have that qualification! 🎓');
    if (life.job) return no('Leave your job first so you have time to study.');
    life.edu.course = { id: id, done: 0 };
    life.edu.grade = clamp(Math.max(life.edu.grade, 40));
    applyFx(life, { happy: 5, smarts: 3 });
    addLog(life, 'Started ' + c.name + '!', c.emoji);
    return ok('You started ' + c.name + '! Study hard to get great grades.', c.emoji);
  };

  /* ---------- jobs ---------- */
  G.salary = function (life) {
    var j = G.job(life);
    if (!j) return 0;
    return Math.round(j.pay * BAL.JOB_LEVELS[life.job.level].mult * G.town(life).pay);
  };
  G.jobTitle = function (life) {
    var j = G.job(life);
    if (!j) return null;
    var t = BAL.JOB_LEVELS[life.job.level].title;
    return (t ? t + ' ' : '') + j.name;
  };
  G.jobCheck = function (life, job) {
    var why = [];
    if (life.age < 18) why.push('Be 18 or older');
    if (life.edu.course) why.push('Finish your studies first');
    if (life.edu.level < job.edu) why.push('Needs: ' + BAL.EDU_LEVELS[job.edu]);
    if (life.stats.smarts < job.smarts) why.push('Needs ' + job.smarts + ' 🧠 smarts');
    if (life.stats.fitness < job.fitness) why.push('Needs ' + job.fitness + ' 💪 fitness');
    return { ok: why.length === 0, why: why };
  };

  A.applyJob = function (life, id) {
    var job = byId(BAL.JOBS, id);
    if (!job) return no('No such job');
    if (life.job && life.job.id === id) return no('You already work here!');
    var chk = G.jobCheck(life, job);
    if (!chk.ok) return no('Not yet! ' + chk.why.join(', ') + '.', '📋');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    var chance = clamp(0.55 + life.edu.grade / 400 + (life.stats.smarts - job.smarts) / 250, 0.35, 0.95);
    if (r() > chance) { applyFx(life, { happy: -2 }); return no('The interview was tricky — they chose someone else this time. Keep trying! 💪', '🤞'); }
    life.job = { id: id, level: 0, perf: 35, years: 0 };
    life.retired = false;
    life.bestJob = G.jobTitle(life);
    applyFx(life, { happy: 8 });
    unlock(life, 'first_job');
    if (id === 'astronaut') unlock(life, 'astronaut');
    addLog(life, 'Got a job as a ' + job.name + '!', job.emoji);
    return ok('You got the job! You are now a ' + G.jobTitle(life) + '. 🎉', job.emoji, { celebrate: true });
  };

  A.workHard = function (life) {
    if (!life.job) return no('You don\'t have a job yet.');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    life.job.perf = clamp(life.job.perf + randInt(12, 20));
    applyFx(life, { smarts: 1, happy: -1 });
    return ok(pick(['You worked super hard today!', 'Your boss noticed your great work.', 'You finished a big project!', 'You helped a teammate solve a problem.']), '💼');
  };

  A.askPromotion = function (life) {
    if (!life.job) return no('You don\'t have a job yet.');
    if (life.job.level >= BAL.JOB_LEVELS.length - 1) return no('You are already at the very top! 👑');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    if (life.job.years < 1 || life.job.perf < 70) {
      return no('Your boss says: "Not yet — keep working hard!" (Get your work bar above 70 and work here at least a year.)', '🙂');
    }
    if (r() > life.job.perf / 100 + 0.1) { life.job.perf -= 10; return no('Not this time, but your boss was impressed. Try again soon!', '🤞'); }
    life.job.level += 1; life.job.perf = 30;
    life.bestJob = G.jobTitle(life);
    applyFx(life, { happy: 10 });
    unlock(life, 'promoted');
    if (life.job.level === BAL.JOB_LEVELS.length - 1) unlock(life, 'boss');
    addLog(life, 'Promoted to ' + G.jobTitle(life) + '!', '⬆️');
    return ok('PROMOTED! You are now ' + G.jobTitle(life) + ' earning ' + fmt(G.salary(life)) + ' coins a year!', '🏆', { celebrate: true });
  };

  A.quitJob = function (life) {
    if (!life.job) return no('You don\'t have a job.');
    var j = G.job(life);
    addLog(life, 'Left the job as ' + j.name, '👋');
    life.job = null;
    return ok('You left your job. Time for something new!', '👋');
  };

  A.retire = function (life) {
    if (life.age < 60) return no('You can retire from age 60.');
    if (!life.job) return no('You need a job to retire from!');
    life.pension = Math.round(G.salary(life) * 0.5);
    life.job = null; life.retired = true;
    applyFx(life, { happy: 12, health: 3 });
    unlock(life, 'retired');
    addLog(life, 'Retired! Time for fun and hobbies', '🏖️');
    return ok('Happy retirement! 🎉 You will get a pension of ' + fmt(life.pension) + ' coins every year.', '🏖️', { celebrate: true });
  };

  A.partTime = function (life, id) {
    var p = byId(BAL.PART_TIME, id);
    if (!p) return no('No such job');
    if (life.age < p.minAge) return no('You can do this from age ' + p.minAge + '.');
    if (life.age >= 18) return no('Grown-ups can find full-time jobs at the Job Centre.');
    life.partTime = id;
    applyFx(life, { happy: 3 });
    addLog(life, 'Started a part-time job: ' + p.name, p.emoji);
    return ok('You are now a ' + p.name + '! You\'ll earn ' + p.pay + ' coins a year.', p.emoji);
  };
  A.quitPartTime = function (life) { life.partTime = null; return ok('You stopped your part-time job.', '👋'); };

  /* ---------- homes & cars ---------- */
  G.homeInfo = function (life) {
    var h = life.home;
    if (h.type === 'rent') { var x = byId(BAL.RENTALS, h.id); return { name: x.name, emoji: x.emoji, kind: 'Renting', yearly: G.price(life, x.rent) }; }
    if (h.type === 'own') { var y = byId(BAL.HOMES, h.id); return { name: y.name, emoji: y.emoji, kind: 'Your own home', value: h.value, owed: h.owed }; }
    return { name: 'Family Home', emoji: '🏡', kind: 'Living with your family' };
  };

  A.rentHome = function (life, id) {
    var x = byId(BAL.RENTALS, id);
    if (!x) return no('No such home');
    if (life.age < 18) return no('You can rent a home when you are 18.');
    if (life.home.type === 'own') return no('Sell your home first.');
    if (life.home.type === 'rent' && life.home.id === id) return no('You already live here!');
    life.home = { type: 'rent', id: id };
    applyFx(life, { happy: 5 });
    addLog(life, 'Moved into a ' + x.name, x.emoji);
    return ok('You moved into a ' + x.name + '! Rent is ' + fmt(G.price(life, x.rent)) + ' coins a year.', x.emoji);
  };

  A.moveHome = function (life) {
    var hasFamily = life.people.some(function (p) { return ['mum', 'dad', 'grandma', 'grandpa'].indexOf(p.role) >= 0; });
    if (!hasFamily) return no('There\'s no family home to go back to.');
    if (life.home.type === 'own') return no('Sell your home first.');
    life.home = { type: 'family' };
    return ok('You moved back in with your family. Saving coins! 🐷', '🏡');
  };

  A.buyHome = function (life, id) {
    var h = byId(BAL.HOMES, id);
    if (!h) return no('No such home');
    if (life.age < 18) return no('You can buy a home when you are 18.');
    if (life.home.type === 'own') return no('Sell your home first!');
    var price = G.price(life, h.price);
    var deposit = Math.round(price * BAL.HOME_DEPOSIT);
    if (life.coins < deposit) return no('You need ' + fmt(deposit) + ' coins as a first payment (deposit). Keep saving! 🐷', '🪙');
    addCoins(life, -deposit);
    var owed = price - deposit;
    life.home = { type: 'own', id: id, value: price, owed: owed, yearly: Math.ceil(owed / BAL.HOME_LOAN_YEARS) };
    applyFx(life, { happy: h.happy + 6 });
    unlock(life, 'homeowner');
    if (id === 'castle') unlock(life, 'castle');
    addLog(life, 'Bought a ' + h.name + '!', h.emoji);
    return ok('You bought a ' + h.name + '! 🔑 You\'ll pay ' + fmt(life.home.yearly) + ' coins a year until it\'s all paid off.', h.emoji, { celebrate: true });
  };

  A.payOffHome = function (life) {
    var h = life.home;
    if (h.type !== 'own' || h.owed <= 0) return no('Nothing left to pay!');
    if (life.coins < h.owed) return no('You need ' + fmt(h.owed) + ' coins to pay it all off.');
    addCoins(life, -h.owed); h.owed = 0;
    applyFx(life, { happy: 8 });
    addLog(life, 'Paid off the whole home!', '🎉');
    return ok('Your home is fully paid for! No more home payments! 🎉', '🏠', { celebrate: true });
  };

  A.sellHome = function (life) {
    var h = life.home;
    if (h.type !== 'own') return no('You don\'t own a home.');
    var back = Math.round(h.value * 0.95 - h.owed);
    addCoins(life, back);
    var old = byId(BAL.HOMES, h.id);
    life.home = { type: 'rent', id: 'tinyflat' };
    addLog(life, 'Sold the ' + old.name, '🪧');
    return ok('You sold your ' + old.name + ' and got ' + fmt(back) + ' coins. You moved into a tiny flat for now.', '🪧');
  };

  A.drivingTest = function (life) {
    if (life.age < 17) return no('You can take your driving test at 17.');
    if (life.licence) return no('You already have your licence! 🪪');
    if (!needEnergy(life)) return no(TIRED, '😴');
    var fee = life.age < 18 ? 0 : G.price(life, 60);
    if (life.coins < fee) return no('The test costs ' + fee + ' coins.');
    life.energy -= 1;
    addCoins(life, -fee);
    if (r() < 0.45 + life.stats.smarts / 200) {
      life.licence = true;
      applyFx(life, { happy: 8 });
      unlock(life, 'licence');
      addLog(life, 'Passed the driving test!', '🪪');
      return ok('You PASSED your driving test! 🎉 You can buy a car now.', '🚦', { celebrate: true });
    }
    applyFx(life, { happy: -2 });
    return no('Oops, you forgot to check your mirrors. Practise and try again!', '🚧');
  };

  A.buyCar = function (life, id) {
    var c = byId(BAL.CARS, id);
    if (!c) return no('No such car');
    if (!life.licence) return no('Pass your driving test first! 🚦');
    if (life.cars.length >= 3) return no('Your driveway is full! Sell a car first.');
    if (life.coins < c.price) return no('You need ' + fmt(c.price) + ' coins for this car.', '🪙');
    addCoins(life, -c.price);
    life.cars.push({ uid: uid(), id: id });
    applyFx(life, { happy: c.happy + 3 });
    unlock(life, 'car');
    addLog(life, 'Bought a ' + c.name, c.emoji);
    return ok('Beep beep! Your new ' + c.name + ' is ready to drive!', c.emoji, { celebrate: true });
  };

  A.sellCar = function (life, carUid) {
    var idx = life.cars.findIndex(function (c) { return c.uid === carUid; });
    if (idx < 0) return no('No such car');
    var c = byId(BAL.CARS, life.cars[idx].id);
    life.cars.splice(idx, 1);
    addCoins(life, Math.round(c.price * 0.6));
    return ok('You sold your ' + c.name + ' for ' + fmt(c.price * 0.6) + ' coins.', '🪧');
  };

  /* ---------- towns ---------- */
  A.moveTown = function (life, id) {
    var t = byId(BAL.TOWNS, id);
    if (!t) return no('No such place');
    if (id === life.townId) return no('You already live here!');
    if (life.age < 18) return no('Your family lives here. You can move when you are grown up!');
    if (life.home.type === 'own') return no('Sell your home before moving to a new town.');
    var cost = Math.round(500 * t.price);
    if (life.coins < cost) return no('Moving costs ' + fmt(cost) + ' coins.');
    addCoins(life, -cost);
    life.townId = id;
    if (life.home.type === 'family') life.home = { type: 'rent', id: 'tinyflat' };
    applyFx(life, { happy: 6 });
    unlock(life, 'mover');
    addLog(life, 'Moved to ' + t.name + '!', t.emoji);
    return ok('Welcome to ' + t.name + '! ' + t.desc, t.emoji, { celebrate: true });
  };

  /* ---------- people ---------- */
  var LOVE_ROLES = ['partner', 'fiance', 'spouse'];
  G.partner = function (life) { return life.people.find(function (p) { return LOVE_ROLES.indexOf(p.role) >= 0; }) || null; };
  G.children = function (life) { return life.people.filter(function (p) { return p.role === 'child'; }); };

  A.makeFriend = function (life, free) {
    if (life.age < 3) return no('You\'re a bit little to make friends on your own!');
    var friends = life.people.filter(function (p) { return p.role === 'friend'; });
    if (friends.length >= 10) return no('You have lots of friends already! Spend time with them. 💕');
    if (!free) { if (!needEnergy(life)) return no(TIRED, '😴'); life.energy -= 1; }
    var g = randomGender();
    var f = makePerson('friend', Math.max(3, life.age + randInt(-2, 2)), g, { close: randInt(40, 60), name: freshName(life, g) });
    life.people.push(f);
    life.totals.friendsMade += 1;
    applyFx(life, { happy: 6 });
    unlock(life, 'first_friend');
    addLog(life, 'Made a new friend: ' + f.name, '🤝');
    var where = life.age < 18 ? pick(['in the playground', 'at school', 'at the park', 'at a birthday party']) : pick(['at the café', 'at work', 'at the gym', 'in the park', 'at a book club']);
    return ok('You met ' + f.name + ' ' + where + '. New friend! 🎉', '🤝', { personId: f.id });
  };

  A.spendTime = function (life, pid) {
    var p = G.person(life, pid);
    if (!p) return no('Who?');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    p.close = clamp(p.close + randInt(10, 16));
    applyFx(life, { happy: 5 });
    var ideas = life.age < 13 ? ['played tag', 'built a den', 'played a board game', 'had a picnic', 'drew pictures together']
      : ['went for a walk', 'had a long chat', 'watched a film', 'cooked dinner together', 'played games', 'went to the park'];
    return ok('You and ' + p.name + ' ' + pick(ideas) + '. 💕', '💞');
  };

  A.giveGift = function (life, pid) {
    var p = G.person(life, pid);
    if (!p) return no('Who?');
    var cost = life.age < 18 ? 10 : G.price(life, 50);
    if (life.coins < cost) return no('A gift costs ' + cost + ' coins.', '🪙');
    addCoins(life, -cost);
    p.close = clamp(p.close + randInt(10, 14));
    applyFx(life, { happy: 3 });
    return ok(p.name + ' loved the ' + pick(['flowers 💐', 'chocolates 🍫', 'card 💌', 'book 📘', 'cuddly toy 🧸', 'cake 🎂']) + '!', '🎁');
  };

  A.findLove = function (life, pref) {
    if (life.age < 18) return no('Sweethearts are for grown-ups! Make friends for now. 😊');
    if (G.partner(life)) return no('You already have a sweetheart! 💕');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    if (r() > 0.75) return no('No sparks this time… but you had a nice evening! Try again.', '🌙');
    var g = pref === 'girl' || pref === 'boy' ? pref : randomGender();
    var p = makePerson('partner', Math.max(18, life.age + randInt(-4, 4)), g, { close: randInt(45, 60), name: freshName(life, g) });
    life.people.push(p);
    applyFx(life, { happy: 10 });
    addLog(life, 'Started dating ' + p.name, '💕');
    return ok('You met ' + p.name + ' ' + pick(['at a café', 'at a dance class', 'through friends', 'at the library', 'on a walk']) + ' and you really like each other! 💕', '💘', { celebrate: true });
  };

  A.date = function (life, pid) {
    var p = G.person(life, pid);
    if (!p || LOVE_ROLES.indexOf(p.role) < 0) return no('Who?');
    if (!needEnergy(life)) return no(TIRED, '😴');
    var cost = G.price(life, 40);
    if (life.coins < cost) return no('A date costs ' + cost + ' coins.');
    life.energy -= 1;
    addCoins(life, -cost);
    p.close = clamp(p.close + randInt(12, 18));
    applyFx(life, { happy: 7 });
    return ok('You and ' + p.name + ' ' + pick(['had a picnic in the park 🧺', 'went ice skating ⛸️', 'went to a fancy dinner 🍝', 'watched the stars 🌟', 'went bowling 🎳']) + '!', '💖');
  };

  A.propose = function (life, pid) {
    var p = G.person(life, pid);
    if (!p || p.role !== 'partner') return no('Who?');
    var ring = G.price(life, 300);
    if (life.coins < ring) return no('You need ' + fmt(ring) + ' coins for a ring 💍.');
    if (p.close < 70) return no('Get closer first! Go on more dates (love bar above 70).', '💭');
    addCoins(life, -ring);
    if (r() < p.close / 100 + 0.1) {
      p.role = 'fiance';
      applyFx(life, { happy: 15 });
      addLog(life, 'Got engaged to ' + p.name + '!', '💍');
      return ok(p.name + ' said YES! 💍 You\'re engaged! Plan your wedding next.', '💍', { celebrate: true });
    }
    p.close = clamp(p.close - 5);
    return no(p.name + ' says they want to wait a little longer. Keep being lovely! 💕', '💭');
  };

  G.weddingCost = function (life, size) { return G.price(life, size === 'big' ? 3000 : 600); };
  A.wedding = function (life, pid, size) {
    var p = G.person(life, pid);
    if (!p || p.role !== 'fiance') return no('Who?');
    var cost = G.weddingCost(life, size);
    if (life.coins < cost) return no('This wedding costs ' + fmt(cost) + ' coins.');
    addCoins(life, -cost);
    p.role = 'spouse'; p.close = clamp(p.close + 15);
    applyFx(life, { happy: size === 'big' ? 22 : 16 });
    unlock(life, 'married');
    addLog(life, 'Married ' + p.name + '! 💒', '💒');
    return ok('What a wonderful wedding! 💒 You and ' + p.name + ' are married!', '💒', { celebrate: true, big: true });
  };

  A.separate = function (life, pid) {
    var p = G.person(life, pid);
    if (!p || LOVE_ROLES.indexOf(p.role) < 0) return no('Who?');
    p.role = 'friend'; p.close = 30;
    applyFx(life, { happy: -8 });
    addLog(life, 'Went separate ways with ' + p.name, '🍂');
    return ok('You and ' + p.name + ' decided to go separate ways, but stay friendly.', '🍂');
  };

  A.haveBaby = function (life, name, gender) {
    var p = G.partner(life);
    if (!p) return no('You need a partner to start a family together.');
    if (life.age < 20 || life.age > 50) return no('This is possible between ages 20 and 50. You could adopt instead!');
    if (life.flags.babyYear) return no('One new baby per year!');
    if (G.children(life).length >= 6) return no('Your family is full of love already!');
    life.flags.babyYear = true;
    var g = gender || randomGender();
    var kid = makePerson('child', 0, g, { name: (name || freshName(life, g)).slice(0, 20), close: 95 });
    life.people.push(kid);
    applyFx(life, { happy: 15, health: -2 });
    unlock(life, 'parent');
    addLog(life, 'Welcomed baby ' + kid.name + '!', '👶');
    return ok('Welcome to the world, baby ' + kid.name + '! 👶', '🍼', { celebrate: true, big: true });
  };

  A.adoptChild = function (life, name, gender) {
    if (life.age < 25 || life.age > 60) return no('You can adopt between ages 25 and 60.');
    if (life.flags.babyYear) return no('One new family member per year!');
    if (G.children(life).length >= 6) return no('Your family is full of love already!');
    var fee = G.price(life, 1000);
    if (life.coins < fee) return no('Adoption costs ' + fmt(fee) + ' coins.');
    addCoins(life, -fee);
    life.flags.babyYear = true;
    var g = gender || randomGender();
    var kid = makePerson('child', randInt(0, 8), g, { name: (name || freshName(life, g)).slice(0, 20), close: 80 });
    life.people.push(kid);
    applyFx(life, { happy: 15 });
    unlock(life, 'parent');
    addLog(life, 'Adopted ' + kid.name + ' into the family!', '🏡');
    return ok(kid.name + ' is now part of your family forever! 💛', '🏡', { celebrate: true, big: true });
  };

  /* ---------- pets ---------- */
  A.adoptPet = function (life, kind, name) {
    var k = byId(BAL.PETS, kind);
    if (!k) return no('No such pet');
    if (life.pets.length >= BAL.MAX_PETS) return no('You have lots of pets already! 🐾');
    if (life.age < 5) return no('You\'re a bit too little for a pet. Ask again when you\'re 5!', '🍼');
    if (life.age < 18) {
      if (life.flags.askedPet) return no('You already asked this year. Ask again next year!', '🙂');
      life.flags.askedPet = true;
      var parents = life.people.filter(function (p) { return ['mum', 'dad', 'grandma', 'grandpa'].indexOf(p.role) >= 0; });
      var love = parents.length ? parents.reduce(function (s, p) { return s + p.close; }, 0) / parents.length : 60;
      var bigPet = k.id === 'pony';
      if (bigPet || r() > love / 100 - 0.1 + life.totals.helper * 0.03) {
        return no((parents[0] ? parents[0].name : 'Your family') + ' said "Maybe next year!" Helping with chores might help. 😉', '🤔');
      }
    } else {
      var fee = G.price(life, k.fee);
      if (life.coins < fee) return no('Adopting a ' + k.name + ' costs ' + fmt(fee) + ' coins.', '🪙');
      addCoins(life, -fee);
    }
    var pet = { id: uid(), kind: kind, name: (name || pick(BAL.NAMES.pets)).slice(0, 20), age: kind === 'dog' || kind === 'cat' ? randInt(0, 3) : 0, love: 70 };
    life.pets.push(pet);
    life.totals.petsAdopted += 1;
    applyFx(life, { happy: 12 });
    unlock(life, 'pet_owner');
    addLog(life, 'Adopted ' + pet.name + ' the ' + k.name, k.emoji);
    return ok((life.age < 18 ? 'YES! Your family said yes! ' : '') + 'Meet ' + pet.name + ' the ' + k.name + '! ' + k.emoji, k.emoji, { celebrate: true });
  };

  A.playPet = function (life, petId) {
    var pet = byId(life.pets, petId);
    if (!pet) return no('Which pet?');
    if (!needEnergy(life)) return no(TIRED, '😴');
    life.energy -= 1;
    pet.love = clamp(pet.love + randInt(14, 20));
    applyFx(life, { happy: 6, fitness: pet.kind === 'dog' || pet.kind === 'pony' ? 3 : 0 });
    var k = byId(BAL.PETS, pet.kind);
    var acts = { dog: 'played fetch with', cat: 'dangled a string for', pony: 'went for a ride on', parrot: 'taught a new word to', fish: 'watched the bubbles with' };
    return ok('You ' + (acts[pet.kind] || 'played with') + ' ' + pet.name + '! ' + k.emoji, k.emoji);
  };

  A.petTreat = function (life, petId) {
    var pet = byId(life.pets, petId);
    if (!pet) return no('Which pet?');
    var cost = 10;
    if (life.coins < cost) return no('Treats cost 10 coins.');
    addCoins(life, -cost);
    pet.love = clamp(pet.love + 10);
    applyFx(life, { happy: 2 });
    return ok(pet.name + ' gobbled up the treat! Yum! 🦴', '🦴');
  };

  A.rehomePet = function (life, petId) {
    var pet = byId(life.pets, petId);
    if (!pet) return no('Which pet?');
    life.pets = life.pets.filter(function (p) { return p.id !== petId; });
    applyFx(life, { happy: -6 });
    return ok(pet.name + ' went to live on a lovely farm with a kind family who will take good care of them.', '🌾');
  };

  /* ---------- shopping ---------- */
  G.itemPrice = function (life, item) { return Math.max(1, G.price(life, item.price)); };
  A.buyItem = function (life, id) {
    var it = byId(BAL.ITEMS, id);
    if (!it) return no('No such item');
    if (!it.consumable && life.inventory.indexOf(id) >= 0) return no('You already have one! 😊');
    var price = G.itemPrice(life, it);
    if (life.coins < price) return no('You need ' + fmt(price) + ' coins. Save up! 🐷', '🪙');
    addCoins(life, -price);
    applyFx(life, it.fx);
    if (!it.consumable) life.inventory.push(id);
    if (it.unlock && life.unlocked.indexOf(it.unlock) < 0) { life.unlocked.push(it.unlock); life.look.accessory = it.unlock; }
    life.totals.items += 1;
    return ok('You bought ' + (it.consumable ? 'a ' : 'a ') + it.name + '!' + (it.unlock ? ' You are wearing it now!' : ''), it.emoji);
  };

  A.setAccessory = function (life, acc) {
    life.look.accessory = acc;
    return ok('Looking great!', '🪞');
  };

  /* ---------- health ---------- */
  G.clinicCost = function (life, c) { return life.age < 18 ? 0 : G.price(life, c.cost); };
  A.clinic = function (life, id) {
    var c = byId(BAL.CLINIC, id);
    if (!c) return no('No such service');
    if (c.adultOnly && life.age < 18) return no('Spa days are for grown-ups!');
    var cost = G.clinicCost(life, c);
    if (life.coins < cost) return no('This costs ' + fmt(cost) + ' coins.', '🪙');
    addCoins(life, -cost);
    applyFx(life, c.fx);
    var extra = {};
    var msg = c.desc;
    if (life.sick) {
      var ill = byId(BAL.ILLNESSES, life.sick.id);
      if (ill.cure === id || id === 'hospital') {
        msg = 'All better! Your ' + ill.name.replace(/^an? |^the /, '') + ' is gone. 🌟';
        life.sick = null;
        applyFx(life, { health: 8, happy: 5 });
      }
    }
    if (id === 'jab') { life.flags.jabAge = life.age; msg = 'All done! You\'re protected from colds and flu this year. 💪'; }
    if (id === 'optician') {
      if (life.look.accessory === 'glasses') msg = 'Your eyes are great and your glasses look fab! 👓';
      else if (r() < 0.4 || life.age > 45) { msg = 'The optician says glasses would help you see super clearly!'; extra.offerGlasses = true; }
      else msg = 'Perfect eyesight! You read every letter. 👀';
    }
    return ok(msg + (cost === 0 && life.age < 18 ? ' (Free for children!)' : ''), c.emoji, extra);
  };

  /* ---------- daily jobs ---------- */
  A.chore = function (life, i) {
    var c = life.chores[i];
    if (!c) return no('?');
    if (c.done) return no('Already done! ✅');
    c.done = true;
    applyFx(life, { happy: 1 });
    var allDone = life.chores.every(function (x) { return x.done; });
    if (allDone) {
      life.totals.helper += 1;
      applyFx(life, { happy: 5, health: 2 });
      if (life.age < 18) addCoins(life, 10);
      life.people.forEach(function (p) { if (['mum', 'dad', 'grandma', 'grandpa'].indexOf(p.role) >= 0) p.close = clamp(p.close + 3); });
      return ok('All daily jobs done! You\'re a super helper! ⭐' + (life.age < 18 ? ' (+10 coins)' : ''), '🌟', { allDone: true });
    }
    return ok(c.t + ' — done!', c.e);
  };

  /* ---------- random events ---------- */
  G.eligibleEvents = function (life) {
    return BAL.EVENTS.filter(function (e) {
      if (life.age < e.min || life.age > e.max) return false;
      if (life.seen[e.id] !== undefined && life.age - life.seen[e.id] < 6) return false;
      if (e.need === 'job' && !life.job) return false;
      if (e.need === 'adultChild') {
        var grown = G.children(life).filter(function (c) { return c.age >= 22; }).length;
        var gk = life.people.filter(function (p) { return p.role === 'grandchild'; }).length;
        if (!grown || gk >= grown * 2) return false;
      }
      return true;
    });
  };

  A.resolveEvent = function (life, eventId, idx) {
    var e = byId(BAL.EVENTS, eventId);
    if (!e) return no('?');
    var c = e.choices[idx];
    if (!c) return no('?');
    applyFx(life, c.fx);
    if (c.coins) addCoins(life, c.coins);
    if (c.coinsJob) addCoins(life, G.salary(life) * c.coinsJob);
    if (c.grade) life.edu.grade = clamp(life.edu.grade + c.grade);
    if (c.perf && life.job) life.job.perf = clamp(life.job.perf + c.perf);
    if (c.kind) life.totals.kind += 1;
    if (c.item && life.inventory.indexOf(c.item) < 0) life.inventory.push(c.item);
    var extraMsg = '';
    if (c.special === 'friend') { var fr = A.makeFriend(life, true); if (fr.ok) extraMsg = ' ' + fr.msg; }
    if (c.special === 'friendship') {
      var fs = life.people.filter(function (p) { return p.role === 'friend'; });
      if (fs.length) { var f = pick(fs); f.close = clamp(f.close + 10); }
    }
    if (c.special === 'kitten' && life.pets.length < BAL.MAX_PETS) {
      life.pets.push({ id: uid(), kind: 'cat', name: pick(BAL.NAMES.pets), age: 0, love: 80 });
      life.totals.petsAdopted += 1; unlock(life, 'pet_owner');
    }
    if (c.special === 'grandchild') {
      var parent = pick(G.children(life).filter(function (k) { return k.age >= 22; }));
      var g = randomGender();
      life.people.push(makePerson('grandchild', 0, g, { close: 85, parentName: parent ? parent.name : '', name: freshName(life, g) }));
      unlock(life, 'grandparent');
      addLog(life, 'Became a grandparent!', '👵');
    }
    if (c.special === 'retire') { var rr = A.retire(life); if (rr.ok) extraMsg = ' ' + rr.msg; }
    return ok(c.msg + extraMsg, e.emoji);
  };

  /* ---------- the big one: a year goes by ---------- */
  G.yearlyMoney = function (life) {
    // Returns lines of income and bills for the coming age-up (for the year just lived).
    var t = G.town(life), lines = [];
    var adult = life.age >= 18;
    if (life.job) lines.push({ e: G.job(life).emoji, t: 'Pay from your job', v: G.salary(life) });
    if (life.partTime) { var pt = byId(BAL.PART_TIME, life.partTime); lines.push({ e: pt.emoji, t: pt.name + ' pay', v: pt.pay }); }
    if (!life.job && life.pension) lines.push({ e: '🏖️', t: 'Pension', v: life.pension });
    else if (!life.job && life.age >= 67) lines.push({ e: '🏖️', t: 'State pension', v: Math.round(6000 * t.pay) });
    if (life.edu.course) lines.push({ e: '🎓', t: 'Student grant', v: Math.round(2500 * t.price) });
    if (life.age >= 5 && life.age < 18) lines.push({ e: '🐷', t: 'Pocket money', v: 20 + life.age * 4 });
    if (adult) {
      if (life.home.type === 'family') lines.push({ e: '🏡', t: 'Help with family bills', v: -G.price(life, 400) });
      else lines.push({ e: '🛒', t: 'Food & living costs', v: -G.price(life, 1500) });
      if (life.home.type === 'rent') { var rt = byId(BAL.RENTALS, life.home.id); lines.push({ e: rt.emoji, t: 'Rent', v: -G.price(life, rt.rent) }); }
      if (life.home.type === 'own') {
        if (life.home.owed > 0) lines.push({ e: '🏦', t: 'Home payment', v: -Math.min(life.home.owed, life.home.yearly), loan: true });
        lines.push({ e: '🔨', t: 'Home repairs', v: -Math.round(life.home.value * 0.01) });
      }
      life.cars.forEach(function (c) { var cc = byId(BAL.CARS, c.id); lines.push({ e: '⛽', t: cc.name + ' fuel & repairs', v: -Math.round(300 + cc.price * 0.03) }); });
      if (life.pets.length) lines.push({ e: '🐾', t: 'Pet food & vet', v: -life.pets.reduce(function (s, p) { return s + G.price(life, byId(BAL.PETS, p.kind).cost); }, 0) });
      var kidsHome = G.children(life).filter(function (k) { return k.age < 18; }).length;
      if (kidsHome) lines.push({ e: '🧸', t: 'Looking after children', v: -G.price(life, 1000) * kidsHome });
    }
    return lines;
  };

  G.ageUp = function (life) {
    if (life.ended) return null;
    life._diffs = []; life._coins = 0;
    var rep = { lines: [], money: [], celebrations: [], event: null, choice: null, ended: false, notes: [] };

    // 1. Daily jobs check
    var undone = life.chores.filter(function (c) { return !c.done; }).length;
    if (undone && life.age >= 3) { applyFx(life, { happy: -3 }); rep.notes.push({ e: '📝', t: 'You forgot ' + undone + ' daily job' + (undone > 1 ? 's' : '') + '. Try to finish them next year!' }); }

    // 2. Money for the year just lived
    var money = G.yearlyMoney(life);
    var net = money.reduce(function (s, l) { return s + l.v; }, 0);
    money.forEach(function (l) { if (l.loan && life.home.type === 'own') life.home.owed = Math.max(0, life.home.owed + l.v); });
    if (life.coins + net < 0) {
      rep.notes.push({ e: '😟', t: 'Money was tight this year! Your coins ran out. Try a cheaper home or a better job.' });
      applyFx(life, { happy: -8 });
    }
    addCoins(life, net);
    rep.money = money; rep.net = net;
    life.totals.happySum += life.stats.happy; life.totals.years += 1;

    // 3. Birthday!
    var prevStage = G.stage(life.age);
    life.age += 1; life.year += 1;
    var st = G.stage(life.age);
    if (life.age < 18) {
      var gift = 10 + life.age * 5;
      addCoins(life, gift);
      rep.gift = { coins: gift, item: pick(['a shiny new kite 🪁', 'a box of crayons 🖍️', 'a cuddly unicorn 🦄', 'a toy dinosaur 🦖', 'a football ⚽', 'a sticker book 📒', 'a magic set 🎩', 'a puzzle 🧩', 'a yo-yo 🪀', 'a paint set 🎨']) };
    } else {
      rep.gift = { coins: 0, item: pick(['lots of birthday cards 💌', 'a yummy cake 🎂', 'a surprise party 🎉', 'flowers 💐', 'a lovely phone call from family 📞']) };
    }

    // 4. Stats drift
    var s = life.stats;
    if (s.happy > 75) applyFx(life, { happy: -4 }); else if (s.happy < 40) applyFx(life, { happy: 4 });
    if (life.age < 18) applyFx(life, { smarts: 3, fitness: life.age < 13 ? 2 : 0 });
    else applyFx(life, { fitness: life.age > 30 ? -3 : -2 });
    if (life.age > 45) applyFx(life, { health: -randInt(1, 2) });
    if (life.age > 65) applyFx(life, { health: -randInt(1, 3) });
    if (life.age > 80) applyFx(life, { health: -randInt(1, 4) });
    if (life.stats.fitness > 60) applyFx(life, { health: 1 });
    var town = G.town(life);
    applyFx(life, (function () { var o = {}; o[town.bonus] = 1; return o; })());
    life.edu.clubs.forEach(function (cid) { var c = byId(BAL.CLUBS, cid); if (c) applyFx(life, c.fx); });
    var j = G.job(life); if (j && j.happy) applyFx(life, { happy: j.happy });
    var hi = G.homeInfo(life);
    if (life.home.type !== 'family') {
      var hh = life.home.type === 'own' ? byId(BAL.HOMES, life.home.id) : byId(BAL.RENTALS, life.home.id);
      if (hh && hh.happy) applyFx(life, { happy: Math.ceil(hh.happy / 3) });
    }
    if (life.cars.length) applyFx(life, { happy: 1 });
    if (life.home.type === 'own') life.home.value = Math.round(life.home.value * 1.02);
    if (life.age >= 30 && life.home.type === 'family') applyFx(life, { happy: -2 });

    // 5. Health & illness
    if (life.sick) {
      applyFx(life, { health: -6, happy: -3 });
      if (r() < 0.4) { rep.notes.push({ e: '🌤️', t: 'You got over ' + byId(BAL.ILLNESSES, life.sick.id).name + ' by yourself. Phew!' }); life.sick = null; }
      else rep.notes.push({ e: byId(BAL.ILLNESSES, life.sick.id).emoji, t: 'You still have ' + byId(BAL.ILLNESSES, life.sick.id).name + '. Visit the Health Centre!' });
    } else {
      var chance = 0.13 + (s.health < 40 ? 0.12 : 0) + (life.age > 60 ? 0.08 : 0);
      if (r() < chance) {
        var jab = life.flags.jabAge === life.age - 1;
        var pool = BAL.ILLNESSES.filter(function (i) { return life.age >= i.minAge && life.age <= i.maxAge && !(jab && (i.id === 'cold' || i.id === 'flu')); });
        if (pool.length) {
          var ill = pick(pool);
          life.sick = { id: ill.id };
          applyFx(life, { health: -8, happy: -3 });
          rep.notes.push({ e: ill.emoji, t: 'Oh no, you caught ' + ill.name + '! Visit the Health Centre to feel better.' });
          addLog(life, 'Caught ' + ill.name, ill.emoji);
        }
      }
    }

    // 6. Education
    if (life.age === 3) rep.lines.push({ e: '🎨', t: 'You started nursery! Painting, songs and snacks.' });
    if (life.age === 5) { rep.celebrations.push({ e: '🎒', t: 'First day at school!', d: 'You are off to ' + town.school + ' Primary School. Your teacher is lovely!' }); addLog(life, 'Started primary school', '🎒'); }
    if (life.age === 11) { life.edu.level = Math.max(life.edu.level, 1); rep.celebrations.push({ e: '🏫', t: 'Big School!', d: 'You finished primary school and started secondary school!' }); addLog(life, 'Started secondary school', '🏫'); }
    if (life.age >= 5 && life.age <= 18 || life.edu.course) {
      life.edu.grade = clamp(Math.round(life.edu.grade * 0.55 + life.stats.smarts * 0.45));
      if (G.gradeStars(life) === 5) unlock(life, 'top_class');
      if (life.age < 18 && life.age >= 5) rep.lines.push({ e: '📄', t: 'School report: ' + '⭐'.repeat(G.gradeStars(life)) });
    }
    if (life.age === 18 && life.edu.level < 2) {
      life.edu.level = 2; life.edu.clubs = [];
      unlock(life, 'graduate');
      addLog(life, 'Graduated from secondary school!', '🎓');
      rep.celebrations.push({ e: '🎓', t: 'You graduated!', d: 'You finished secondary school! What will you do next?' });
      rep.choice = 'future';
    }
    if (life.edu.course) {
      life.edu.course.done += 1;
      var c = BAL.COURSES[life.edu.course.id];
      if (life.edu.course.done >= c.years) {
        life.edu.level = Math.max(life.edu.level, c.level);
        life.edu.course = null; life.edu.clubs = [];
        unlock(life, 'degree');
        var honours = G.gradeStars(life) >= 4 ? ' with top marks' : '';
        addLog(life, 'Graduated from ' + c.name + honours + '!', '🎓');
        rep.celebrations.push({ e: '🎓', t: c.name + ' complete!', d: 'You earned your ' + BAL.EDU_LEVELS[c.level] + honours + '! New jobs are now open to you.' });
      }
    }

    // 7. Work
    if (life.job) {
      life.job.years += 1;
      life.job.perf = clamp(life.job.perf - 8);
      if (life.job.perf <= 5) { rep.notes.push({ e: '⚠️', t: 'Your boss says you need to work harder (use "Work hard").' }); }
    }
    if (life.partTime && life.age >= 18) { rep.notes.push({ e: '👋', t: 'Your part-time job has ended. Time to find a grown-up job!' }); life.partTime = null; }

    // 8. People
    var gone = [];
    life.people.forEach(function (p) {
      p.age += 1;
      var decay = p.role === 'friend' ? 4 : 2;
      p.close = clamp(p.close - decay);
      if (p.role === 'child' && p.age === 18) { rep.lines.push({ e: '🎓', t: p.name + ' is all grown up and moved out to start their own adventure!' }); addLog(life, p.name + ' moved out', '🧳'); }
      if (p.role === 'friend' && p.close <= 5) { gone.push(p); rep.notes.push({ e: '🍃', t: 'You and ' + p.name + ' drifted apart. Spend time with friends to stay close!' }); }
      var canPass = ['mum', 'dad', 'grandma', 'grandpa', 'spouse'].indexOf(p.role) >= 0 && life.age >= 18;
      if (canPass && p.age >= p.lifeEnd) {
        gone.push(p);
        life.remembered.push({ name: p.name, role: p.role, age: p.age, year: life.year });
        applyFx(life, { happy: -10 });
        rep.notes.push({ e: '🌅', t: (BAL.ROLES[p.role] ? BAL.ROLES[p.role].label + ' ' : '') + p.name + ' lived a long and happy life to ' + p.age + '. They will always be in your heart. 💛' });
        addLog(life, 'Said goodbye to ' + p.name + ', who lived to ' + p.age, '🌅');
      }
    });
    if (gone.length) life.people = life.people.filter(function (p) { return gone.indexOf(p) < 0; });

    // 9. Pets
    var petsGone = [];
    life.pets.forEach(function (p) {
      p.age += 1;
      p.love = clamp(p.love - 6);
      if (p.love < 25) { applyFx(life, { happy: -2 }); rep.notes.push({ e: '🥺', t: p.name + ' misses you! Play with them more.' }); }
      else if (p.love > 70) applyFx(life, { happy: 2 });
      var k = byId(BAL.PETS, p.kind);
      if (p.age >= k.life + (p.id.length % 3) - 1) {
        petsGone.push(p);
        life.remembered.push({ name: p.name, role: 'pet', kind: p.kind, age: p.age, year: life.year });
        applyFx(life, { happy: -6 });
        rep.notes.push({ e: '🌈', t: p.name + ' the ' + k.name + ' had a long, happy life and crossed the Rainbow Bridge. You gave them so much love. 💛' });
        addLog(life, 'Said goodbye to ' + p.name + ' the ' + k.name, '🌈');
      }
    });
    if (petsGone.length) life.pets = life.pets.filter(function (p) { return petsGone.indexOf(p) < 0; });

    // 10. Milestones
    var M = {
      1: ['👣', 'You took your first steps!'], 2: ['🗣️', 'You can say lots of words now!'], 10: ['🔟', 'Double digits! You are 10!'],
      13: ['🧑‍🎤', 'You are a teenager now!'], 16: ['🍰', 'Sweet sixteen!'],
      18: ['🗝️', 'You are a grown-up! You can now get a job, a home, a car and more.'], 21: ['🥳', 'Twenty-one! A big birthday.'],
      30: ['🎈', 'Thirty and thriving!'], 40: ['🎈', 'Fabulous forty!'], 50: ['🏅', 'Half a century — 50 years!'],
      60: ['🧓', 'You can retire now if you want to.'], 65: ['🌅', 'Welcome to your golden years!'], 80: ['🎂', 'Eighty amazing years!'], 100: ['💯', 'ONE HUNDRED YEARS OLD! Incredible!']
    };
    if (M[life.age]) rep.lines.push({ e: M[life.age][0], t: M[life.age][1] });
    if (st !== prevStage && st === 'teen') life.edu.clubs = life.edu.clubs.slice(0, 2);
    if (life.age === 18 && life.home.type === 'family') rep.lines.push({ e: '🏡', t: 'You can keep living with your family, or move out from the Home tab.' });

    // 11. Life end
    var end = life.age >= life.lifeEnd || (life.age >= 80 && life.stats.health <= 5 && r() < 0.5) || life.age >= 115;
    if (end) {
      life.ended = true; rep.ended = true;
      checkAchievements(life);
      addLog(life, life.name + '\'s wonderful life story is complete.', '🌟');
    } else {
      // 12. A random event
      if (!rep.choice && life.age >= 1 && r() < 0.62) {
        var pool2 = G.eligibleEvents(life);
        if (pool2.length) { var ev = pick(pool2); life.seen[ev.id] = life.age; rep.event = ev.id; }
      }
      resetYear(life);
    }

    addLog(life, 'Turned ' + life.age + '! 🎂', '🎂');
    checkAchievements(life);
    rep.diffs = life._diffs; rep.coinsDelta = life._coins;
    delete life._diffs; delete life._coins;
    return rep;
  };

  /* ---------- end of life ---------- */
  G.summary = function (life) {
    var avg = life.totals.years ? Math.round(life.totals.happySum / life.totals.years) : life.stats.happy;
    var score = avg * 0.6 + Math.min(40, life.achievements.length * 2.5);
    return {
      name: life.name, age: life.age, town: G.town(life).name, townEmoji: G.town(life).emoji,
      job: life.bestJob || (life.age >= 18 ? 'Free spirit' : 'Student'),
      edu: BAL.EDU_LEVELS[life.edu.level],
      children: G.children(life).length + life.remembered.filter(function (x) { return x.role === 'child'; }).length,
      grandchildren: life.people.filter(function (p) { return p.role === 'grandchild'; }).length,
      friends: life.totals.friendsMade, pets: life.totals.petsAdopted, coins: life.coins, earned: life.totals.earned,
      stickers: life.achievements.length, avgHappy: avg, stars: clamp(Math.ceil(score / 20), 1, 5),
      married: life.achievements.indexOf('married') >= 0, generation: life.generation, look: life.look, year: life.year
    };
  };

  G.continueAsChild = function (life, childId) {
    var kid = G.person(life, childId);
    if (!kid) return null;
    var parentRole = life.gender === 'girl' ? 'mum' : life.gender === 'boy' ? 'dad' : (life.gender === 'any' ? 'mum' : 'mum');
    var parents = [];
    var spouse = life.people.find(function (p) { return p.role === 'spouse'; });
    if (spouse) parents.push(Object.assign({}, spouse, { id: uid(), role: spouse.gender === 'girl' ? 'mum' : 'dad', close: 80 }));
    var siblings = G.children(life).filter(function (c) { return c.id !== childId; })
      .map(function (c) { return Object.assign({}, c, { id: uid(), role: 'sibling', close: 70 }); });
    var nl = G.newLife({
      name: kid.name, gender: kid.gender, look: kid.look, townId: life.townId, age: kid.age,
      year: life.year - kid.age, coins: Math.round(life.coins * 0.5), generation: (life.generation || 1) + 1,
      parents: parents, siblings: siblings
    });
    nl.remembered.push({ name: life.name, role: parentRole, age: life.age, year: life.year });
    G.addLog(nl, 'Inherited ' + fmt(Math.round(life.coins * 0.5)) + ' coins and lots of love from ' + life.name + '.', '💛');
    return nl;
  };
})(globalThis.BAL = globalThis.BAL || {});
