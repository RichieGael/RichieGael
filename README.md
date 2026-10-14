# Sk8 Strike

A Skate 3 × Counter-Strike 2 mashup that runs in the browser. Skate a desert bomb-defusal map, buy guns with trick money, and win rounds against Terrorist bots, ideally with a 360 no-scope kickflip.

This is an original fan-made game, built with Three.js. It is not a mod of either game and is not affiliated with EA or Valve.

## Play

It is a static site with no build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

GitHub Pages works too: enable Pages on this branch and open the site URL. Three.js and the fonts load from public CDNs.

## Modes

- **Competitive**: You are the only Counter-Terrorist against 4–5 Terrorist bots. They pick a site (sometimes splitting through mid), carry the bomb, and plant it. Kill them all or defuse within 40 seconds. First to 8 rounds wins. Money works like CS: $800 pistol round, $3,250 for a win, a growing loss bonus, and kill rewards per weapon.
- **Free skate**: $10,000 and target dummies that respawn. You can buy anything at any time.

## Skating

| Input | Action |
| --- | --- |
| Mouse | Look and steer (the board carves toward where you look) |
| `W` | Push. On a ramp's downslope, pump for speed |
| `S` | Powerslide |
| `A` `D` | Carve. In the air, spin (180, 360, 540…) |
| `Space` | Hold to crouch, release to ollie. Longer hold = higher pop |
| `J` `K` `L` `I` | Kickflip, heelflip, 360 shuv, tre flip. Press again mid-flip for doubles. On the ground they pop an ollie first |
| `Shift` | Grab (Indy). Add `W` for a nosegrab, `S` for a tailgrab |

Land near a rail, ledge edge, or coping and you lock into a grind: 50-50, crooked, or boardslide/lipslide depending on how your board lines up. Quarter pipes launch you straight up. Spin 180 to come back in forward, or don't and land to fakie. Land sideways or mid-flip and you bail. Hard bails show up in the Hall of Meat and cost health.

Tricks chain into a line. Each trick adds to the multiplier. A line banks after about 1.6 seconds on the ground and pays cash. Bailing loses the line.

## Shooting

| Input | Action |
| --- | --- |
| Left click | Fire |
| Right click | Scope (AWP, SSG 08) or heavy knife |
| `1` `2` `3` `4` | Primary, pistol, knife, HE grenade |
| `Q` | Last weapon |
| `R` | Reload |
| `B` | Buy menu (first 20 s of a round) |
| `E` | Hold to defuse (5 s, or 3 s with a kit) |
| `V` | First / third person |
| `M` | Mute |
| `Esc` / `P` | Pause |

Shots are accurate on the ground, less so at speed, and wild in the air, except near the top of a jump. Kills made mid-trick are **style kills**: airborne, mid-flip, mid-grind, 360 spins, and unscoped sniper kills all stack bonus points and cash, and they get called out on screen.

Phones and tablets get a touch layout: a stick on the left, trick and weapon buttons on the right, and you drag anywhere else to look.

## Cases

Win a round or bank enough trick points to earn a Sk8 Case. Open it from the pause menu. The reel uses CS-style rarity odds (Mil-Spec through Rare Special), and each drop gets a wear value. Equip deck, gun, and knife skins from the inventory. Skins and settings are saved in your browser.

## Code map

| File | What it does |
| --- | --- |
| `src/world.js` | Map layout, analytic collision (ground height, walls, rays), grind rails, bot waypoints |
| `src/skater.js` | Board physics, ollies, flips, spins, grinds, vert, bails, skater animation |
| `src/bots.js` | Terrorist AI: routes, vision, bursts, bomb carry/plant, target dummies |
| `src/weapons.js` | Weapon stats, buy list, loadout and ammo |
| `src/main.js` | Rounds, economy, shooting, combos, bomb, camera, input |
| `src/hud.js`, `src/menus.js`, `src/touch.js` | HUD and radar, menus/buy/cases/inventory, touch controls |
| `src/textures.js`, `src/models.js`, `src/fx.js`, `src/audio.js` | Procedural textures, low-poly models, particles, synthesized sound |

## Also in this repo

- [`doom-eternal-sharper/`](doom-eternal-sharper/README.md): a sharpness and anti-aliasing tweak pack for DOOM Eternal. Engine settings, launch options and driver features first, with an optional ReShade preset.
