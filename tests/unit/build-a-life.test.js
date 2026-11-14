// Unit tests for the Build a Life game engine (build-a-life/js/game.js).
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../../build-a-life/js/data.js');
await import('../../build-a-life/js/game.js');
await import('../../build-a-life/js/avatar.js');
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
