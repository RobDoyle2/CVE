/* Build a Life — age progression challenges.
   Every year the character gets 3 challenges for their life stage. Finishing them all unlocks
   the next birthday. Challenges are tracked from normal game actions, from the character's
   situation (e.g. "has a job"), or from mini-games (quizzes and find-it games). */
(function (BAL) {
  'use strict';
  var G = BAL.Game;
  var pick = G.pick, randInt = G.randInt, byId = G.byId;

  var FAMILY = ['mum', 'dad', 'parent', 'grandma', 'grandpa', 'sibling', 'spouse', 'partner', 'fiance', 'child', 'grandchild'];
  var KIDS_ROLES = ['child'];
  var GRAND_ROLES = ['grandchild', 'child'];
  function people(l, roles) { return l.people.filter(function (p) { return roles.indexOf(p.role) >= 0; }); }
  function kidsAtHome(l) { return l.people.some(function (p) { return p.role === 'child' && p.age < 18; }); }

  // Rewards by stage: coins and ⭐ challenge stars.
  var COINS = { baby: 5, toddler: 10, child: 20, teen: 30, young: 120, adult: 150, older: 120, grand: 100 };

  /* ----- challenge catalogue -----
     track: { act, ids?, roles?, n }    — counts successful actions
            { state: fn(life) }         — done when true
            { chores: true }            — all daily jobs ticked
            { game: 'quiz'|'find', kind } — mini-game
     tab: where the "Go!" button takes you. stars: 1–3. fixed: always given at those ages. */
  var C = [
    /* Baby 0–2 */
    { id: 'baby_play', stage: 'baby', emoji: '🧸', name: 'Playtime!', desc: 'Do 2 baby activities.', track: { act: 'activity', ids: ['giggle', 'crawl', 'cuddle', 'nap', 'words'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'baby_happy', stage: 'baby', emoji: '😊', name: 'Happy & Healthy', desc: 'Get your Happiness and Health to 70 or more.', track: { state: function (l) { return l.stats.happy >= 70 && l.stats.health >= 70; } }, tab: 'activities', stars: 1, hint: 'Try Giggle & Play and Nap Time!' },
    { id: 'baby_toys', stage: 'baby', emoji: '🔍', name: 'Find the Toys', desc: 'Play the find-it game: spot all the toys!', track: { game: 'find', kind: 'toys' }, stars: 2 },
    { id: 'baby_shapes', stage: 'baby', emoji: '🔺', name: 'Shape Sorter', desc: 'Play the shapes game.', track: { game: 'quiz', kind: 'shapes' }, stars: 2, min: 1 },
    { id: 'baby_cuddle', stage: 'baby', emoji: '🤗', name: 'Family Cuddles', desc: 'Spend time with your family.', track: { act: 'spendTime', roles: FAMILY, n: 1 }, tab: 'people', stars: 1 },
    { id: 'baby_nap', stage: 'baby', emoji: '😴', name: 'Sleepy Baby', desc: 'Have a lovely nap.', track: { act: 'activity', ids: ['nap'], n: 1 }, tab: 'activities', stars: 1 },
    { id: 'baby_words', stage: 'baby', emoji: '🗣️', name: 'First Words', desc: 'Try saying some new words.', track: { act: 'activity', ids: ['words'], n: 1 }, tab: 'activities', stars: 1, min: 1 },
    { id: 'baby_jobs', stage: 'baby', emoji: '🛁', name: 'Little Helper', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },

    /* Toddler 3–5 */
    { id: 'tod_play', stage: 'toddler', emoji: '🎨', name: 'Nursery Fun', desc: 'Do 2 fun activities like drawing, playing outside or reading.', track: { act: 'activity', ids: ['draw', 'playout', 'read', 'bike', 'swim', 'instrument', 'teeth', 'cuddle'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'tod_friend', stage: 'toddler', emoji: '🤝', name: 'Make a Friend', desc: 'Make a new friend.', track: { act: 'makeFriend', n: 1 }, tab: 'people', stars: 1 },
    { id: 'tod_tidy', stage: 'toddler', emoji: '🧺', name: 'Tidy-up Time', desc: 'Find all the toys to put them away!', track: { game: 'find', kind: 'tidy' }, stars: 2 },
    { id: 'tod_count', stage: 'toddler', emoji: '🔢', name: 'Counting Fun', desc: 'Play the counting game.', track: { game: 'quiz', kind: 'counting' }, stars: 2 },
    { id: 'tod_colours', stage: 'toddler', emoji: '🌈', name: 'Colours & Animals', desc: 'Play the colours and animals game.', track: { game: 'quiz', kind: 'colours' }, stars: 2 },
    { id: 'tod_teeth', stage: 'toddler', emoji: '🪥', name: 'Sparkly Teeth', desc: 'Brush your teeth really well.', track: { act: 'activity', ids: ['teeth'], n: 1 }, tab: 'activities', stars: 1 },
    { id: 'tod_jobs', stage: 'toddler', emoji: '🧦', name: 'Big Helper', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },
    { id: 'tod_happy', stage: 'toddler', emoji: '😄', name: 'Sunny Smiles', desc: 'Get your Happiness to 70 or more.', track: { state: function (l) { return l.stats.happy >= 70; } }, tab: 'activities', stars: 1 },

    /* Child 6–12 */
    { id: 'ch_school', stage: 'child', emoji: '🏫', name: 'School Activities', desc: 'Study hard at school twice.', track: { act: 'study', n: 2 }, tab: 'school', stars: 1 },
    { id: 'ch_homework', stage: 'child', emoji: '✏️', name: 'Homework Time', desc: 'Finish your maths homework.', track: { game: 'quiz', kind: 'maths' }, stars: 2 },
    { id: 'ch_spelling', stage: 'child', emoji: '🔤', name: 'Spelling Test', desc: 'Pass your spelling test.', track: { game: 'quiz', kind: 'spelling' }, stars: 2, min: 7 },
    { id: 'ch_friend', stage: 'child', emoji: '🤝', name: 'Make Friends', desc: 'Make a new friend.', track: { act: 'makeFriend', n: 1 }, tab: 'people', stars: 1, when: function (l) { return people(l, ['friend']).length < 9; } },
    { id: 'ch_playdate', stage: 'child', emoji: '🛝', name: 'Playdate', desc: 'Spend time with a friend.', track: { act: 'spendTime', roles: ['friend'], n: 1 }, tab: 'people', stars: 1, when: function (l) { return people(l, ['friend']).length > 0; } },
    { id: 'ch_club', stage: 'child', emoji: '🎯', name: 'Join a Club', desc: 'Join an after-school club.', track: { act: 'joinClub', n: 1 }, tab: 'school', stars: 1, when: function (l) { return l.edu.clubs.length < 2; } },
    { id: 'ch_active', stage: 'child', emoji: '⚽', name: 'Get Active', desc: 'Do 2 active things like playing outside, cycling or swimming.', track: { act: 'activity', ids: ['playout', 'bike', 'swim', 'sport'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ch_recycle', stage: 'child', emoji: '♻️', name: 'Recycling Hero', desc: 'Find everything that can be recycled.', track: { game: 'find', kind: 'recycling' }, stars: 2 },
    { id: 'ch_read', stage: 'child', emoji: '📚', name: 'Bookworm', desc: 'Read 2 books.', track: { act: 'activity', ids: ['read'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ch_jobs', stage: 'child', emoji: '🛏️', name: 'Responsible Kid', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },

    /* Teenager 13–17 */
    { id: 'tn_project', stage: 'teen', emoji: '📂', name: 'School Project', desc: 'Work on your school project (study 3 times).', track: { act: 'study', n: 3 }, tab: 'school', stars: 2 },
    { id: 'tn_present', stage: 'teen', emoji: '🎤', name: 'Give a Presentation', desc: 'Answer the class\'s questions about your topic.', track: { game: 'quiz', kind: 'facts' }, stars: 2 },
    { id: 'tn_exam', stage: 'teen', emoji: '📝', name: 'Pass Your Exams', desc: 'Sit your exams — get at least 3 answers right!', track: { game: 'quiz', kind: 'exam' }, stars: 3, fixed: [16, 17] },
    { id: 'tn_graduate', stage: 'teen', emoji: '🎓', name: 'Ready to Graduate', desc: 'Get your school report to 3 stars or more so you can graduate.', track: { state: function (l) { return G.gradeStars(l) >= 3; } }, tab: 'school', stars: 3, fixed: [17], hint: 'Study hard to raise your report!' },
    { id: 'tn_friends', stage: 'teen', emoji: '🛹', name: 'Squad Goals', desc: 'Hang out with your friends.', track: { act: 'activity', ids: ['friends'], n: 1 }, tab: 'activities', stars: 1 },
    { id: 'tn_skill', stage: 'teen', emoji: '💻', name: 'Learn a Skill', desc: 'Practise a skill twice: coding, music or sport.', track: { act: 'activity', ids: ['code', 'instrument', 'sport'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'tn_parttime', stage: 'teen', emoji: '📰', name: 'Earn Some Money', desc: 'Start a part-time job.', track: { act: 'partTime', n: 1 }, tab: 'school', stars: 2, min: 14, when: function (l) { return !l.partTime; } },
    { id: 'tn_maths', stage: 'teen', emoji: '➗', name: 'Maths Challenge', desc: 'Solve the maths challenge.', track: { game: 'quiz', kind: 'maths' }, stars: 2 },
    { id: 'tn_jobs', stage: 'teen', emoji: '♻️', name: 'Pull Your Weight', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },

    /* Young adult 18–29 */
    { id: 'ya_job', stage: 'young', emoji: '💼', name: 'Find a Job', desc: 'Apply for jobs at the Job Centre until you get one.', track: { state: function (l) { return !!l.job; } }, tab: 'school', stars: 3, when: function (l) { return !l.job && !l.edu.course; } },
    { id: 'ya_study', stage: 'young', emoji: '🎓', name: 'Study for Your Course', desc: 'Study hard twice.', track: { act: 'study', n: 2 }, tab: 'school', stars: 2, when: function (l) { return !!l.edu.course; } },
    { id: 'ya_work', stage: 'young', emoji: '💪', name: 'Impress the Boss', desc: 'Work hard twice.', track: { act: 'workHard', n: 2 }, tab: 'school', stars: 2, when: function (l) { return !!l.job; } },
    { id: 'ya_skill', stage: 'young', emoji: '🧠', name: 'Learn New Skills', desc: 'Do 2 learning activities: coding, music, reading, cooking or a museum trip.', track: { act: 'activity', ids: ['code', 'instrument', 'read', 'museum', 'cook', 'yoga'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ya_money', stage: 'young', emoji: '🪙', name: 'Manage Your Money', desc: 'Sort out your budget in the money game.', track: { game: 'quiz', kind: 'money' }, stars: 2 },
    { id: 'ya_moveout', stage: 'young', emoji: '🔑', name: 'Move Out', desc: 'Rent or buy your own home.', track: { state: function (l) { return l.home.type !== 'family'; } }, tab: 'home', stars: 2, min: 20, when: function (l) { return l.home.type === 'family'; } },
    { id: 'ya_licence', stage: 'young', emoji: '🚦', name: 'Learn to Drive', desc: 'Pass your driving test.', track: { state: function (l) { return l.licence; } }, tab: 'home', stars: 2, when: function (l) { return !l.licence; } },
    { id: 'ya_social', stage: 'young', emoji: '🥳', name: 'Social Butterfly', desc: 'Make a friend or spend time with one.', track: { act: ['makeFriend', 'spendTime'], roles: ['friend'], n: 1 }, tab: 'people', stars: 1 },
    { id: 'ya_fit', stage: 'young', emoji: '🏋️', name: 'Stay Healthy', desc: 'Do 2 healthy things: gym, swimming, yoga or a healthy meal.', track: { act: 'activity', ids: ['gym', 'swim', 'yoga', 'cook', 'bike'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ya_jobs', stage: 'young', emoji: '🧺', name: 'Adulting 101', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },

    /* Adult 30–49 */
    { id: 'ad_house', stage: 'adult', emoji: '🏠', name: 'Manage the Household', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 2 },
    { id: 'ad_bills', stage: 'adult', emoji: '🧾', name: 'Pay the Bills', desc: 'Sort out the household bills in the money game.', track: { game: 'quiz', kind: 'bills' }, stars: 2 },
    { id: 'ad_kids', stage: 'adult', emoji: '🧸', name: 'Look After the Children', desc: 'Spend time with your children twice.', track: { act: 'spendTime', roles: KIDS_ROLES, n: 2 }, tab: 'people', stars: 2, when: kidsAtHome },
    { id: 'ad_shop', stage: 'adult', emoji: '🛒', name: 'Weekly Shop', desc: 'Find all the healthy food for the family.', track: { game: 'find', kind: 'healthy' }, stars: 2 },
    { id: 'ad_work', stage: 'adult', emoji: '💼', name: 'Busy at Work', desc: 'Work hard twice.', track: { act: 'workHard', n: 2 }, tab: 'school', stars: 2, when: function (l) { return !!l.job; } },
    { id: 'ad_findwork', stage: 'adult', emoji: '🔍', name: 'Find Work', desc: 'Get a job from the Job Centre.', track: { state: function (l) { return !!l.job; } }, tab: 'school', stars: 2, when: function (l) { return !l.job && !l.edu.course && !l.retired; } },
    { id: 'ad_family', stage: 'adult', emoji: '💞', name: 'Family Time', desc: 'Spend time with someone in your family.', track: { act: 'spendTime', roles: FAMILY, n: 1 }, tab: 'people', stars: 1, when: function (l) { return people(l, FAMILY).length > 0; } },
    { id: 'ad_pet', stage: 'adult', emoji: '🐾', name: 'Pet Care', desc: 'Play with your pet.', track: { act: 'playPet', n: 1 }, tab: 'pets', stars: 1, when: function (l) { return l.pets.length > 0; } },
    { id: 'ad_fit', stage: 'adult', emoji: '🧘', name: 'Me Time', desc: 'Do 2 healthy or relaxing activities.', track: { act: 'activity', ids: ['gym', 'swim', 'yoga', 'cook', 'bike', 'garden'], n: 2 }, tab: 'activities', stars: 1 },

    /* Older adult 50–69 */
    { id: 'ol_hobby', stage: 'older', emoji: '🌷', name: 'Hobby Time', desc: 'Complete 2 hobbies: gardening, knitting, music, baking or reading.', track: { act: 'activity', ids: ['garden', 'knit', 'instrument', 'baking', 'read', 'walk'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ol_family', stage: 'older', emoji: '👨‍👩‍👧', name: 'Family First', desc: 'Spend time with your family twice.', track: { act: 'spendTime', roles: FAMILY, n: 2 }, tab: 'people', stars: 2, when: function (l) { return people(l, FAMILY).length > 0; } },
    { id: 'ol_friends', stage: 'older', emoji: '☕', name: 'Catch Up with Friends', desc: 'Make a friend or spend time with one.', track: { act: ['makeFriend', 'spendTime'], roles: ['friend'], n: 1 }, tab: 'people', stars: 1 },
    { id: 'ol_retire', stage: 'older', emoji: '🏖️', name: 'Enjoy Retirement', desc: 'Do 2 fun things: a holiday, the cinema, gardening, bowls or a walk.', track: { act: 'activity', ids: ['holiday', 'cinema', 'garden', 'bowls', 'walk', 'party'], n: 2 }, tab: 'activities', stars: 2, when: function (l) { return l.retired || !l.job; } },
    { id: 'ol_work', stage: 'older', emoji: '💼', name: 'Experienced Worker', desc: 'Work hard and show the youngsters how it\'s done!', track: { act: 'workHard', n: 1 }, tab: 'school', stars: 1, when: function (l) { return !!l.job; } },
    { id: 'ol_brain', stage: 'older', emoji: '🧩', name: 'Brain Teaser', desc: 'Solve the quiz to keep your mind sharp.', track: { game: 'quiz', kind: 'facts' }, stars: 2 },
    { id: 'ol_fit', stage: 'older', emoji: '🚶', name: 'Stay Active', desc: 'Go for walks, swim or do yoga twice.', track: { act: 'activity', ids: ['walk', 'swim', 'yoga', 'bike', 'bowls'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'ol_jobs', stage: 'older', emoji: '🏡', name: 'Keep House', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 },

    /* Grandparent 70+ */
    { id: 'gp_grandkids', stage: 'grand', emoji: '👵', name: 'Grandparent Time', desc: 'Spend time with your children or grandchildren.', track: { act: 'spendTime', roles: GRAND_ROLES, n: 1 }, tab: 'people', stars: 2, when: function (l) { return people(l, GRAND_ROLES).length > 0; } },
    { id: 'gp_stories', stage: 'grand', emoji: '📜', name: 'Story Time', desc: 'Tell stories from long ago.', track: { act: 'activity', ids: ['stories'], n: 1 }, tab: 'activities', stars: 1 },
    { id: 'gp_hobby', stage: 'grand', emoji: '🧶', name: 'Gentle Hobbies', desc: 'Do 2 hobbies: gardening, knitting, bowls or a walk.', track: { act: 'activity', ids: ['garden', 'knit', 'bowls', 'walk', 'read'], n: 2 }, tab: 'activities', stars: 1 },
    { id: 'gp_glasses', stage: 'grand', emoji: '👓', name: 'Where Are My Glasses?', desc: 'Find your glasses, keys and purse!', track: { game: 'find', kind: 'glasses' }, stars: 2 },
    { id: 'gp_words', stage: 'grand', emoji: '📰', name: 'Crossword Time', desc: 'Solve today\'s word puzzle.', track: { game: 'quiz', kind: 'words' }, stars: 2 },
    { id: 'gp_happy', stage: 'grand', emoji: '🌻', name: 'Happy Days', desc: 'Get your Happiness to 60 or more.', track: { state: function (l) { return l.stats.happy >= 60; } }, tab: 'activities', stars: 1 },
    { id: 'gp_friends', stage: 'grand', emoji: '🫖', name: 'Tea with Friends', desc: 'Make a friend or spend time with one.', track: { act: ['makeFriend', 'spendTime'], roles: ['friend'], n: 1 }, tab: 'people', stars: 1 },
    { id: 'gp_jobs', stage: 'grand', emoji: '💊', name: 'Look After Yourself', desc: 'Finish all your daily jobs.', track: { chores: true }, tab: 'chores', stars: 1 }
  ];
  BAL.CHALLENGES = C;

  BAL.ACHIEVEMENTS.push(
    { id: 'challenger', name: 'Challenge Accepted', emoji: '🎯', desc: 'Complete 25 challenges.' },
    { id: 'champion', name: 'Challenge Champion', emoji: '🏅', desc: 'Complete 100 challenges.' },
    { id: 'quizwhiz', name: 'Quiz Whiz', emoji: '💡', desc: 'Get every answer right in 10 quizzes.' },
    { id: 'all_stages', name: 'Life Explorer', emoji: '🗺️', desc: 'Reach the Grandparent stage.' }
  );

  /* ----- making each year's challenges ----- */
  G.challenge = function (id) { return byId(C, id); };
  function eligible(l, c) {
    if (c.stage !== G.stage(l.age)) return false;
    if (c.min && l.age < c.min) return false;
    if (c.when && !c.when(l)) return false;
    return true;
  }
  G.goalsFor = function (l) { return C.filter(function (c) { return eligible(l, c); }); };

  G.makeGoals = function (l) {
    // never hand out a challenge that is already finished (e.g. "be happy" when already happy)
    var pool = G.goalsFor(l).filter(function (c) { return (c.fixed && c.fixed.indexOf(l.age) >= 0) || !(c.track.state && c.track.state(l)); });
    var chosen = pool.filter(function (c) { return c.fixed && c.fixed.indexOf(l.age) >= 0; });
    var last = l.lastGoals || [];
    var rest = pool.filter(function (c) { return chosen.indexOf(c) < 0; });
    var fresh = rest.filter(function (c) { return last.indexOf(c.id) < 0; });
    // prefer a mix: at most one mini-game and one "daily jobs" challenge, avoiding last year's
    function take(list) {
      while (chosen.length < 3 && list.length) {
        var c = list.splice(Math.floor(G.rng() * list.length), 1)[0];
        var games = chosen.filter(function (x) { return x.track.game; }).length;
        var chores = chosen.filter(function (x) { return x.track.chores; }).length;
        if ((c.track.game && games >= 1) || (c.track.chores && chores >= 1)) continue;
        if (chosen.indexOf(c) < 0) chosen.push(c);
      }
    }
    take(fresh.slice());
    take(rest.slice());
    if (chosen.length < 3) rest.forEach(function (c) { if (chosen.length < 3 && chosen.indexOf(c) < 0) chosen.push(c); });
    l.goals = chosen.slice(0, 3).map(function (c) { return { id: c.id, p: 0, n: c.track.n || 1, done: false }; });
    l.goalsAge = l.age;
    if (G.stage(l.age) === 'grand') G.unlock(l, 'all_stages');
    l.lastGoals = l.goals.map(function (g) { return g.id; });
    checkGoals(l);
    return l.goals;
  };
  G.ensureGoals = function (l) {
    if (l.ended) return;
    if (!Array.isArray(l.goals) || l.goalsAge !== l.age) G.makeGoals(l);
    if (!l.totals.challenges) l.totals.challenges = 0;
    if (!l.totals.stars) l.totals.stars = 0;
  };

  /* ----- progress & rewards ----- */
  G.goalReward = function (l, c) {
    var st = G.stage(l.age);
    return { coins: Math.round(COINS[st] * c.stars * (st === 'baby' || st === 'toddler' ? 1 : G.town(l).pay)), stars: c.stars };
  };
  function complete(l, g) {
    if (g.done) return null;
    var c = G.challenge(g.id);
    g.done = true; g.p = g.n;
    var rw = G.goalReward(l, c);
    G._addCoins(l, rw.coins);
    G.applyFx(l, { happy: 3 });
    l.totals.challenges = (l.totals.challenges || 0) + 1;
    l.totals.stars = (l.totals.stars || 0) + rw.stars;
    if (l.totals.challenges >= 25) G.unlock(l, 'challenger');
    if (l.totals.challenges >= 100) G.unlock(l, 'champion');
    var all = l.goals.every(function (x) { return x.done; });
    if (all) { l.totals.stars += 1; G.addLog(l, 'Completed all the challenges for age ' + l.age + '!', '🏆'); }
    return { id: c.id, name: c.name, emoji: c.emoji, coins: rw.coins, stars: rw.stars, all: all };
  }
  function checkGoals(l) {
    var out = [];
    // A challenge that can no longer be done (e.g. "Find a job" after starting university) is swapped.
    (l.goals || []).forEach(function (g, i) {
      if (g.done) return;
      var c = G.challenge(g.id);
      if (!c || !c.when || c.when(l)) return;
      var t = c.track;
      if ((t.state && t.state(l))) return; // about to be completed below
      var taken = l.goals.map(function (x) { return x.id; });
      var pool = G.goalsFor(l).filter(function (x) { return taken.indexOf(x.id) < 0; });
      if (pool.length) { var nc = pick(pool); l.goals[i] = { id: nc.id, p: 0, n: nc.track.n || 1, done: false, swappedFrom: c.name }; }
      else g.done = true;
    });
    (l.goals || []).forEach(function (g) {
      if (g.done) return;
      var c = G.challenge(g.id);
      if (!c) { g.done = true; return; }
      var t = c.track;
      if ((t.state && t.state(l)) || (t.chores && l.chores.length && l.chores.every(function (x) { return x.done; }))) {
        var r = complete(l, g); if (r) out.push(r);
      }
    });
    return out;
  }
  G.checkGoals = checkGoals;

  // Called by Game.run after every successful action.
  G.trackGoals = function (l, act, args) {
    if (!l.goals) return [];
    var done = [];
    l.goals.forEach(function (g) {
      if (g.done) return;
      var c = G.challenge(g.id); if (!c) return;
      var t = c.track;
      if (!t.act) return;
      var acts = Array.isArray(t.act) ? t.act : [t.act];
      if (acts.indexOf(act) < 0) return;
      if (t.ids && t.ids.indexOf(args[0]) < 0) return;
      if (t.roles && act === 'spendTime') {
        var p = G.person(l, args[0]);
        if (!p || t.roles.indexOf(p.role) < 0) return;
      }
      g.p += 1;
      if (g.p >= g.n) { var r = complete(l, g); if (r) done.push(r); }
    });
    return done.concat(checkGoals(l));
  };

  G.goalsLeft = function (l) { return (l.goals || []).filter(function (g) { return !g.done; }).length; };
  G.canAgeUp = function (l) { return G.goalsLeft(l) === 0; };

  /* ----- actions ----- */
  var A = G.actions;
  A.checkGoals = function () { return { ok: true, msg: '', emoji: '' }; }; // run() does the checking
  A.completeGame = function (l, idx, score, total) {
    var g = l.goals && l.goals[idx];
    if (!g || g.done) return { ok: false, msg: 'Already done!', emoji: '✅' };
    var c = G.challenge(g.id);
    if (!c.track.game) return { ok: false, msg: '?', emoji: '?' };
    var need = c.track.game === 'quiz' ? G.quizPass(c.track.kind, total) : total;
    if (score < need) return { ok: false, msg: 'So close! You need ' + need + ' right. Have another go! 💪', emoji: '🤞' };
    if (c.track.game === 'quiz' && score === total) {
      l.totals.perfectQuizzes = (l.totals.perfectQuizzes || 0) + 1;
      if (l.totals.perfectQuizzes >= 10) G.unlock(l, 'quizwhiz');
    }
    var r = complete(l, g);
    var res = { ok: true, msg: c.name + ' complete! ' + (score === total ? 'Perfect score! 🌟' : 'Well done! 👏'), emoji: c.emoji, celebrate: true };
    res.goalsDoneExtra = r ? [r] : [];
    return res;
  };
  A.swapGoal = function (l, idx) {
    var g = l.goals && l.goals[idx];
    if (!g || g.done) return { ok: false, msg: 'You can only swap a challenge you haven\'t finished.', emoji: '🙂' };
    if (l.flags.swapped) return { ok: false, msg: 'You can swap one challenge each year.', emoji: '🔄' };
    var taken = l.goals.map(function (x) { return x.id; });
    var pool = G.goalsFor(l).filter(function (c) { return taken.indexOf(c.id) < 0 && !(c.fixed && c.fixed.indexOf(l.age) >= 0); });
    if (G.challenge(g.id).fixed && G.challenge(g.id).fixed.indexOf(l.age) >= 0) return { ok: false, msg: 'This one is too important to swap — you can do it! 💪', emoji: '⭐' };
    if (!pool.length) return { ok: false, msg: 'There are no other challenges to swap to right now.', emoji: '🙂' };
    var c = pick(pool);
    l.goals[idx] = { id: c.id, p: 0, n: c.track.n || 1, done: false };
    l.flags.swapped = true;
    return { ok: true, msg: 'New challenge: ' + c.name + '!', emoji: '🔄' };
  };
  A.rest = function (l) {
    if (l.energy > 0) return { ok: false, msg: 'You still have energy left!', emoji: '⚡' };
    if (G.canAgeUp(l)) return { ok: false, msg: 'All your challenges are done — it\'s time for your birthday! 🎂', emoji: '🎂' };
    l.energy = l.maxEnergy;
    G.applyFx(l, { health: 2 });
    return { ok: true, msg: 'What a lovely rest! Your energy is full again. ⚡', emoji: '😴' };
  };

  // Wrap run() so mini-game completions are reported like other completions.
  var run = G.run;
  G.run = function () {
    var res = run.apply(null, arguments);
    if (res && res.goalsDoneExtra) { res.goalsDone = (res.goalsDone || []).concat(res.goalsDoneExtra); delete res.goalsDoneExtra; }
    return res;
  };

  /* ----- mini-games ----- */
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(G.rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function mc(q, answer, wrong, art) { return { q: q, art: art || '', answer: String(answer), options: shuffle([String(answer)].concat(wrong.map(String))) }; }
  function nearNums(ans, n, spread) {
    // distinct, non-negative wrong answers near the right one (always terminates)
    var cands = [];
    for (var v = Math.max(0, ans - spread); v <= ans + spread + n; v++) if (v !== ans) cands.push(v);
    return shuffle(cands).slice(0, n);
  }
  G.quizPass = function (kind, total) { return kind === 'exam' ? Math.min(3, total) : Math.max(1, total - 1); };

  var SHAPES = [['circle', '🔴'], ['square', '🟦'], ['triangle', '🔺'], ['star', '⭐'], ['heart', '💜'], ['diamond', '🔶']];
  var SOUNDS = [['Moo', '🐮'], ['Woof', '🐶'], ['Meow', '🐱'], ['Quack', '🦆'], ['Baa', '🐑'], ['Oink', '🐷'], ['Neigh', '🐴'], ['Roar', '🦁']];
  var COLOURS = [['yellow', '🍌'], ['red', '🍓'], ['green', '🥦'], ['orange', '🍊'], ['purple', '🍇'], ['blue', '🫐'], ['brown', '🥔'], ['white', '🥛']];
  var SPELL = [['because', ['becuase', 'becos']], ['friend', ['freind', 'frend']], ['school', ['skool', 'shcool']], ['beautiful', ['beautifull', 'butiful']], ['Wednesday', ['Wensday', 'Wednsday']],
    ['necessary', ['neccessary', 'necesary']], ['separate', ['seperate', 'separete']], ['animal', ['animel', 'aminal']], ['people', ['peeple', 'poeple']], ['answer', ['anser', 'answor']],
    ['February', ['Febuary', 'Februery']], ['library', ['libary', 'librery']], ['island', ['iland', 'islend']], ['science', ['sience', 'scince']], ['different', ['diffrent', 'diferent']]];
  var FACTS = [
    ['How many legs does a spider have?', '8', ['6', '10']], ['Which planet do we live on?', 'Earth', ['Mars', 'Jupiter']],
    ['What do bees make?', 'Honey', ['Milk', 'Jam']], ['How many days are in a week?', '7', ['5', '10']],
    ['Which is the largest ocean?', 'Pacific', ['Atlantic', 'Indian']], ['What gas do plants take in?', 'Carbon dioxide', ['Oxygen', 'Helium']],
    ['How many continents are there?', '7', ['5', '9']], ['What is frozen water called?', 'Ice', ['Steam', 'Sand']],
    ['Which animal is the tallest?', 'Giraffe', ['Elephant', 'Horse']], ['What is the capital of England?', 'London', ['Paris', 'Rome']],
    ['How many minutes are in an hour?', '60', ['100', '30']], ['Which is the closest star to Earth?', 'The Sun', ['The Moon', 'Mars']],
    ['What colour do you get mixing blue and yellow?', 'Green', ['Purple', 'Orange']], ['How many sides does a hexagon have?', '6', ['5', '8']],
    ['Which organ pumps blood?', 'Heart', ['Lungs', 'Brain']], ['What do caterpillars turn into?', 'Butterflies', ['Bees', 'Birds']],
    ['Which month has the fewest days?', 'February', ['June', 'April']], ['What is the biggest mammal?', 'Blue whale', ['Elephant', 'Shark']]
  ];
  var WORDS = [
    ['Which word means very big?', 'Huge', ['Tiny', 'Quick']], ['What is the opposite of hot?', 'Cold', ['Warm', 'Sunny']],
    ['Which word means happy?', 'Cheerful', ['Grumpy', 'Sleepy']], ['What is the opposite of early?', 'Late', ['Soon', 'Fast']],
    ['Which word rhymes with cat?', 'Hat', ['Dog', 'Cup']], ['Which word means very small?', 'Tiny', ['Giant', 'Loud']],
    ['What is the opposite of up?', 'Down', ['Over', 'Left']], ['Which word means fast?', 'Quick', ['Slow', 'Heavy']],
    ['Which word rhymes with moon?', 'Spoon', ['Star', 'Sun']], ['What is a baby cat called?', 'Kitten', ['Puppy', 'Calf']],
    ['What is a baby sheep called?', 'Lamb', ['Foal', 'Chick']], ['What is the opposite of ancient?', 'Modern', ['Old', 'Dusty']]
  ];
  function fromList(list, n, fn) { return shuffle(list).slice(0, n).map(fn); }

  G.makeQuiz = function (kind, age) {
    var qs = [];
    var i;
    if (kind === 'shapes') qs = fromList(SHAPES, 3, function (s) { return mc('Which one is the ' + s[0] + '?', s[1], shuffle(SHAPES.filter(function (x) { return x !== s; })).slice(0, 2).map(function (x) { return x[1]; })); });
    else if (kind === 'colours') {
      qs = fromList(COLOURS, 2, function (s) { return mc('Which one is ' + s[0] + '?', s[1], shuffle(COLOURS.filter(function (x) { return x !== s; })).slice(0, 2).map(function (x) { return x[1]; })); })
        .concat(fromList(SOUNDS, 1, function (s) { return mc('Which animal says "' + s[0] + '"?', s[1], shuffle(SOUNDS.filter(function (x) { return x !== s; })).slice(0, 2).map(function (x) { return x[1]; })); }));
    } else if (kind === 'counting') {
      var things = ['🍎', '⭐', '🐥', '🎈', '🍪', '🐟'];
      for (i = 0; i < 3; i++) {
        var n = randInt(1, 6), e = pick(things);
        var wrongN = shuffle([1, 2, 3, 4, 5, 6, 7].filter(function (v) { return v !== n; })).slice(0, 2);
        qs.push(mc('How many ' + e + ' can you count?', n, wrongN, new Array(n + 1).join(e)));
      }
    } else if (kind === 'maths') {
      for (i = 0; i < 3; i++) {
        var a, b, ans, q;
        if (age < 9) { a = randInt(1, 10); b = randInt(1, 10); if (G.rng() < 0.5 || a < b) { ans = a + b; q = a + ' + ' + b; } else { ans = a - b; q = a + ' − ' + b; } }
        else if (age < 13) { a = randInt(2, 12); b = randInt(2, 12); if (G.rng() < 0.6) { ans = a * b; q = a + ' × ' + b; } else { ans = a * 10 + b; q = (a * 10) + ' + ' + b; } }
        else { a = randInt(3, 12); b = randInt(11, 25); if (G.rng() < 0.5) { ans = a * b; q = a + ' × ' + b; } else { ans = b; q = '? + ' + a + ' = ' + (a + b); } }
        qs.push(mc('What is ' + q + '?', ans, nearNums(ans, 2, Math.max(3, Math.round(ans * 0.2)))));
      }
    } else if (kind === 'spelling') qs = fromList(SPELL, 3, function (s) { return mc('Which is spelled correctly?', s[0], s[1]); });
    else if (kind === 'facts') qs = fromList(FACTS, 3, function (f) { return mc(f[0], f[1], f[2]); });
    else if (kind === 'words') qs = fromList(WORDS, 3, function (f) { return mc(f[0], f[1], f[2]); });
    else if (kind === 'exam') {
      qs = G.makeQuiz('maths', 15).slice(0, 2).concat(fromList(FACTS, 1, function (f) { return mc(f[0], f[1], f[2]); }), fromList(SPELL, 1, function (s) { return mc('Which is spelled correctly?', s[0], s[1]); }));
    } else if (kind === 'money' || kind === 'bills') {
      var earn = randInt(8, 14) * 10, rent = randInt(2, 4) * 10, food = randInt(1, 2) * 10;
      qs.push(mc('You earn ' + earn + ' coins. Rent is ' + rent + ' and food is ' + food + '. How much is left?', earn - rent - food, nearNums(earn - rent - food, 2, 10)));
      var save = randInt(2, 6) * 5, weeks = randInt(3, 6);
      qs.push(mc('You save ' + save + ' coins every week. How much after ' + weeks + ' weeks?', save * weeks, nearNums(save * weeks, 2, 15)));
      if (kind === 'bills') {
        qs.push(pick([
          mc('Which should you pay first?', '🏠 Rent', ['🎮 New game', '🍬 Sweets']),
          mc('Which is a household bill?', '💡 Electricity', ['🎢 Theme park', '🧸 Toy shop']),
          mc('The water bill is 30 coins and the energy bill is 45. What is the total?', '75', ['65', '85'])
        ]));
      } else {
        qs.push(pick([
          mc('Which is the best way to save money?', '🐷 Put some away each week', ['🛍️ Spend it all at once', '🙈 Forget about it']),
          mc('A jumper costs 40 coins. It is half price! How much is it now?', '20', ['30', '10']),
          mc('Which do you NEED most?', '🍞 Food', ['🕶️ Sunglasses', '🎮 Games'])
        ]));
      }
    }
    return qs;
  };

  var FIND = {
    toys: { title: 'Find all the toys!', targets: ['🧸', '🪀', '🪁', '🧩', '🚂', '🎈'], others: ['🍌', '🧦', '🥄', '🪴', '👟', '🍼', '🧴', '🛁'], n: 3 },
    tidy: { title: 'Tidy up! Find all the toys.', targets: ['🧸', '🚗', '🧩', '🪀', '🎾', '🪁'], others: ['🥛', '👕', '🍎', '🥄', '📗', '🧦', '🪥', '🛏️'], n: 4 },
    recycling: { title: 'Find everything that can be recycled!', targets: ['📰', '🥫', '📦', '🍾', '🧃', '🗞️'], others: ['🍌', '🧸', '🖍️', '🍕', '🧦', '🪴', '🍩', '🎈'], n: 4 },
    healthy: { title: 'Find all the healthy food!', targets: ['🍎', '🥦', '🥕', '🍌', '🍐', '🥬', '🍇'], others: ['🍩', '🍭', '🍟', '🧁', '🍫', '🍬', '🥤', '🍦'], n: 5 },
    glasses: { title: 'Find your glasses, keys and purse!', targets: ['👓', '🔑', '👛'], others: ['📰', '☕', '🧶', '📺', '🪴', '📚', '🕰️', '🧸', '🍪', '🛋️', '🖼️', '🧦'], n: 3 }
  };
  G.makeFind = function (kind) {
    var f = FIND[kind] || FIND.toys;
    var targets = shuffle(f.targets).slice(0, f.n);
    var size = 12;
    var cells = targets.slice();
    while (cells.length < size) cells.push(pick(f.others));
    return { title: f.title, targets: targets, cells: shuffle(cells) };
  };
})(globalThis.BAL = globalThis.BAL || {});
