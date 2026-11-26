import { engine, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { state, resetGame, initAudio, playSound, schedulerSystem, clearSchedule } from './game'
import { createArena, resetCrystals, crystalSystem, startPedestal } from './arena'
import { createBoss, resetBoss, bossSystem, damageBoss, getBossCoreEntity } from './boss'
import { initWeapon, weaponSystem, playerSystem, currentDamage, noteBossHit, lastBossHitAgo } from './player'
import { setupUi } from './ui'

// ---------------------------------------------------------------------------
// NULLPOINTER — Game Over 2026 entry. Bootstrap + phase timing + click wiring.
// ---------------------------------------------------------------------------

function startFight() {
  if (state.phase === 'fighting' || state.phase === 'intro') return
  clearSchedule()
  resetGame()
  resetBoss()
  resetCrystals()
  state.phase = 'intro'
  state.introTimer = 2.2
  playSound('boom') // the boss "roar"
}

function mainSystem(dt: number) {
  schedulerSystem(dt)
  if (state.phase === 'intro') {
    state.introTimer -= dt
    if (state.introTimer <= 0) {
      state.phase = 'fighting'
    }
  } else if (state.phase === 'fighting') {
    state.fightTime += dt
  }
}

export function main() {
  createArena()
  createBoss()
  initWeapon()
  initAudio()
  setupUi(startFight)

  // START pedestal click
  pointerEventsSystem.onPointerDown(
    {
      entity: startPedestal,
      opts: { button: InputAction.IA_POINTER, hoverText: 'START THE FIGHT', maxDistance: 9 }
    },
    () => startFight()
  )

  // Direct-click fallback on the boss core. Debounced against the hitscan in
  // player.ts so one click never counts twice; it only fires when the
  // hitscan did not already register a hit in the last 0.35s.
  pointerEventsSystem.onPointerDown(
    {
      entity: getBossCoreEntity(),
      opts: { button: InputAction.IA_POINTER, hoverText: 'ATTACK!', maxDistance: 45 }
    },
    () => {
      if (state.phase === 'fighting' && lastBossHitAgo() > 0.35) {
        damageBoss(currentDamage())
        noteBossHit()
      }
    }
  )

  engine.addSystem(mainSystem)
  engine.addSystem(bossSystem)
  engine.addSystem(crystalSystem)
  engine.addSystem(weaponSystem)
  engine.addSystem(playerSystem)
}

main()
