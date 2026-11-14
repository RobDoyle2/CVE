// Unit tests for the Build a Life game engine (build-a-life/js/game.js).
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../../build-a-life/js/data.js');
await import('../../build-a-life/js/wardrobe.js');
await import('../../build-a-life/js/game.js');
await import('../../build-a-life/js/avatar.js');
await import('../../build-a-life/js/storage.js');
const BAL = globalThis.BAL;
const G = BAL.Game;

function lucky() { G.rng = () => 0.01; }      // every chance succeeds
function unlucky() { G.rng = () => 0.99; }    // every chance fails
function grow(life, years, onYear) {
  for (let i = 0; i < years && !life.ended; i++) {
    const rep = G.ageUp(life);
    if (onYear) onYear(rep);
  }
}

test('a new life starts as a baby with family, energy and daily jobs', () => {
  lucky();
  const l = G.newLife({ name: 'Mia', gender: 'girl', townId: 'bubble', familyType: 'mums' });
  assert.equal(l.age, 0);
  assert.equal(l.name, 'Mia');
  assert.equal(l.townId, 'bubble');
  assert.equal(l.people.filter(p => p.role === 'mum').length, 2);
  assert.ok(l.energy > 0 && l.energy === l.maxEnergy);
  assert.ok(l.chores.length >= 3);
  assert.equal(l.coins, 0);
});

test('activities use energy and change stats; out of energy is refused', () => {
  lucky();
  const l = G.newLife({ name: 'Leo' });
  grow(l, 1);
  const before = l.stats.smarts;
  const res = G.run(l, 'activity', 'words');
  assert.ok(res.ok);
  assert.ok(l.stats.smarts > before);
  assert.ok(l.achievements.includes('first_words'));
  while (l.energy > 0) G.run(l, 'activity', 'giggle');
  const tired = G.run(l, 'activity', 'giggle');
  assert.equal(tired.ok, false);
});

test('ageing up gives birthdays, school and a choice at 18', () => {
  lucky();
  const l = G.newLife({ name: 'Ava' });
  let sawFuture = false;
  grow(l, 18, rep => { if (rep.choice === 'future') sawFuture = true; });
  assert.equal(l.age, 18);
  assert.ok(sawFuture);
  assert.equal(l.edu.level, 2);
  assert.ok(l.coins > 0, 'birthday gifts and pocket money add up');
  assert.ok(l.achievements.includes('graduate'));
});

test('university leads to a degree and better jobs; promotions work', () => {
  lucky();
  const l = G.newLife({ name: 'Theo' });
  grow(l, 18);
  l.stats.smarts = 90; l.stats.fitness = 80;
  assert.ok(G.run(l, 'chooseFuture', 'uni').ok);
  assert.equal(G.jobCheck(l, G.byId(BAL.JOBS, 'doctor')).ok, false, 'must finish studying first');
  grow(l, 3);
  assert.equal(l.edu.level, 4);
  l.stats.smarts = 90;
  const r = G.run(l, 'applyJob', 'doctor');
  assert.ok(r.ok, r.msg);
  assert.equal(G.salary(l), Math.round(36000 * G.town(l).pay));
  for (let lvl = 1; lvl <= 3; lvl++) {
    grow(l, 1);
    l.job.perf = 95;
    assert.ok(G.run(l, 'askPromotion').ok);
    assert.equal(l.job.level, lvl);
  }
  assert.equal(G.jobTitle(l), 'Head Doctor');
  assert.ok(l.achievements.includes('boss'));
});

test('job applications respect requirements and can fail kindly', () => {
  unlucky();
  const l = G.newLife({ name: 'Kai', age: 18 });
  assert.equal(G.run(l, 'applyJob', 'astronaut').ok, false);
  const r = G.run(l, 'applyJob', 'shop');
  assert.equal(r.ok, false);
  assert.match(r.msg, /Keep trying/);
});

