# NULLPOINTER — Game Over 2026

**A five-minute final boss fight inside a Decentraland World.**
Entry for **GAME OVER 2026: The Final Boss Fight** (DCL Regenesis Labs × Decentraland Foundation).

> NULLPOINTER, Devourer of Scenes, has manifested in the arena. Delete it before it deletes you.

## The fight

- **The boss** — NULLPOINTER: a floating glitch-core with gyroscope rings, crystal shards and a temper. It fights in **3 phases**:
  - **Phase 1 (100–66%)** — Nova Rings + Shard Volleys.
  - **Phase 2 (66–33%)** — it starts orbiting the arena; attacks speed up.
  - **Phase 3 (33–0%)** — ENRAGE: the core burns red and two **Sweep Beams** rotate around the arena.
- **Nova Ring** — an expanding red ring rolls across the floor. Be inside or outside its path when it passes you — just not *on* it.
- **Shard Volley** — bolts fired at where you stand. Keep moving.
- **OVERCHARGE** — three cyan crystals float around the arena. Break one to deal **x3 damage for 8 seconds**… but the boss attacks faster while you're charged. Risk = reward.
- **Win** — delete NULLPOINTER and get a clear time + rank (S/A/B/C). **Lose** — your integrity hits zero. Either way, hit PLAY AGAIN and run it back.
- A full clear takes **2–4 minutes**, comfortably inside the jam's 5-minute limit (onboarding included — the instructions are on the sign and the start screen).

## Controls

| Action | Input |
|---|---|
| Move | WASD / joystick |
| Shoot | Left click (hold to keep firing) |
| Start / restart | Click the glowing pedestal, or the on-screen button |
| Jump / dodge | Space — reposition to dodge rings and shards |

Desktop is the primary target (that's what the judges use); the scene also runs on mobile.

## Tech

- **Decentraland SDK7** (TypeScript), `@dcl/sdk` 7.33.0
- Boss, arena, projectiles and particles are **100% code-generated primitives** — no external 3D models, so the scene is light and loads fast.
- All sound effects are **synthesized in-repo** (see below) — no third-party audio.
- Single-player (multiplayer is optional per the jam rules).

### Project layout

```
src/
  index.ts   bootstrap, phase timing, click wiring (pedestal + boss fallback)
  game.ts    shared state, tuning constants, audio helper, scheduler
  arena.ts   platform, force-field walls, sign, pedestal, OVERCHARGE crystals
  boss.ts    NULLPOINTER: build, phases, Nova Ring / Volley / Sweep Beams, death burst
  player.ts  hitscan blaster + tracer, crystal breaking, regen
  ui.tsx     HUD (boss bar, integrity, timer, OVERCHARGE) + state screens
assets/sounds/  synthesized WAV effects (shoot, hit, hurt, nova, boom, crystal, victory, defeat, ambient)
```

## Run it locally

```bash
npm install
npm start          # SDK preview (or open the folder in Decentraland Creator Hub)
```

## Build

```bash
npm run build      # bundles to bin/index.js and type-checks
```

Verified on 2026-11-26: `tsc --noEmit` clean, `sdk-commands build` succeeds.

## Deploy to a World (manual step — needs the owner's wallet)

1. Put the assigned World name into `scene.json` → `worldConfiguration.name`
   (your own `yourname.dcl.eth`, or the RGL-assigned World for this jam).
2. Deploy with the wallet that holds deploy permission for that World:
   ```bash
   npm run deploy:world
   ```
   The CLI will ask you to sign with that wallet. **Only the World owner / permitted wallet can do this.**
3. ⚠️ **Jam lock rule:** after **November 30, 2026, 23:59 UTC** you must NOT deploy any change to the submission World until winners are announced (Dec 11) — doing so is an automatic disqualification. Keep the World public and playable through judging.

## itch.io submission checklist

Submit at https://itch.io/jam/game-over-2026 before **Nov 30, 2026, 23:59 UTC** with:

- [ ] Game title + short description (use the pitch at the top of this README)
- [ ] Decentraland World name (own or RGL-assigned)
- [ ] Gameplay instructions and controls (table above)
- [ ] Names of all creators / team members
- [ ] Wallet addresses of all participating team members (non-public field)
- [ ] Public GitHub repository link (this repo)
- [ ] Credits for third-party materials (none — see below)
- [ ] Optional but recommended: cover image, screenshots, short gameplay trailer

## Credits & licenses

- **Code:** MIT License (see `LICENSE`).
- **3D content:** all geometry is generated at runtime from SDK primitives — no third-party models.
- **Audio:** every WAV in `assets/sounds/` was synthesized programmatically for this project (oscillator/noise envelopes) — original, no samples, no third-party audio.
- Built with AI assistance, which the jam rules explicitly allow.

## Tuning

All gameplay numbers (boss HP, damage, cooldowns, phase thresholds, OVERCHARGE) live in `src/game.ts` — one file to balance the fight.
