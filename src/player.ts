import {
  engine,
  Transform,
  MeshRenderer,
  Material,
  InputAction,
  inputSystem,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3 } from '@dcl/sdk/math'
import {
  BLASTER_DAMAGE,
  BLASTER_COOLDOWN,
  BLASTER_RANGE,
  OVERCHARGE_MULT,
  OVERCHARGE_DURATION,
  PLAYER_MAX_HP,
  state,
  playSound
} from './game'
import { damageBoss, bossPos } from './boss'
import { crystals, crystalWorldPos, breakCrystal } from './arena'

// ---------------------------------------------------------------------------
// Player side: hitscan blaster (left click / IA_PRIMARY), tracer dots,
// crystal breaking -> OVERCHARGE, and out-of-combat regeneration.
// A pointer-event fallback for direct boss clicks lives in index.ts and is
// debounced against successful hitscan hits via noteBossHit().
// ---------------------------------------------------------------------------

let cooldown = 0
let elapsed = 0
let lastBossHitAt = -99

interface TracerDot {
  entity: Entity
  life: number
}
const dots: TracerDot[] = []

export function initWeapon() {
  for (let i = 0; i < 10; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0.09, 0.09, 0.09) })
    MeshRenderer.setSphere(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(0.6, 0.95, 1, 1),
      emissiveColor: Color3.create(0.4, 0.9, 1),
      emissiveIntensity: 3,
      roughness: 0.2,
      metallic: 0
    })
    dots.push({ entity: e, life: 0 })
  }
}

export function currentDamage(): number {
  return BLASTER_DAMAGE * (state.overchargeTimer > 0 ? OVERCHARGE_MULT : 1)
}

export function noteBossHit() {
  lastBossHitAt = elapsed
}

export function lastBossHitAgo(): number {
  return elapsed - lastBossHitAt
}

/** Perpendicular distance from point P to the ray (origin, dir). t = distance along the ray of closest approach. */
function rayPoint(origin: Vector3, dir: Vector3, p: Vector3): { t: number; d: number } {
  const to = Vector3.subtract(p, origin)
  const t = Vector3.dot(to, dir)
  const closest = Vector3.add(origin, Vector3.scale(dir, Math.max(0, t)))
  return { t, d: Vector3.distance(closest, p) }
}

function spawnTracer(origin: Vector3, dir: Vector3, dist: number) {
  let idx = 0
  const steps = Math.min(8, Math.max(2, Math.floor(dist / 2)))
  for (let i = 1; i <= steps && idx < dots.length; i++) {
    const dot = dots[idx++]
    dot.life = 0.09
    const p = Vector3.add(origin, Vector3.scale(dir, (dist * i) / (steps + 1)))
    Transform.getMutable(dot.entity).position = p
  }
}

function shoot() {
  playSound('shoot')
  const cam = Transform.get(engine.CameraEntity)
  const origin = cam.position
  const dir = Vector3.normalize(Vector3.rotate(Vector3.Forward(), cam.rotation))

  // boss first (big target)
  const bossCheck = rayPoint(origin, dir, bossPos)
  if (bossCheck.t > 0 && bossCheck.t < BLASTER_RANGE && bossCheck.d < 2.2) {
    damageBoss(currentDamage())
    noteBossHit()
    spawnTracer(origin, dir, bossCheck.t)
    return
  }

  // then crystals
  for (const c of crystals) {
    if (!c.active) continue
    const cp = crystalWorldPos(c)
    const check = rayPoint(origin, dir, cp)
    if (check.t > 0 && check.t < BLASTER_RANGE && check.d < 1.05) {
      c.hp -= currentDamage()
      spawnTracer(origin, dir, check.t)
      if (c.hp <= 0) {
        breakCrystal(c)
        state.overchargeTimer = OVERCHARGE_DURATION
        playSound('crystal')
      } else {
        playSound('hit')
      }
      return
    }
  }

  // miss: short tracer into the distance
  spawnTracer(origin, dir, 14)
}

export function weaponSystem(dt: number) {
  elapsed += dt
  cooldown -= dt

  for (const dot of dots) {
    if (dot.life > 0) {
      dot.life -= dt
      if (dot.life <= 0) {
        Transform.getMutable(dot.entity).position = Vector3.create(0, -10, 0)
      }
    }
  }

  if (state.phase !== 'fighting') return
  if (cooldown <= 0 && inputSystem.isPressed(InputAction.IA_PRIMARY)) {
    cooldown = BLASTER_COOLDOWN
    shoot()
  }
}

export function playerSystem(dt: number) {
  state.lastDamageTimer += dt
  state.shakeTimer = Math.max(0, state.shakeTimer - dt)
  if (state.overchargeTimer > 0) {
    state.overchargeTimer = Math.max(0, state.overchargeTimer - dt)
  }
  // regen: +4 HP/s after 5 quiet seconds
  if (
    state.phase === 'fighting' &&
    state.playerHp > 0 &&
    state.playerHp < PLAYER_MAX_HP &&
    state.lastDamageTimer > 5
  ) {
    state.playerHp = Math.min(PLAYER_MAX_HP, state.playerHp + 4 * dt)
  }
}
