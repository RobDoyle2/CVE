/* Build a Life — wardrobe: identities, age-group clothing collections, colours and accessories.
   Every item is free except a few "special" ones that are unlocked with pretend coins in the Shop.
   All clothes are available to every character, whatever their gender or identity. */
(function (BAL) {
  'use strict';

  BAL.IDENTITIES = [
    { id: 'girl', name: 'Girl', emoji: '👧', pronouns: 'she' },
    { id: 'boy', name: 'Boy', emoji: '👦', pronouns: 'he' },
    { id: 'nonbinary', name: 'Non-binary', emoji: '🌈', pronouns: 'they' },
    { id: 'me', name: 'Just me!', emoji: '⭐', pronouns: 'they' }
  ];
  BAL.PRONOUNS = [
    { id: 'she', name: 'she / her', subj: 'She', obj: 'her', poss: 'her' },
    { id: 'he', name: 'he / him', subj: 'He', obj: 'him', poss: 'his' },
    { id: 'they', name: 'they / them', subj: 'They', obj: 'them', poss: 'their' }
  ];

  BAL.AGE_GROUPS = [
    { id: 'baby', name: 'Babies', emoji: '👶', min: 0, max: 1, ages: '0–1', preview: 0 },
    { id: 'toddler', name: 'Toddlers', emoji: '🧸', min: 2, max: 4, ages: '2–4', preview: 3 },
    { id: 'child', name: 'Children', emoji: '🧒', min: 5, max: 12, ages: '5–12', preview: 8 },
    { id: 'teen', name: 'Teenagers', emoji: '🧑‍🎤', min: 13, max: 17, ages: '13–17', preview: 15 },
    { id: 'adult', name: 'Adults', emoji: '🧑', min: 18, max: 64, ages: '18–64', preview: 30 },
    { id: 'older', name: 'Older Adults', emoji: '🧓', min: 65, max: 999, ages: '65+', preview: 75 }
  ];

  BAL.CLOTH_COLORS = ['#FF6B6B', '#FF9F1C', '#FFD43B', '#69DB7C', '#20C997', '#4DABF7', '#3B5BA5', '#9775FA',
    '#F783AC', '#FFFFFF', '#F1E3C8', '#8D6E63', '#868E96', '#343A40'];

  var ALL = ['baby', 'toddler', 'child', 'teen', 'adult', 'older'];
  var KIDS = ['toddler', 'child'];
  var BIG = ['child', 'teen', 'adult', 'older'];
  var GROWN = ['teen', 'adult', 'older'];

  // slot: top | bottom | shoes | extra.  bottom.kind: trousers | shorts | skirt | dress | onesie | dungarees
  // sleeves (tops): short | long | none
  BAL.WARDROBE = {
    top: [
      { id: 'bodysuit', name: 'Baby Vest', emoji: '🍼', groups: ['baby'], sleeves: 'short' },
      { id: 'bunny', name: 'Bunny Top', emoji: '🐰', groups: ['baby', 'toddler'], sleeves: 'long' },
      { id: 'dino', name: 'Dino Top', emoji: '🦕', groups: ['baby', 'toddler', 'child'], sleeves: 'short' },
      { id: 'rainbow', name: 'Rainbow Jumper', emoji: '🌈', groups: ['toddler', 'child'], sleeves: 'long' },
      { id: 'tee', name: 'T-shirt', emoji: '👕', groups: ['toddler'].concat(BIG), sleeves: 'short' },
      { id: 'longtee', name: 'Long-sleeve Top', emoji: '👚', groups: ['toddler'].concat(BIG), sleeves: 'long' },
      { id: 'stripes', name: 'Stripy Top', emoji: '🦓', groups: ['toddler', 'child', 'teen', 'adult'], sleeves: 'short' },
      { id: 'jumper', name: 'Cosy Jumper', emoji: '🧶', groups: ['toddler'].concat(BIG), sleeves: 'long' },
      { id: 'hoodie', name: 'Hoodie', emoji: '🧥', groups: ['child', 'teen', 'adult'], sleeves: 'long' },
      { id: 'sports', name: 'Sports Shirt', emoji: '⚽', groups: ['child', 'teen', 'adult'], sleeves: 'short' },
      { id: 'polo', name: 'Polo Shirt', emoji: '🎽', groups: BIG, sleeves: 'short' },
      { id: 'school', name: 'School Jumper', emoji: '🏫', groups: ['child', 'teen'], sleeves: 'long' },
      { id: 'shirt', name: 'Shirt', emoji: '👔', groups: BIG, sleeves: 'long' },
      { id: 'vest', name: 'Vest Top', emoji: '🎽', groups: ['child', 'teen', 'adult'], sleeves: 'none' },
      { id: 'blouse', name: 'Frilly Blouse', emoji: '🌸', groups: GROWN, sleeves: 'long' },
      { id: 'denim', name: 'Denim Jacket', emoji: '🧥', groups: ['teen', 'adult'], sleeves: 'long' },
      { id: 'blazer', name: 'Smart Blazer', emoji: '🕴️', groups: GROWN, sleeves: 'long' },
      { id: 'cardigan', name: 'Cardigan', emoji: '🧶', groups: ['adult', 'older'], sleeves: 'long' },
      { id: 'knit', name: 'Patterned Knit', emoji: '❄️', groups: ['adult', 'older'], sleeves: 'long' }
    ],
    bottom: [
      { id: 'babytrousers', name: 'Baby Trousers', emoji: '👖', kind: 'trousers', groups: ['baby'] },
      { id: 'trousers', name: 'Trousers', emoji: '👖', kind: 'trousers', groups: ['toddler'].concat(BIG) },
      { id: 'jeans', name: 'Jeans', emoji: '👖', kind: 'trousers', groups: ['toddler'].concat(BIG) },
      { id: 'joggers', name: 'Joggers', emoji: '🏃', kind: 'trousers', groups: ['toddler'].concat(BIG) },
      { id: 'leggings', name: 'Leggings', emoji: '🦵', kind: 'trousers', groups: ['toddler'].concat(BIG) },
      { id: 'cargo', name: 'Cargo Trousers', emoji: '🎒', kind: 'trousers', groups: ['teen', 'adult'] },
      { id: 'slacks', name: 'Comfy Slacks', emoji: '🛋️', kind: 'trousers', groups: ['older'] },
      { id: 'shorts', name: 'Shorts', emoji: '🩳', kind: 'shorts', groups: ['toddler'].concat(BIG) },
      { id: 'tutu', name: 'Tutu Skirt', emoji: '🩰', kind: 'skirt', groups: ['baby', 'toddler', 'child'] },
      { id: 'skirt', name: 'Skirt', emoji: '🌼', kind: 'skirt', groups: ['toddler'].concat(BIG) },
      { id: 'pleated', name: 'Pleated Skirt', emoji: '🎀', kind: 'skirt', groups: BIG },
      { id: 'maxi', name: 'Long Skirt', emoji: '🌷', kind: 'skirt', groups: GROWN },
      { id: 'dress', name: 'Everyday Dress', emoji: '👗', kind: 'dress', groups: ['toddler'].concat(BIG) },
      { id: 'pinafore', name: 'Pinafore Dress', emoji: '🍓', kind: 'dress', groups: KIDS },
      { id: 'party', name: 'Party Dress', emoji: '🎉', kind: 'dress', groups: ALL },
      { id: 'sundress', name: 'Sundress', emoji: '☀️', kind: 'dress', groups: BIG },
      { id: 'teadress', name: 'Tea Dress', emoji: '🫖', kind: 'dress', groups: ['adult', 'older'] },
      { id: 'babygrow', name: 'Babygrow', emoji: '👶', kind: 'onesie', groups: ['baby'] },
      { id: 'romper', name: 'Romper', emoji: '🐣', kind: 'onesie', groups: ['baby', 'toddler'] },
      { id: 'jumpsuit', name: 'Jumpsuit', emoji: '🪂', kind: 'onesie', groups: ['teen', 'adult'] },
      { id: 'dungarees', name: 'Dungarees', emoji: '🧑‍🌾', kind: 'dungarees', groups: ['baby', 'toddler', 'child', 'teen', 'adult'] }
    ],
    shoes: [
      { id: 'barefoot', name: 'Bare Feet', emoji: '🦶', groups: ['baby', 'toddler', 'child'] },
      { id: 'booties', name: 'Booties', emoji: '🧦', groups: ['baby'] },
      { id: 'socks', name: 'Cosy Socks', emoji: '🧦', groups: ['baby', 'toddler'] },
      { id: 'velcro', name: 'Velcro Shoes', emoji: '👟', groups: KIDS },
      { id: 'lightup', name: 'Light-up Trainers', emoji: '✨', groups: KIDS },
      { id: 'trainers', name: 'Trainers', emoji: '👟', groups: BIG },
      { id: 'hightops', name: 'High-tops', emoji: '👟', groups: ['teen', 'adult'] },
      { id: 'wellies', name: 'Wellies', emoji: '🌧️', groups: ['toddler'].concat(BIG) },
      { id: 'sandals', name: 'Sandals', emoji: '👡', groups: ['toddler'].concat(BIG) },
      { id: 'schoolshoes', name: 'School Shoes', emoji: '👞', groups: ['child', 'teen'] },
      { id: 'boots', name: 'Boots', emoji: '🥾', groups: BIG },
      { id: 'flats', name: 'Ballet Flats', emoji: '🩰', groups: BIG },
      { id: 'smart', name: 'Smart Shoes', emoji: '👞', groups: GROWN },
      { id: 'heels', name: 'Party Heels', emoji: '👠', groups: ['adult'] },
      { id: 'slippers', name: 'Fluffy Slippers', emoji: '🥿', groups: ['toddler'].concat(BIG) },
      { id: 'comfy', name: 'Comfy Shoes', emoji: '👞', groups: ['older'] },
      { id: 'gold', name: 'Golden Trainers', emoji: '🌟', groups: ALL, special: true }
    ],
    extra: [
      { id: 'none', name: 'Nothing', emoji: '🚫', groups: ALL },
      { id: 'bib', name: 'Bib', emoji: '🍼', groups: ['baby', 'toddler'] },
      { id: 'teddy', name: 'Teddy to Hug', emoji: '🧸', groups: ['baby', 'toddler', 'child'] },
      { id: 'scarf', name: 'Scarf', emoji: '🧣', groups: ALL },
      { id: 'bowtie', name: 'Bow Tie', emoji: '🎀', groups: ALL },
      { id: 'backpack', name: 'Backpack', emoji: '🎒', groups: ['toddler', 'child', 'teen', 'adult'] },
      { id: 'tie', name: 'Tie', emoji: '👔', groups: BIG },
      { id: 'necklace', name: 'Necklace', emoji: '📿', groups: GROWN },
      { id: 'bag', name: 'Handbag', emoji: '👜', groups: GROWN },
      { id: 'stick', name: 'Walking Stick', emoji: '🦯', groups: ['older'] },
      { id: 'cape', name: 'Superhero Cape', emoji: '🦸', groups: ALL, special: true }
    ]
  };

  // Head & face accessories are kept for every age.
  BAL.LOOKS.accessories = [
    { id: 'none', name: 'None', emoji: '🚫' }, { id: 'glasses', name: 'Glasses', emoji: '👓' },
    { id: 'sunglasses', name: 'Sunglasses', emoji: '🕶️' }, { id: 'bow', name: 'Hair Bow', emoji: '🎀' },
    { id: 'flower', name: 'Flower', emoji: '🌼' }, { id: 'headband', name: 'Headband', emoji: '〰️' },
    { id: 'cap', name: 'Cap', emoji: '🧢' }, { id: 'beanie', name: 'Woolly Hat', emoji: '🧶' },
    { id: 'sunhat', name: 'Sun Hat', emoji: '👒' }, { id: 'flatcap', name: 'Flat Cap', emoji: '🎩' },
    { id: 'crown', name: 'Sparkly Crown', emoji: '👑', special: true }
  ];

  // Default outfits for each age (all free).
  BAL.DEFAULT_OUTFITS = {
    baby: { top: 'bodysuit', bottom: 'babygrow', shoes: 'booties', extra: 'none' },
    toddler: { top: 'tee', bottom: 'dungarees', shoes: 'velcro', extra: 'none' },
    child: { top: 'tee', bottom: 'jeans', shoes: 'trainers', extra: 'none' },
    teen: { top: 'hoodie', bottom: 'jeans', shoes: 'hightops', extra: 'none' },
    adult: { top: 'jumper', bottom: 'trousers', shoes: 'trainers', extra: 'none' },
    older: { top: 'cardigan', bottom: 'slacks', shoes: 'comfy', extra: 'none' }
  };

  // Shop items that unlock special wardrobe pieces.
  BAL.ITEMS.forEach(function (it) { if (it.id === 'crownitem') it.slot = 'accessory'; if (it.id === 'capitem') it.slot = 'accessory'; });
  BAL.ITEMS.push(
    { id: 'capeitem', cat: 'clothes', name: 'Superhero Cape', emoji: '🦸', price: 250, fx: { happy: 7 }, unlock: 'cape', slot: 'extra' },
    { id: 'golditem', cat: 'clothes', name: 'Golden Trainers', emoji: '🌟', price: 300, fx: { happy: 6, fitness: 2 }, unlock: 'gold', slot: 'shoes' }
  );
  BAL.ROLES.parent = { label: 'Parent', emoji: '🧑' };
})(globalThis.BAL = globalThis.BAL || {});
