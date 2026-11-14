# 🏡 Build a Life

A fun, colourful, friendly life simulation game for children aged 5–15.
Start as a baby and live a whole life — growing up, going to school, finding a job,
making friends, adopting pets, falling in love, raising a family and enjoying old age.

> **No real money.** All coins are pretend. There are no purchases, no adverts, no chat
> and no accounts. Games are saved only in the browser on this device.

## How to play

Open `index.html` in any modern browser (double-click works — no install or server needed),
or serve the folder: `python3 -m http.server` and visit `http://localhost:8000/build-a-life/`.

1. **Make a player** — each person who plays gets their own profile and save.
2. **Create a character** — name, look (skin, hair, eyes, favourite colour, extras), family and home town.
3. **Use your ⚡ energy** each year on activities, studying, work, friends and pets.
4. **Tick off your daily jobs** ✅ for a bonus.
5. **Press 🎂 Age Up** to have a birthday — coins come in, bills go out, and life events happen.
6. When the story ends in old age, **play as your child** or **start a brand new life**.

## What's in the game

| Area | Features |
|---|---|
| 👥 Players | Multiple player profiles, each with a Hall of Fame of past lives |
| ✨ Character creation | Skin tones, 9 hair styles, hair/eye/outfit colours, accessories, 6 family types, 7 home towns. Avatars grow from baby to old age and smile more when happy |
| 🗺️ Places | 7 towns, cities and villages — each with different pay, prices and a yearly bonus. Grown-ups can move |
| 🎂 Growing up | Year-by-year ageing, birthday cake & presents, milestones, 4 stats (Happiness, Health, Smarts, Fitness) |
| 🏫 School | Nursery, primary and secondary school, school reports, 8 after-school clubs, part-time jobs for teens, then college, university or a gap year |
| 💼 Careers | 21 jobs from shop assistant to astronaut with education and stat requirements, promotions, job titles and retirement with a pension |
| 🪙 Money | Pocket money, chores, gifts, salaries, rent, bills, home loans paid yearly, a year-end coin summary |
| 🏠 Homes & cars | Rent or buy 10 homes (including a castle), sell or pay off your home, pass a driving test and buy 7 vehicles |
| ❤️ Relationships | Family, siblings, friends, dating (18+ only), proposals, small or big weddings, babies, adoption, grandchildren |
| 🐾 Pets | 10 animals from goldfish to pony; children ask their family, grown-ups pay a fee; play, treats and yearly care costs |
| 🛍️ Shopping | 37 items in 6 departments, a "My Stuff" shelf and a wardrobe of accessories |
| 🏥 Healthcare | Doctor, dentist, flu jab, eye test (glasses!), hospital and spa; illnesses that need the right treatment; free for children |
| ✅ Responsibilities | Age-appropriate daily jobs every year (brushing teeth, paying bills, feeding pets…) |
| 🎉 Celebrations | Birthdays, school starts, graduations, weddings, new babies, promotions, retirement — with confetti and sounds |
| 📖 My Story | 30 collectible stickers, a life timeline and an end-of-life story with highlights and life stars |

Sad moments are handled gently: pets "cross the Rainbow Bridge", and older relatives "lived a long and
happy life". The player's own story only ends in old age.

### Child-friendly design

* Big, chunky buttons, large emoji and short sentences.
* 🔊 **Read aloud** button on every pop-up (uses the browser's speech voice) for younger readers.
* Sound effects (can be muted), animations, confetti — and all motion is reduced if the device asks for reduced motion.
* Works on phones, tablets and computers; keyboard friendly.

## Code

Plain HTML, CSS and JavaScript — no build step, no dependencies (the Google Fonts are optional; the game falls back to system fonts offline).

| File | Purpose |
|---|---|
| `js/data.js` | All game content: towns, jobs, homes, cars, pets, shop items, activities, events, stickers |
| `js/game.js` | Game engine (pure logic, no DOM). Every action goes through `BAL.Game.run(life, action, …)` |
| `js/avatar.js` | SVG avatar drawing for every life stage |
| `js/storage.js` | Player profiles in `localStorage` and the tiny sound synthesiser |
| `js/ui.js` | Screens, panels, pop-ups, toasts and confetti |

Engine tests live in `tests/unit/build-a-life.test.js` and run with the repository's `npm test`.