test('love, wedding and children', () => {
  lucky();
  const l = G.newLife({ name: 'Sam', age: 25 });
  l.coins = 10000;
  assert.equal(G.run(l, 'findLove', 'any').ok, true);
  const p = G.partner(l);
  p.close = 90;
  assert.ok(G.run(l, 'propose', p.id).ok);
  assert.equal(p.role, 'fiance');
  assert.ok(G.run(l, 'wedding', p.id, 'small').ok);
  assert.equal(p.role, 'spouse');
  assert.ok(l.achievements.includes('married'));
  assert.ok(G.run(l, 'haveBaby', 'Poppy', 'girl').ok);
  assert.equal(G.run(l, 'haveBaby', 'Twin').ok, false, 'one baby per year');
  assert.equal(G.children(l)[0].name, 'Poppy');
});

test('children under 18 cannot date', () => {
  lucky();
  const l = G.newLife({ name: 'Zara', age: 12 });
  assert.equal(G.run(l, 'findLove').ok, false);
});

test('pets: kids ask family, adults pay; pets age', () => {
  lucky();
  const kid = G.newLife({ name: 'Finn', age: 8 });
  assert.ok(G.run(kid, 'adoptPet', 'hamster', 'Nibbles').ok);
  assert.equal(G.run(kid, 'adoptPet', 'dog', 'Rex').ok, false, 'only one ask per year');
  grow(kid, 6);
  assert.equal(kid.pets.length, 0, 'hamsters have short lives');
  assert.ok(kid.remembered.some(r => r.name === 'Nibbles'));

  const adult = G.newLife({ name: 'Ivy', age: 30 });
  adult.coins = 50;
  assert.equal(G.run(adult, 'adoptPet', 'dog', 'Rex').ok, false, 'not enough coins');
  adult.coins = 5000;
  const r = G.run(adult, 'adoptPet', 'dog', 'Rex');
  assert.ok(r.ok);
  assert.ok(r.coinsDelta < 0);
});

test('buying a home takes a deposit and yearly payments', () => {
  lucky();
  const l = G.newLife({ name: 'Ruby', age: 20, townId: 'maple' });
  l.coins = 100000;
  assert.ok(G.run(l, 'buyHome', 'flat').ok);
  assert.equal(l.home.type, 'own');
  assert.equal(l.coins, 100000 - 8000);
  assert.equal(l.home.owed, 32000);
  grow(l, 1);
  assert.equal(l.home.owed, 32000 - 1600);
  assert.ok(G.run(l, 'payOffHome').ok);
  assert.equal(l.home.owed, 0);
});

test('shopping, health and daily jobs', () => {
  lucky();
  const l = G.newLife({ name: 'Alfie', age: 10 });
  l.coins = 100;
  assert.ok(G.run(l, 'buyItem', 'capitem').ok);
  assert.equal(l.look.accessory, 'cap');
  assert.equal(G.run(l, 'buyItem', 'capitem').ok, false, 'already owned');
  l.sick = { id: 'cold' };
  const doc = G.run(l, 'clinic', 'gp');
  assert.ok(doc.ok);
  assert.equal(l.sick, null);
  assert.equal(doc.coinsDelta, 0, 'free for children');
  l.chores.forEach((c, i) => G.run(l, 'chore', i));
  assert.equal(l.totals.helper, 1);
});

test('a life always ends gently in old age and can continue as a child', () => {
  lucky();
  const l = G.newLife({ name: 'Grace', age: 30 });
  l.coins = 5000;
  l.people.push(G.makePerson('child', 5, 'boy', { name: 'Oscar' }));
  grow(l, 200);
  assert.ok(l.ended);
  assert.ok(l.age >= 80 && l.age <= 115);
  assert.equal(G.run(l, 'activity', 'read').ok, false);
  const s = G.summary(l);
  assert.ok(s.stars >= 1 && s.stars <= 5);
  const kid = G.children(l)[0];
  const next = G.continueAsChild(l, kid.id);
  assert.equal(next.name, 'Oscar');
  assert.equal(next.generation, 2);
  assert.equal(next.age, kid.age);
  assert.ok(next.coins >= 0);
  assert.equal(next.ended, false);
});

