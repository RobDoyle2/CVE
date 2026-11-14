/* Build a Life — game data (towns, jobs, homes, cars, pets, shop, events…).
   All money in this game is pretend "coins". There are no real-money purchases. */
(function (BAL) {
  'use strict';

  BAL.START_YEAR = 2026;

  BAL.STATS = [
    { id: 'happy', name: 'Happiness', emoji: '😊', color: '#FFB703' },
    { id: 'health', name: 'Health', emoji: '❤️', color: '#FF5D73' },
    { id: 'smarts', name: 'Smarts', emoji: '🧠', color: '#7B61FF' },
    { id: 'fitness', name: 'Fitness', emoji: '💪', color: '#2EC4B6' }
  ];

  BAL.STAGES = {
    baby: { name: 'Baby', emoji: '🍼', energy: 4 },
    child: { name: 'Child', emoji: '🧒', energy: 5 },
    teen: { name: 'Teenager', emoji: '🧑‍🎤', energy: 6 },
    adult: { name: 'Grown-up', emoji: '🧑', energy: 6 },
    elder: { name: 'Golden Years', emoji: '🧓', energy: 5 }
  };

  /* ---------- Looks ---------- */
  BAL.LOOKS = {
    skins: ['#FFE0C7', '#F6C9A0', '#E0A877', '#BF8556', '#8D5A36', '#5E3B24'],
    hairColors: ['#2B1B12', '#5A3825', '#A0522D', '#E9C46A', '#F7E3AF', '#D1495B', '#9B5DE5', '#3A86FF', '#FF7EB6', '#2EC4B6'],
    hairStyles: [
      { id: 'short', name: 'Short' }, { id: 'long', name: 'Long' }, { id: 'curly', name: 'Curly' },
      { id: 'ponytail', name: 'Ponytail' }, { id: 'pigtails', name: 'Bunches' }, { id: 'bun', name: 'Bun' },
      { id: 'spiky', name: 'Spiky' }, { id: 'afro', name: 'Big & fluffy' }, { id: 'buzz', name: 'Buzz cut' }
    ],
    eyes: ['#3B2314', '#1F6FEB', '#2A9D8F', '#6C757D', '#8338EC'],
    outfits: ['#FF6B6B', '#FF9F1C', '#FFD43B', '#69DB7C', '#4DABF7', '#9775FA', '#F783AC', '#20C997', '#495057'],
    accessories: [
      { id: 'none', name: 'None', emoji: '🚫' }, { id: 'glasses', name: 'Glasses', emoji: '👓' },
      { id: 'bow', name: 'Bow', emoji: '🎀' }, { id: 'cap', name: 'Cap', emoji: '🧢' },
      { id: 'flower', name: 'Flower', emoji: '🌼' }, { id: 'headband', name: 'Headband', emoji: '〰️' },
      { id: 'crown', name: 'Crown', emoji: '👑' }
    ]
  };

  BAL.FAMILY_TYPES = [
    { id: 'mumdad', name: 'Mum & Dad', emoji: '👩‍👨', roles: ['mum', 'dad'] },
    { id: 'mums', name: 'Two Mums', emoji: '👩‍👩', roles: ['mum', 'mum'] },
    { id: 'dads', name: 'Two Dads', emoji: '👨‍👨', roles: ['dad', 'dad'] },
    { id: 'mum', name: 'Just Mum', emoji: '👩', roles: ['mum'] },
    { id: 'dad', name: 'Just Dad', emoji: '👨', roles: ['dad'] },
    { id: 'grand', name: 'Grandparents', emoji: '👵👴', roles: ['grandma', 'grandpa'] }
  ];

  BAL.ROLES = {
    mum: { label: 'Mum', emoji: '👩' }, dad: { label: 'Dad', emoji: '👨' },
    grandma: { label: 'Grandma', emoji: '👵' }, grandpa: { label: 'Grandpa', emoji: '👴' },
    sibling: { label: 'Brother / Sister', emoji: '🧒' }, friend: { label: 'Friend', emoji: '🤝' },
    partner: { label: 'Sweetheart', emoji: '💕' }, fiance: { label: 'Engaged', emoji: '💍' },
    spouse: { label: 'Husband / Wife', emoji: '💑' }, child: { label: 'Child', emoji: '👶' },
    grandchild: { label: 'Grandchild', emoji: '🍼' }
  };

  BAL.NAMES = {
    girl: ['Amelia', 'Olivia', 'Isla', 'Ava', 'Mia', 'Ivy', 'Lily', 'Freya', 'Grace', 'Zara', 'Aisha', 'Maya', 'Poppy', 'Rosie', 'Ella', 'Priya', 'Sofia', 'Luna', 'Nia', 'Hana', 'Chloe', 'Ruby', 'Daisy', 'Esme'],
    boy: ['Oliver', 'Noah', 'Leo', 'Arthur', 'Oscar', 'Theo', 'Finn', 'Jack', 'Harry', 'Max', 'Ali', 'Ravi', 'Kai', 'Sam', 'Ethan', 'Leon', 'Musa', 'Rory', 'Felix', 'Hugo', 'Toby', 'Jasper', 'Omar', 'Alfie'],
    any: ['Alex', 'Charlie', 'Jamie', 'Riley', 'Robin', 'Sky', 'Jordan', 'Frankie', 'Remy', 'Rowan', 'Quinn', 'Sage'],
    pets: ['Biscuit', 'Muffin', 'Pickle', 'Bubbles', 'Whiskers', 'Coco', 'Sprinkles', 'Peanut', 'Ziggy', 'Pudding', 'Noodle', 'Pepper', 'Mango', 'Waffles', 'Luna', 'Buttons', 'Toffee', 'Pip', 'Fudge', 'Sunny']
  };

  /* ---------- Places ---------- */
  BAL.TOWNS = [
    { id: 'maple', name: 'Maple Grove', kind: 'Town', emoji: '🍁', colors: ['#FFD6A5', '#FFADAD'], pay: 1, price: 1,
      desc: 'A friendly town with a big park and a duck pond.', school: 'Maple Grove', bonus: 'happy' },
    { id: 'sunny', name: 'Sunnyvale', kind: 'Village', emoji: '🌻', colors: ['#FDFFB6', '#CAFFBF'], pay: 0.85, price: 0.7,
      desc: 'A sleepy village of sunflower fields and cheap, cosy cottages.', school: 'Sunnyvale Village', bonus: 'happy' },
    { id: 'pebble', name: 'Pebble Bay', kind: 'Seaside Town', emoji: '🏖️', colors: ['#9BF6FF', '#A0C4FF'], pay: 0.95, price: 1.1,
      desc: 'Sandy beaches, ice-cream vans and fresh sea air.', school: 'Pebble Bay', bonus: 'health' },
    { id: 'snow', name: 'Snowpeak', kind: 'Mountain Village', emoji: '🏔️', colors: ['#E0F2FE', '#BDB2FF'], pay: 0.9, price: 0.8,
      desc: 'Snowy mountains, sledging and hot chocolate all winter.', school: 'Snowpeak Mountain', bonus: 'fitness' },
    { id: 'bubble', name: 'Bubbleton', kind: 'City', emoji: '🏙️', colors: ['#BDB2FF', '#FFC6FF'], pay: 1.25, price: 1.35,
      desc: 'A busy city with tall towers, museums and lots of jobs.', school: 'Bubbleton City', bonus: 'smarts' },
    { id: 'star', name: 'Starlight City', kind: 'Big City', emoji: '🌃', colors: ['#A0C4FF', '#FFADAD'], pay: 1.45, price: 1.7,
      desc: 'The glittering capital! Big pay, but everything costs more.', school: 'Starlight Academy', bonus: 'smarts' },
    { id: 'meadow', name: 'Honey Meadow', kind: 'Farm Village', emoji: '🐝', colors: ['#CAFFBF', '#FDFFB6'], pay: 0.8, price: 0.65,
      desc: 'Farms, bees and fields of flowers. Very peaceful!', school: 'Honey Meadow', bonus: 'health' }
  ];

  /* ---------- Education ---------- */
  BAL.EDU_LEVELS = ['Just getting started', 'Primary school', 'Secondary school', 'College diploma', 'University degree'];

  BAL.CLUBS = [
    { id: 'drama', name: 'Drama Club', emoji: '🎭', fx: { happy: 3, smarts: 1 } },
    { id: 'coding', name: 'Coding Club', emoji: '💻', fx: { smarts: 4 } },
    { id: 'art', name: 'Art Club', emoji: '🎨', fx: { happy: 3, smarts: 1 } },
    { id: 'football', name: 'Football Team', emoji: '⚽', fx: { fitness: 4 } },
    { id: 'choir', name: 'Choir', emoji: '🎵', fx: { happy: 4 } },
    { id: 'chess', name: 'Chess Club', emoji: '♟️', fx: { smarts: 3 } },
    { id: 'swim', name: 'Swim Squad', emoji: '🏊', fx: { fitness: 3, health: 1 } },
    { id: 'garden', name: 'Garden Club', emoji: '🌱', fx: { health: 2, happy: 2 } }
  ];

  BAL.COURSES = {
    college: { id: 'college', name: 'College', emoji: '🏫', years: 2, level: 3, desc: 'Learn a practical skill like cooking, building or fixing cars.' },
    uni: { id: 'uni', name: 'University', emoji: '🎓', years: 3, level: 4, desc: 'Study a subject in depth. Opens doors to many jobs!' }
  };

  /* ---------- Jobs ---------- */
  // edu = minimum education level, smarts / fitness = minimum stat. pay = coins per year.
  BAL.PART_TIME = [
    { id: 'paper', name: 'Paper Round', emoji: '📰', pay: 400, minAge: 13 },
    { id: 'babysit', name: 'Babysitter', emoji: '🍼', pay: 550, minAge: 14 },
    { id: 'dogwalk', name: 'Dog Walker', emoji: '🐕', pay: 450, minAge: 13 },
    { id: 'cafe_pt', name: 'Weekend Café Helper', emoji: '🧁', pay: 600, minAge: 15 }
  ];

  BAL.JOBS = [
    { id: 'shop', name: 'Shop Assistant', emoji: '🛒', edu: 2, smarts: 0, fitness: 0, pay: 9000 },
    { id: 'cafe', name: 'Café Barista', emoji: '☕', edu: 2, smarts: 0, fitness: 0, pay: 9500 },
    { id: 'farmer', name: 'Farmer', emoji: '🚜', edu: 1, smarts: 0, fitness: 40, pay: 11000 },
    { id: 'artist', name: 'Artist', emoji: '🎨', edu: 2, smarts: 20, fitness: 0, pay: 10000, happy: 4 },
    { id: 'musician', name: 'Musician', emoji: '🎸', edu: 2, smarts: 20, fitness: 0, pay: 11000, happy: 4 },
    { id: 'hair', name: 'Hairdresser', emoji: '💇', edu: 3, smarts: 20, fitness: 0, pay: 13000 },
    { id: 'builder', name: 'Builder', emoji: '🏗️', edu: 3, smarts: 20, fitness: 50, pay: 15000 },
    { id: 'chef', name: 'Chef', emoji: '🧑‍🍳', edu: 3, smarts: 30, fitness: 0, pay: 15000 },
    { id: 'mechanic', name: 'Mechanic', emoji: '🔧', edu: 3, smarts: 35, fitness: 0, pay: 16000 },
    { id: 'zoo', name: 'Zookeeper', emoji: '🦁', edu: 3, smarts: 30, fitness: 40, pay: 15000, happy: 3 },
    { id: 'fire', name: 'Firefighter', emoji: '🚒', edu: 3, smarts: 35, fitness: 65, pay: 19000 },
    { id: 'police', name: 'Police Officer', emoji: '👮', edu: 3, smarts: 40, fitness: 55, pay: 19000 },
    { id: 'teacher', name: 'Teacher', emoji: '🍎', edu: 4, smarts: 50, fitness: 0, pay: 21000 },
    { id: 'nurse', name: 'Nurse', emoji: '🩺', edu: 4, smarts: 50, fitness: 0, pay: 22000 },
    { id: 'gamedev', name: 'Video Game Designer', emoji: '🎮', edu: 4, smarts: 60, fitness: 0, pay: 26000, happy: 2 },
    { id: 'vet', name: 'Vet', emoji: '🐾', edu: 4, smarts: 70, fitness: 0, pay: 28000 },
    { id: 'pilot', name: 'Pilot', emoji: '✈️', edu: 3, smarts: 65, fitness: 50, pay: 30000 },
    { id: 'scientist', name: 'Scientist', emoji: '🔬', edu: 4, smarts: 75, fitness: 0, pay: 30000 },
    { id: 'doctor', name: 'Doctor', emoji: '🥼', edu: 4, smarts: 80, fitness: 0, pay: 36000 },
    { id: 'football', name: 'Football Star', emoji: '⚽', edu: 2, smarts: 0, fitness: 85, pay: 40000, happy: 3 },
    { id: 'astronaut', name: 'Astronaut', emoji: '🚀', edu: 4, smarts: 88, fitness: 75, pay: 45000, happy: 3 }
  ];
  BAL.JOB_LEVELS = [
    { title: 'Trainee', mult: 1 }, { title: '', mult: 1.25 }, { title: 'Senior', mult: 1.55 }, { title: 'Head', mult: 2 }
  ];

  /* ---------- Homes & cars ---------- */
  BAL.RENTALS = [
    { id: 'tinyflat', name: 'Tiny Flat', emoji: '🏢', rent: 2000, happy: 0 },
    { id: 'apartment', name: 'Cosy Apartment', emoji: '🏬', rent: 3200, happy: 2 },
    { id: 'rentcottage', name: 'Rented Cottage', emoji: '🏡', rent: 4200, happy: 4 }
  ];
  BAL.HOMES = [
    { id: 'flat', name: 'Little Flat', emoji: '🏢', price: 40000, happy: 3 },
    { id: 'cottage', name: 'Country Cottage', emoji: '🏡', price: 70000, happy: 5 },
    { id: 'treehouse', name: 'Treehouse Home', emoji: '🌳', price: 90000, happy: 7 },
    { id: 'family', name: 'Family House', emoji: '🏠', price: 110000, happy: 6 },
    { id: 'beach', name: 'Beach House', emoji: '🏖️', price: 160000, happy: 8 },
    { id: 'villa', name: 'Grand Villa', emoji: '🏛️', price: 260000, happy: 9 },
    { id: 'castle', name: 'Real Castle', emoji: '🏰', price: 650000, happy: 12 }
  ];
  BAL.HOME_DEPOSIT = 0.2;     // pay 20% now…
  BAL.HOME_LOAN_YEARS = 20;   // …and the rest over 20 years (no interest — it's a kids' game!)

  BAL.CARS = [
    { id: 'scooter', name: 'Scooter', emoji: '🛵', price: 1500, happy: 2 },
    { id: 'small', name: 'Little Car', emoji: '🚗', price: 8000, happy: 3 },
    { id: 'familycar', name: 'Family Car', emoji: '🚙', price: 14000, happy: 3 },
    { id: 'electric', name: 'Electric Car', emoji: '🔋', price: 20000, happy: 4 },
    { id: 'pickup', name: 'Pickup Truck', emoji: '🛻', price: 22000, happy: 4 },
    { id: 'camper', name: 'Camper Van', emoji: '🚐', price: 26000, happy: 6 },
    { id: 'sports', name: 'Sports Car', emoji: '🏎️', price: 60000, happy: 8 }
  ];

  /* ---------- Pets ---------- */
  BAL.PETS = [
    { id: 'fish', name: 'Goldfish', emoji: '🐠', fee: 20, cost: 30, life: 9 },
    { id: 'hamster', name: 'Hamster', emoji: '🐹', fee: 40, cost: 50, life: 4 },
    { id: 'guinea', name: 'Guinea Pig', emoji: '🐁', fee: 50, cost: 60, life: 7 },
    { id: 'rabbit', name: 'Rabbit', emoji: '🐰', fee: 80, cost: 90, life: 10 },
    { id: 'cat', name: 'Cat', emoji: '🐱', fee: 150, cost: 200, life: 17 },
    { id: 'dog', name: 'Dog', emoji: '🐶', fee: 200, cost: 300, life: 14 },
    { id: 'parrot', name: 'Parrot', emoji: '🦜', fee: 250, cost: 150, life: 30 },
    { id: 'lizard', name: 'Lizard', emoji: '🦎', fee: 120, cost: 80, life: 15 },
    { id: 'tortoise', name: 'Tortoise', emoji: '🐢', fee: 150, cost: 80, life: 60 },
    { id: 'pony', name: 'Pony', emoji: '🐴', fee: 1500, cost: 1500, life: 28 }
  ];
  BAL.MAX_PETS = 5;

  /* ---------- Shop ---------- */
  BAL.SHOP_CATS = [
    { id: 'toys', name: 'Toys', emoji: '🧸' }, { id: 'books', name: 'Books', emoji: '📚' },
    { id: 'clothes', name: 'Clothes', emoji: '👕' }, { id: 'gadgets', name: 'Gadgets', emoji: '📱' },
    { id: 'home', name: 'Home', emoji: '🛋️' }, { id: 'treats', name: 'Treats', emoji: '🍦' }
  ];
  BAL.ITEMS = [
    { id: 'teddy', cat: 'toys', name: 'Teddy Bear', emoji: '🧸', price: 15, fx: { happy: 6 } },
    { id: 'blocks', cat: 'toys', name: 'Building Blocks', emoji: '🧱', price: 25, fx: { smarts: 3, happy: 3 } },
    { id: 'kite', cat: 'toys', name: 'Kite', emoji: '🪁', price: 20, fx: { fitness: 3, happy: 3 } },
    { id: 'puzzle', cat: 'toys', name: 'Jigsaw Puzzle', emoji: '🧩', price: 20, fx: { smarts: 4 } },
    { id: 'ball', cat: 'toys', name: 'Football', emoji: '⚽', price: 25, fx: { fitness: 5 } },
    { id: 'robot', cat: 'toys', name: 'Toy Robot', emoji: '🤖', price: 60, fx: { smarts: 3, happy: 5 } },
    { id: 'skate', cat: 'toys', name: 'Skateboard', emoji: '🛹', price: 80, fx: { fitness: 5, happy: 5 } },
    { id: 'bike', cat: 'toys', name: 'Bicycle', emoji: '🚲', price: 150, fx: { fitness: 8, happy: 5 } },
    { id: 'picbook', cat: 'books', name: 'Picture Book', emoji: '📗', price: 10, fx: { smarts: 3 } },
    { id: 'comic', cat: 'books', name: 'Comic Book', emoji: '📒', price: 8, fx: { happy: 3, smarts: 1 } },
    { id: 'story', cat: 'books', name: 'Adventure Story', emoji: '📕', price: 15, fx: { smarts: 3, happy: 2 } },
    { id: 'atlas', cat: 'books', name: 'World Atlas', emoji: '🗺️', price: 40, fx: { smarts: 6 } },
    { id: 'encyclo', cat: 'books', name: 'Encyclopedia', emoji: '📚', price: 60, fx: { smarts: 8 } },
    { id: 'sciencekit', cat: 'books', name: 'Science Kit', emoji: '🔬', price: 90, fx: { smarts: 10 } },
    { id: 'trainers', cat: 'clothes', name: 'Cool Trainers', emoji: '👟', price: 70, fx: { happy: 4, fitness: 2 } },
    { id: 'outfit', cat: 'clothes', name: 'Party Outfit', emoji: '👗', price: 80, fx: { happy: 6 } },
    { id: 'raincoat', cat: 'clothes', name: 'Raincoat', emoji: '🧥', price: 50, fx: { health: 3 } },
    { id: 'capitem', cat: 'clothes', name: 'Baseball Cap', emoji: '🧢', price: 20, fx: { happy: 2 }, unlock: 'cap' },
    { id: 'shades', cat: 'clothes', name: 'Sunglasses', emoji: '🕶️', price: 30, fx: { happy: 3 } },
    { id: 'crownitem', cat: 'clothes', name: 'Sparkly Crown', emoji: '👑', price: 500, fx: { happy: 8 }, unlock: 'crown' },
    { id: 'headphones', cat: 'gadgets', name: 'Headphones', emoji: '🎧', price: 120, fx: { happy: 5 } },
    { id: 'camera', cat: 'gadgets', name: 'Camera', emoji: '📷', price: 350, fx: { happy: 5, smarts: 2 } },
    { id: 'tablet', cat: 'gadgets', name: 'Tablet', emoji: '📱', price: 400, fx: { smarts: 5, happy: 5 } },
    { id: 'console', cat: 'gadgets', name: 'Games Console', emoji: '🎮', price: 450, fx: { happy: 10, fitness: -2 } },
    { id: 'laptop', cat: 'gadgets', name: 'Laptop', emoji: '💻', price: 900, fx: { smarts: 8, happy: 3 } },
    { id: 'telescope', cat: 'gadgets', name: 'Telescope', emoji: '🔭', price: 600, fx: { smarts: 7, happy: 4 } },
    { id: 'plant', cat: 'home', name: 'Pot Plant', emoji: '🪴', price: 30, fx: { happy: 2, health: 1 } },
    { id: 'painting', cat: 'home', name: 'Painting', emoji: '🖼️', price: 300, fx: { happy: 5 } },
    { id: 'sofa', cat: 'home', name: 'Comfy Sofa', emoji: '🛋️', price: 800, fx: { happy: 6 } },
    { id: 'bed', cat: 'home', name: 'Cloud Bed', emoji: '🛏️', price: 700, fx: { health: 5, happy: 3 } },
    { id: 'piano', cat: 'home', name: 'Piano', emoji: '🎹', price: 2500, fx: { smarts: 5, happy: 8 } },
    { id: 'hottub', cat: 'home', name: 'Hot Tub', emoji: '🛁', price: 4000, fx: { happy: 10, health: 2 } },
    { id: 'icecream', cat: 'treats', name: 'Ice Cream', emoji: '🍦', price: 5, fx: { happy: 4, health: -1 }, consumable: true },
    { id: 'fruit', cat: 'treats', name: 'Fruit Basket', emoji: '🍓', price: 15, fx: { health: 4 }, consumable: true },
    { id: 'cake', cat: 'treats', name: 'Cupcake', emoji: '🧁', price: 8, fx: { happy: 4 }, consumable: true },
    { id: 'smoothie', cat: 'treats', name: 'Smoothie', emoji: '🥤', price: 10, fx: { health: 3, happy: 1 }, consumable: true },
    { id: 'pizza', cat: 'treats', name: 'Pizza Night', emoji: '🍕', price: 25, fx: { happy: 6 }, consumable: true }
  ];

  /* ---------- Health ---------- */
  BAL.ILLNESSES = [
    { id: 'cold', name: 'a cold', emoji: '🤧', cure: 'gp', minAge: 0, maxAge: 120 },
    { id: 'tummy', name: 'a tummy bug', emoji: '🤢', cure: 'gp', minAge: 1, maxAge: 120 },
    { id: 'flu', name: 'the flu', emoji: '🤒', cure: 'gp', minAge: 3, maxAge: 120 },
    { id: 'chickenpox', name: 'chickenpox', emoji: '🔴', cure: 'gp', minAge: 2, maxAge: 12 },
    { id: 'tooth', name: 'a toothache', emoji: '🦷', cure: 'dentist', minAge: 4, maxAge: 120 },
    { id: 'arm', name: 'a broken arm', emoji: '🦴', cure: 'hospital', minAge: 4, maxAge: 120 },
    { id: 'knees', name: 'achy knees', emoji: '🦵', cure: 'gp', minAge: 55, maxAge: 120 },
    { id: 'back', name: 'a sore back', emoji: '🙇', cure: 'gp', minAge: 40, maxAge: 120 }
  ];
  BAL.CLINIC = [
    { id: 'gp', name: 'Doctor Check-up', emoji: '🩺', cost: 150, fx: { health: 10 }, desc: 'A friendly doctor checks you over.' },
    { id: 'dentist', name: 'Dentist', emoji: '🦷', cost: 100, fx: { health: 5 }, desc: 'Sparkly clean teeth!' },
    { id: 'jab', name: 'Flu Jab', emoji: '💉', cost: 40, fx: { health: 2 }, desc: 'A tiny scratch that keeps colds and flu away for a year.' },
    { id: 'optician', name: 'Eye Test', emoji: '👓', cost: 60, fx: { health: 2 }, desc: 'Read the letters on the chart. Maybe get glasses!' },
    { id: 'hospital', name: 'Hospital', emoji: '🏥', cost: 500, fx: { health: 25 }, desc: 'For big ouchies like broken bones.' },
    { id: 'spa', name: 'Relaxing Spa Day', emoji: '🧖', cost: 250, fx: { health: 6, happy: 8 }, desc: 'Fluffy robes and calm music.', adultOnly: true }
  ];

  /* ---------- Activities ---------- */
  // min/max ages, energy cost (⚡), coin cost, coins earned, effects.
  BAL.ACTIVITIES = [
    // babies
    { id: 'giggle', name: 'Giggle & Play', emoji: '🧸', min: 0, max: 2, fx: { happy: 8 }, msg: 'Peekaboo! You giggled so much!' },
    { id: 'nap', name: 'Nap Time', emoji: '😴', min: 0, max: 2, fx: { health: 6, happy: 2 }, msg: 'A lovely snoozy nap. Zzz…' },
    { id: 'cuddle', name: 'Big Cuddle', emoji: '🤗', min: 0, max: 4, fx: { happy: 7 }, family: 6, msg: 'A warm family cuddle!' },
    { id: 'words', name: 'Say New Words', emoji: '🗣️', min: 1, max: 3, fx: { smarts: 6 }, msg: 'You said "banana"! Everyone cheered.', ach: 'first_words' },
    { id: 'crawl', name: 'Crawl & Explore', emoji: '🐛', min: 0, max: 2, fx: { fitness: 5, smarts: 2 }, msg: 'You crawled all the way to the kitchen!' },
    // children
    { id: 'playout', name: 'Play Outside', emoji: '🌳', min: 3, max: 15, fx: { happy: 5, fitness: 5 }, msg: 'You ran, jumped and climbed. What fun!' },
    { id: 'read', name: 'Read a Book', emoji: '📖', min: 3, max: 120, fx: { smarts: 5, happy: 2 }, msg: 'You got lost in a great story.' },
    { id: 'draw', name: 'Draw a Picture', emoji: '🖍️', min: 2, max: 14, fx: { happy: 5, smarts: 2 }, msg: 'Your picture went straight on the fridge!' },
    { id: 'chores', name: 'Help with Chores', emoji: '🧹', min: 4, max: 17, fx: { happy: 1 }, earn: [10, 25], family: 3, msg: 'Pocket money earned! Thanks for helping.' },
    { id: 'lemonade', name: 'Lemonade Stand', emoji: '🍋', min: 6, max: 14, fx: { happy: 4 }, earn: [15, 45], msg: 'Fresh lemonade for sale! Neighbours loved it.' },
    { id: 'bike', name: 'Ride a Bike', emoji: '🚲', min: 4, max: 70, fx: { fitness: 6, happy: 3 }, msg: 'Whoosh! The wind in your hair.' },
    { id: 'videogames', name: 'Play Video Games', emoji: '🎮', min: 5, max: 90, fx: { happy: 6, fitness: -1 }, msg: 'You beat the boss level!' },
    { id: 'swim', name: 'Go Swimming', emoji: '🏊', min: 4, max: 90, fx: { fitness: 6, health: 2 }, cost: 5, msg: 'Splash! You swam a whole length.' },
    { id: 'instrument', name: 'Practise Music', emoji: '🎹', min: 5, max: 90, fx: { smarts: 4, happy: 3 }, msg: 'Your tune sounds better every day.' },
    { id: 'teeth', name: 'Brush Teeth Well', emoji: '🪥', min: 2, max: 12, fx: { health: 5 }, msg: 'Sparkling clean! Two minutes, top and bottom.' },
    { id: 'baking', name: 'Bake Cookies', emoji: '🍪', min: 6, max: 90, fx: { happy: 6, smarts: 1 }, cost: 5, msg: 'Mmm, warm cookies! You shared them too.' },
    // teens
    { id: 'friends', name: 'Hang Out with Friends', emoji: '🛹', min: 12, max: 30, fx: { happy: 7 }, friends: 6, msg: 'Laughing with friends is the best.' },
    { id: 'sport', name: 'Train for Sport', emoji: '🏅', min: 10, max: 45, fx: { fitness: 8, health: 2 }, msg: 'Practice makes progress!' },
    { id: 'code', name: 'Learn to Code', emoji: '💻', min: 9, max: 70, fx: { smarts: 6 }, msg: 'You made a tiny game that says "Hello!"' },
    // adults
    { id: 'gym', name: 'Go to the Gym', emoji: '🏋️', min: 16, max: 80, fx: { fitness: 8, health: 3 }, cost: 20, msg: 'Feel the burn! You are getting stronger.' },
    { id: 'cook', name: 'Cook a Healthy Meal', emoji: '🥗', min: 16, max: 120, fx: { health: 6, happy: 2 }, cost: 15, msg: 'Delicious and good for you!' },
    { id: 'cinema', name: 'Trip to the Cinema', emoji: '🎬', min: 8, max: 120, fx: { happy: 7 }, cost: 15, msg: 'Popcorn and a brilliant film!' },
    { id: 'holiday', name: 'Go on Holiday', emoji: '✈️', min: 18, max: 110, fx: { happy: 15, health: 4 }, cost: 1200, msg: 'Sunshine, adventures and a well-earned rest!', counter: 'holidays' },
    { id: 'volunteer', name: 'Volunteer', emoji: '🤝', min: 12, max: 120, fx: { happy: 6, smarts: 2 }, kind: true, msg: 'You helped at the community garden. So kind!' },
    { id: 'party', name: 'Throw a Party', emoji: '🎉', min: 18, max: 110, fx: { happy: 10 }, cost: 150, friends: 6, msg: 'Music, snacks and dancing! Best party ever.' },
    { id: 'yoga', name: 'Yoga & Relax', emoji: '🧘', min: 14, max: 120, fx: { health: 4, happy: 4, fitness: 2 }, msg: 'Deep breaths… you feel calm and happy.' },
    { id: 'museum', name: 'Visit a Museum', emoji: '🦖', min: 5, max: 120, fx: { smarts: 6, happy: 2 }, cost: 10, msg: 'Dinosaurs, rockets and ancient treasure!' },
    // golden years
    { id: 'garden', name: 'Gardening', emoji: '🌷', min: 30, max: 120, fx: { happy: 5, health: 3 }, msg: 'Your flowers are blooming beautifully.' },
    { id: 'knit', name: 'Knitting', emoji: '🧶', min: 55, max: 120, fx: { happy: 5, smarts: 2 }, msg: 'You knitted a cosy scarf!' },
    { id: 'walk', name: 'Walk in the Park', emoji: '🚶', min: 50, max: 120, fx: { health: 5, fitness: 3 }, msg: 'Fresh air and feeding the ducks.' },
    { id: 'stories', name: 'Tell Stories', emoji: '📜', min: 60, max: 120, fx: { happy: 6 }, family: 5, msg: 'Everyone loved your tales from long ago.' },
    { id: 'bowls', name: 'Lawn Bowls', emoji: '🎳', min: 60, max: 120, fx: { fitness: 4, happy: 4 }, msg: 'Right on the jack! Great shot.' }
  ];

  /* ---------- Daily jobs (responsibilities) ---------- */
  BAL.CHORES = {
    baby: [{ t: 'Finish your milk', e: '🍼' }, { t: 'Bath time', e: '🛁' }, { t: 'Tidy your toys (with help!)', e: '🧸' }],
    child: [{ t: 'Brush your teeth', e: '🪥' }, { t: 'Tidy your bedroom', e: '🛏️' }, { t: 'Do your homework', e: '✏️' }, { t: 'Pack your school bag', e: '🎒' }, { t: 'Help set the table', e: '🍽️' }, { t: 'Put dirty clothes in the wash', e: '🧺' }],
    teen: [{ t: 'Finish your homework', e: '📝' }, { t: 'Wash the dishes', e: '🍽️' }, { t: 'Tidy your room', e: '🛏️' }, { t: 'Take out the recycling', e: '♻️' }, { t: 'Get a good night\'s sleep', e: '😴' }],
    adult: [{ t: 'Pay the bills on time', e: '🧾' }, { t: 'Do the food shopping', e: '🛒' }, { t: 'Clean the house', e: '🧽' }, { t: 'Do the laundry', e: '🧺' }, { t: 'Water the plants', e: '🪴' }, { t: 'Cook dinner', e: '🍳' }, { t: 'Recycle your rubbish', e: '♻️' }],
    elder: [{ t: 'Take your vitamins', e: '💊' }, { t: 'Water the garden', e: '🌷' }, { t: 'Phone the family', e: '📞' }, { t: 'Go for a gentle walk', e: '🚶' }, { t: 'Tidy the house', e: '🧹' }],
    pet: [{ t: 'Feed your pets', e: '🥣' }, { t: 'Clean the pet bed', e: '🧼' }],
    kids: [{ t: 'Take the kids to school', e: '🏫' }, { t: 'Read a bedtime story', e: '📖' }]
  };

  /* ---------- Achievements (sticker book) ---------- */
  BAL.ACHIEVEMENTS = [
    { id: 'first_words', name: 'First Words', emoji: '🗣️', desc: 'Say your very first words.' },
    { id: 'first_friend', name: 'Best Buddies', emoji: '🤝', desc: 'Make your first friend.' },
    { id: 'top_class', name: 'Top of the Class', emoji: '⭐', desc: 'Get a 5-star school report.' },
    { id: 'graduate', name: 'Graduation Day', emoji: '🎓', desc: 'Finish secondary school.' },
    { id: 'degree', name: 'Super Scholar', emoji: '📜', desc: 'Finish college or university.' },
    { id: 'first_job', name: 'First Pay Day', emoji: '💼', desc: 'Get your first full-time job.' },
    { id: 'promoted', name: 'Moving Up', emoji: '⬆️', desc: 'Get a promotion at work.' },
    { id: 'boss', name: 'The Big Boss', emoji: '👔', desc: 'Reach the top level of a job.' },
    { id: 'astronaut', name: 'To the Stars', emoji: '🚀', desc: 'Become an astronaut.' },
    { id: 'licence', name: 'Ready to Drive', emoji: '🚦', desc: 'Pass your driving test.' },
    { id: 'car', name: 'Beep Beep!', emoji: '🚗', desc: 'Buy your first car.' },
    { id: 'homeowner', name: 'Home Sweet Home', emoji: '🏠', desc: 'Buy your own home.' },
    { id: 'castle', name: 'King of the Castle', emoji: '🏰', desc: 'Live in a real castle.' },
    { id: 'married', name: 'Happily Married', emoji: '💍', desc: 'Have a wedding.' },
    { id: 'parent', name: 'Proud Parent', emoji: '👶', desc: 'Welcome a child to your family.' },
    { id: 'big_family', name: 'Big Family', emoji: '👨‍👩‍👧‍👦', desc: 'Have 3 or more children.' },
    { id: 'grandparent', name: 'Grand-tastic', emoji: '👵', desc: 'Become a grandparent.' },
    { id: 'pet_owner', name: 'Animal Friend', emoji: '🐾', desc: 'Adopt a pet.' },
    { id: 'pet_lover', name: 'Pet Paradise', emoji: '🐶', desc: 'Have 3 pets at the same time.' },
    { id: 'shopper', name: 'Shopping Star', emoji: '🛍️', desc: 'Buy 10 things from the shops.' },
    { id: 'rich', name: 'Coin Collector', emoji: '💰', desc: 'Save 100,000 coins.' },
    { id: 'millionaire', name: 'Millionaire', emoji: '🤑', desc: 'Save 1,000,000 coins.' },
    { id: 'traveller', name: 'Globetrotter', emoji: '🌍', desc: 'Go on 3 holidays.' },
    { id: 'mover', name: 'New Town, New Me', emoji: '🗺️', desc: 'Move to a new town.' },
    { id: 'fit', name: 'Fit as a Fiddle', emoji: '🏆', desc: 'Reach 95 fitness.' },
    { id: 'brainy', name: 'Big Brain', emoji: '🧠', desc: 'Reach 95 smarts.' },
    { id: 'helper', name: 'Super Helper', emoji: '🧽', desc: 'Finish all your daily jobs 10 times.' },
    { id: 'kind', name: 'Kind Heart', emoji: '💖', desc: 'Make 5 kind choices.' },
    { id: 'retired', name: 'Happy Retirement', emoji: '🏖️', desc: 'Retire from work.' },
    { id: 'century', name: '100 Candles', emoji: '🎂', desc: 'Reach 100 years old.' }
  ];

  /* ---------- Random life events ---------- */
  // Each event: id, min/max age, optional condition key, emoji, title, text, choices [{t, fx, coins, msg, kind, special}]
  BAL.EVENTS = [
    { id: 'puddle', min: 1, max: 6, emoji: '💦', title: 'A Giant Puddle!', text: 'There is a HUGE muddy puddle right in front of you.',
      choices: [{ t: 'Jump in! 🥾', fx: { happy: 8, health: -1 }, msg: 'SPLOSH! Mud everywhere. Worth it!' }, { t: 'Walk around it 🚶', fx: { smarts: 2 }, msg: 'Nice and dry. Very sensible!' }] },
    { id: 'tooth', min: 5, max: 9, emoji: '🦷', title: 'Wobbly Tooth!', text: 'Your tooth just fell out!',
      choices: [{ t: 'Put it under my pillow 🧚', coins: 5, fx: { happy: 5 }, msg: 'The Tooth Fairy left you 5 coins!' }, { t: 'Keep it in a box 📦', fx: { happy: 2 }, msg: 'A tiny treasure for your collection.' }] },
    { id: 'newkid', min: 4, max: 13, emoji: '🧒', title: 'The New Kid', text: 'A new child at school is sitting all alone at lunch.',
      choices: [{ t: 'Say hello 👋', fx: { happy: 5 }, kind: true, special: 'friend', msg: 'You made a new friend!' }, { t: 'Stay with my friends', fx: {}, msg: 'Maybe next time.' }] },
    { id: 'coins', min: 5, max: 15, emoji: '🪙', title: 'Found Some Coins', text: 'You found 10 coins on the playground.',
      choices: [{ t: 'Hand them to a teacher 🙋', fx: { happy: 6 }, kind: true, msg: 'Your teacher gave you a gold star for honesty! ⭐' }, { t: 'Keep them', coins: 10, fx: {}, msg: '10 coins for your piggy bank.' }] },
    { id: 'spelling', min: 6, max: 12, emoji: '✏️', title: 'Spelling Test Tomorrow', text: 'You have a spelling test tomorrow. What will you do tonight?',
      choices: [{ t: 'Practise my spellings 📝', fx: { smarts: 6 }, grade: 6, msg: 'You got 10 out of 10!' }, { t: 'Play instead 🎲', fx: { happy: 4 }, grade: -4, msg: 'Fun, but the test was tricky…' }] },
    { id: 'talent', min: 7, max: 17, emoji: '🎤', title: 'School Talent Show', text: 'The school talent show needs acts! Will you join?',
      choices: [{ t: 'Sing a song 🎶', fx: { happy: 8 }, msg: 'The crowd clapped along!' }, { t: 'Do a magic trick 🎩', fx: { happy: 6, smarts: 2 }, msg: 'Ta-da! The rabbit appeared!' }, { t: 'Watch from the audience 👀', fx: { happy: 3 }, msg: 'You cheered everyone on.' }] },
    { id: 'snowday', min: 3, max: 70, emoji: '❄️', title: 'Snow Day!', text: 'It snowed overnight and everything is white!',
      choices: [{ t: 'Build a snowman ⛄', fx: { happy: 7 }, msg: 'Your snowman has a carrot nose and a scarf!' }, { t: 'Go sledging 🛷', fx: { happy: 6, fitness: 4 }, msg: 'Wheee! Down the big hill!' }, { t: 'Cosy hot chocolate ☕', fx: { happy: 5, health: 1 }, msg: 'Warm and toasty with marshmallows.' }] },
    { id: 'sciencefair', min: 10, max: 17, emoji: '🔬', title: 'Science Fair', text: 'What will you make for the science fair?',
      choices: [{ t: 'Fizzy volcano 🌋', fx: { smarts: 5, happy: 4 }, grade: 4, msg: 'It erupted perfectly! Second place!' }, { t: 'Little robot 🤖', fx: { smarts: 8 }, grade: 6, msg: 'First prize! Your robot waved at the judges.' }] },
    { id: 'trip', min: 6, max: 17, emoji: '🚌', title: 'School Trip', text: 'Your class is going on a trip! Where would you like to go?',
      choices: [{ t: 'The zoo 🦒', fx: { happy: 6, smarts: 2 }, msg: 'You saw a baby giraffe!' }, { t: 'The science museum 🚀', fx: { smarts: 6 }, msg: 'You sat in a real space capsule.' }, { t: 'The beach 🏖️', fx: { happy: 6, fitness: 2 }, msg: 'Rock pools full of crabs!' }] },
    { id: 'birthdayparty', min: 5, max: 14, emoji: '🎈', title: 'Party Invitation', text: 'Your friend invited you to their birthday party!',
      choices: [{ t: 'Go and bring a present 🎁', fx: { happy: 7 }, coins: -10, special: 'friendship', msg: 'Bouncy castle, cake and party games!' }, { t: 'Stay home', fx: {}, msg: 'A quiet day at home.' }] },
    { id: 'lostdog', min: 6, max: 90, emoji: '🐕', title: 'A Lost Dog', text: 'A little dog with a collar is wandering on its own.',
      choices: [{ t: 'Help find its owner 🔎', fx: { happy: 7 }, coins: 20, kind: true, msg: 'The owner was so grateful they gave you a reward!' }, { t: 'Tell a grown-up 🧑', fx: { happy: 3 }, kind: true, msg: 'Good thinking — the dog got home safely.' }] },
    { id: 'kitten', min: 18, max: 90, emoji: '🐱', title: 'A Kitten at the Door', text: 'A tiny, hungry kitten is meowing at your door.',
      choices: [{ t: 'Adopt the kitten 💕', fx: { happy: 10 }, special: 'kitten', kind: true, msg: 'You have a new furry friend!' }, { t: 'Take it to the animal shelter', fx: { happy: 3 }, kind: true, msg: 'The shelter will find it a loving home.' }] },
    { id: 'neighbour', min: 18, max: 80, emoji: '🛋️', title: 'Neighbour Needs Help', text: 'Your neighbour is struggling to carry a big sofa.',
      choices: [{ t: 'Lend a hand 💪', fx: { happy: 5, fitness: 2 }, kind: true, msg: 'Teamwork! They baked you a cake to say thanks.' }, { t: 'Too busy today', fx: {}, msg: 'Maybe next time.' }] },
    { id: 'raffle', min: 10, max: 100, emoji: '🎟️', title: 'Raffle Winner!', text: 'You won the top prize in the summer fair raffle!',
      choices: [{ t: 'Take the coins 🪙', coins: 150, fx: { happy: 5 }, msg: '150 coins!' }, { t: 'Take the giant teddy 🧸', fx: { happy: 9 }, item: 'teddy', msg: 'It is bigger than you!' }] },
    { id: 'overtime', min: 18, max: 70, need: 'job', emoji: '⏰', title: 'Extra Work', text: 'Your boss asks if you can do some extra hours this month.',
      choices: [{ t: 'Yes, extra coins! 💼', coinsJob: 0.08, fx: { happy: -3, health: -2 }, perf: 15, msg: 'Busy, but your boss was impressed.' }, { t: 'No thanks, I need a rest', fx: { happy: 4 }, msg: 'Balance is important!' }] },
    { id: 'raise', min: 20, max: 70, need: 'job', emoji: '🌟', title: 'Employee of the Month', text: 'You were named Employee of the Month!',
      choices: [{ t: 'Celebrate! 🎉', fx: { happy: 8 }, perf: 20, msg: 'Your photo is on the wall at work!' }] },
    { id: 'charity', min: 12, max: 100, emoji: '🏃', title: 'Charity Fun Run', text: 'There is a 5k fun run to raise money for the children\'s hospital.',
      choices: [{ t: 'Run it! 🏃', fx: { fitness: 6, happy: 6 }, kind: true, msg: 'You crossed the finish line to big cheers!' }, { t: 'Cheer the runners 📣', fx: { happy: 4 }, msg: 'Your sign said "GO GO GO!"' }] },
    { id: 'reunion', min: 30, max: 90, emoji: '🫂', title: 'School Reunion', text: 'Old school friends are having a reunion.',
      choices: [{ t: 'Go along 🥳', fx: { happy: 8 }, special: 'friend', msg: 'So many memories! You reconnected with an old friend.' }, { t: 'Skip it', fx: {}, msg: 'A quiet night in.' }] },
    { id: 'grandchild', min: 45, max: 100, need: 'adultChild', emoji: '🍼', title: 'Big News!', text: 'One of your children has had a baby. You are a grandparent!',
      choices: [{ t: 'Hooray! 🎉', fx: { happy: 15 }, special: 'grandchild', msg: 'Welcome to the family, little one!' }] },
    { id: 'garden', min: 25, max: 100, emoji: '🍅', title: 'Giant Tomato!', text: 'You grew a ginormous tomato in your garden!',
      choices: [{ t: 'Enter it in the village show 🏆', fx: { happy: 7 }, coins: 50, msg: 'First prize and 50 coins!' }, { t: 'Make tomato soup 🍲', fx: { health: 4 }, msg: 'Yum! Enough soup for everyone.' }] },
    { id: 'rainbow', min: 2, max: 120, emoji: '🌈', title: 'Double Rainbow', text: 'A double rainbow appeared in the sky!',
      choices: [{ t: 'Make a wish ✨', fx: { happy: 6 }, msg: 'You wished for a happy year!' }, { t: 'Take a photo 📸', fx: { happy: 4, smarts: 1 }, msg: 'What a beautiful picture.' }] },
    { id: 'bake', min: 8, max: 100, emoji: '🍰', title: 'Bake-Off Contest', text: 'There is a baking contest in town!',
      choices: [{ t: 'Bake a rainbow cake 🌈', fx: { happy: 6, smarts: 2 }, coins: 30, msg: 'The judges loved it! You won 30 coins.' }, { t: 'Be a taste tester 😋', fx: { happy: 6, health: -1 }, msg: 'So. Much. Cake.' }] },
    { id: 'retirequestion', min: 66, max: 90, need: 'job', emoji: '🏖️', title: 'Time to Relax?', text: 'You have worked for many years. Would you like to retire?',
      choices: [{ t: 'Yes, retire! 🌴', fx: { happy: 10 }, special: 'retire', msg: 'Hooray! Time for hobbies and holidays.' }, { t: 'Not yet, I love my job', fx: { happy: 2 }, msg: 'Keep up the great work!' }] }
  ];
})(globalThis.BAL = globalThis.BAL || {});