test('the save survives JSON round-trips and avatars render for every stage', () => {
  lucky();
  const l = G.newLife({ name: 'Nia' });
  grow(l, 40);
  const copy = JSON.parse(JSON.stringify(l));
  assert.deepEqual(copy.stats, l.stats);
  for (const age of [0, 6, 15, 30, 80]) {
    const svg = BAL.avatar(l.look, age, 70, { bg: '#fff' });
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});

/* ---------------- Character creation & wardrobe ---------------- */

test('every age group has its own collection with tops, trousers, skirts, dresses, shoes and extras', () => {
  assert.deepEqual(BAL.AGE_GROUPS.map(g => g.id), ['baby', 'toddler', 'child', 'teen', 'adult', 'older']);
  for (const g of BAL.AGE_GROUPS) {
    const bottoms = G.wardrobe('bottom', g.id);
    assert.ok(G.wardrobe('top', g.id).length >= 2, g.id + ' tops');
    assert.ok(bottoms.some(b => b.kind === 'trousers'), g.id + ' trousers');
    assert.ok(bottoms.some(b => b.kind === 'skirt'), g.id + ' skirts');
    assert.ok(bottoms.some(b => b.kind === 'dress'), g.id + ' dresses');
    assert.ok(G.wardrobe('shoes', g.id).filter(x => !x.special).length >= 2, g.id + ' shoes');
    assert.ok(G.wardrobe('extra', g.id).length >= 2, g.id + ' extras');
    const d = G.defaultOutfit(g.id, '#FF6B6B');
    for (const slot of G.SLOTS) assert.ok(G.fits(slot, d[slot], g.id), `default ${slot} fits ${g.id}`);
  }
  for (const slot of G.SLOTS) {
    const ids = BAL.WARDROBE[slot].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, 'unique ids in ' + slot);
  }
});

test('the age group follows the character as they grow', () => {
  assert.equal(G.ageGroup(0), 'baby');
  assert.equal(G.ageGroup(1), 'baby');
  assert.equal(G.ageGroup(3), 'toddler');
  assert.equal(G.ageGroup(9), 'child');
  assert.equal(G.ageGroup(16), 'teen');
  assert.equal(G.ageGroup(40), 'adult');
  assert.equal(G.ageGroup(90), 'older');
  lucky();
  const l = G.newLife({ name: 'Ella' });
  let notes = 0;
  grow(l, 5, rep => { if (rep.newGroup) notes++; });
  assert.equal(notes, 2, 'outgrew baby and toddler clothes');
});

test('identity and pronouns are saved, and any clothes can be worn', () => {
  lucky();
  const l = G.newLife({ name: 'Rowan', gender: 'nonbinary' });
  assert.equal(l.pronouns, 'they');
  assert.equal(G.pronoun(l), 'They');
  const look = JSON.parse(JSON.stringify(l.look));
  look.outfits.adult = Object.assign(look.outfits.adult, { top: 'blazer', bottom: 'party', shoes: 'boots' });
  assert.ok(G.run(l, 'setLook', look, 'Ro', 'girl', 'she').ok);
  assert.equal(l.name, 'Ro');
  assert.equal(l.gender, 'girl');
  assert.equal(l.pronouns, 'she');
  assert.equal(l.look.outfits.adult.bottom, 'party');
});

test('Change Your Look is free; special items must be bought in the shop first', () => {
  lucky();
  const l = G.newLife({ name: 'Max', age: 10 });
  l.coins = 1000;
  const look = JSON.parse(JSON.stringify(l.look));
  look.hair = 'afro'; look.skin = BAL.LOOKS.skins[4]; look.eyes = BAL.LOOKS.eyes[2]; look.hairColor = '#9B5DE5';
  look.accessory = 'sunhat';
  look.outfits.child = { top: 'hoodie', bottom: 'tutu', shoes: 'wellies', extra: 'scarf', topColor: '#69DB7C', bottomColor: '#F783AC', shoesColor: '#FFD43B', extraColor: '#FF6B6B' };
  const r = G.run(l, 'setLook', look);
  assert.ok(r.ok);
  assert.equal(r.coinsDelta, 0, 'free');
  assert.equal(l.coins, 1000);
  assert.equal(l.look.outfits.child.bottom, 'tutu');

  const cape = JSON.parse(JSON.stringify(l.look));
  cape.outfits.child.extra = 'cape';
  assert.equal(G.run(l, 'setLook', cape).ok, false, 'cape is locked');
  const crown = JSON.parse(JSON.stringify(l.look));
  crown.accessory = 'crown';
  assert.equal(G.run(l, 'setLook', crown).ok, false, 'crown is locked');

  assert.ok(G.run(l, 'buyItem', 'capeitem').ok);
  assert.equal(l.look.outfits.child.extra, 'cape', 'bought cape is worn straight away');
  assert.ok(G.run(l, 'setLook', cape).ok);
});

test('outfits that do not fit an age group fall back to that group\'s free defaults', () => {
  const look = { skin: '#FFE0C7', hair: 'bun', fav: '#FF6B6B', outfits: { baby: { top: 'blazer', bottom: 'jeans', shoes: 'heels', extra: 'stick' } } };
  const o = G.outfitFor(look, 'baby');
  assert.deepEqual([o.top, o.bottom, o.shoes, o.extra], ['bodysuit', 'babygrow', 'booties', 'none']);
});

test('old saves are upgraded: one life per player becomes a list of characters', () => {
  lucky();
  const old = G.newLife({ name: 'Old' });
  old.look = { skin: '#F6C9A0', hair: 'short', hairColor: '#5A3825', eyes: '#3B2314', outfit: '#FF6B6B', accessory: 'cap' };
  old.gender = 'any'; delete old.pronouns;
  const data = BAL.Store.migrate({ profiles: [{ id: 'p1', name: 'Kid', emoji: '🦄', color: '#000', life: old, hall: [] }], activeId: 'p1', sound: true });
  const p = data.profiles[0];
  assert.equal(p.life, undefined);
  assert.equal(p.chars.length, 1);
  assert.equal(p.activeCharId, old.id);
  const l = p.chars[0];
  assert.equal(l.gender, 'me');
  assert.equal(l.pronouns, 'they');
  assert.equal(l.look.fav, '#FF6B6B');
  assert.equal(l.look.outfits.child.topColor, '#FF6B6B');
  assert.equal(l.look.accessory, 'cap');
});

test('each player can keep several characters, each with their own saved life', () => {
  lucky();
  BAL.Store.data = { profiles: [], activeId: null, sound: false };
  const p = BAL.Store.addProfile('Sam', '🐸', '#69DB7C');
  BAL.Store.data.activeId = p.id;
  const a = BAL.Store.addChar(G.newLife({ name: 'Alpha' }));
  const b = BAL.Store.addChar(G.newLife({ name: 'Beta', age: 30 }));
  assert.equal(p.chars.length, 2);
  assert.equal(BAL.Store.activeChar().name, 'Beta');
  grow(b, 5);
  p.activeCharId = a.id;
  assert.equal(BAL.Store.activeChar().age, 0, 'Alpha\'s life is separate');
  assert.equal(b.age, 35);
  BAL.Store.removeChar(a.id);
  assert.equal(p.chars.length, 1);
  assert.equal(BAL.Store.activeChar(), null);
  const kid = G.makePerson('child', 4, 'girl', { name: 'Kiddo' });
  b.people.push(kid);
  BAL.Store.replaceChar(b.id, G.continueAsChild(b, kid.id));
  assert.equal(p.chars.length, 1);
  assert.equal(BAL.Store.activeChar().name, 'Kiddo');
});

test('every clothing item and accessory draws for every age group', () => {
  for (const g of BAL.AGE_GROUPS) {
    for (const slot of G.SLOTS) {
      for (const it of G.wardrobe(slot, g.id)) {
        const look = G.normalizeLook(G.randomLook());
        look.outfits[g.id][slot] = it.id;
        for (const full of [true, false]) {
          const svg = BAL.avatar(look, g.preview, 80, { full });
          assert.doesNotMatch(svg, /NaN|undefined|null/, `${g.id} ${slot} ${it.id}`);
        }
      }
    }
  }
  for (const acc of BAL.LOOKS.accessories) {
    const look = G.normalizeLook(G.randomLook());
    look.accessory = acc.id;
    assert.doesNotMatch(BAL.avatar(look, 30, 50, { full: true }), /NaN|undefined/);
  }
});
