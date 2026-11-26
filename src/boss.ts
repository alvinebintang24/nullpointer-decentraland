import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  MaterialTransparencyMode,
  TextShape,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import {
  ARENA_CENTER,
  BOSS_MAX_HP,
  NOVA_DAMAGE,
  SHARD_DAMAGE,
  BEAM_DAMAGE_PER_TICK,
  state,
  bossPhase,
  damagePlayer,
  playSound,
  computeRank
} from './game'

// ---------------------------------------------------------------------------
// NULLPOINTER, Devourer of Scenes — the final boss.
// A floating glitch-core built from primitives: emissive core, two gyroscope
// rings, crystal shards, glowing eyes and an in-world HP bar.
//
// Attacks:
//  1. NOVA RING  — an expanding red ring on the floor; step in or out of its
//                  path to dodge. All phases, faster each phase.
//  2. SHARD VOLLEY — homing-less bolts fired at the player's position.
//  3. SWEEP BEAMS (phase 3 only) — two rotating pillars of light.
// Phases: P1 100-66% · P2 66-33% (boss starts orbiting) · P3 33-0% enrage.
// ---------------------------------------------------------------------------

let bossGroup: Entity
let core: Entity
let innerCore: Entity
let ringA: Entity
let ringBSpin: Entity
let hpFill: Entity
let novaRing: Entity
let beamGroup: Entity
let beamA: Entity
let beamB: Entity

export const bossPos = Vector3.create(ARENA_CENTER.x, 4.3, ARENA_CENTER.z)

let yawA = 0
let yawB = 0
let flashTimer = 0
let lastMatKey = ''
let novaTimer = 3.2
let volleyTimer = 2.2
let beamYaw = 0
let beamTick = 0

interface Nova {
  active: boolean
  t: number
  damaged: boolean
}
const nova: Nova = { active: false, t: 0, damaged: false }

interface Projectile {
  entity: Entity
  active: boolean
  vel: Vector3
  life: number
}
const projectiles: Projectile[] = []
let pendingShards = 0
let shardStagger = 0

interface BurstShard {
  entity: Entity
  active: boolean
  vel: Vector3
  spin: number
  life: number
}
const burst: BurstShard[] = []

function playerPos(): Vector3 {
  return Transform.get(engine.PlayerEntity).position
}

function pbr(e: Entity, albedo: Color4, emissive?: Color3, intensity = 0, alpha = false) {
  Material.setPbrMaterial(e, {
    albedoColor: albedo,
    emissiveColor: emissive,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metallic: 0.25,
    transparencyMode: alpha ? MaterialTransparencyMode.MTM_ALPHA_BLEND : MaterialTransparencyMode.MTM_OPAQUE
  })
}

export function createBoss() {
  const cx = ARENA_CENTER.x
  const cz = ARENA_CENTER.z

  bossGroup = engine.addEntity()
  Transform.create(bossGroup, { position: Vector3.clone(bossPos) })

  // core
  core = engine.addEntity()
  Transform.create(core, { scale: Vector3.create(3, 3, 3), parent: bossGroup })
  MeshRenderer.setSphere(core)
  MeshCollider.setSphere(core)
  pbr(core, Color4.create(0.16, 0.05, 0.26, 1), Color3.create(1, 0.25, 0.85), 1.8)

  innerCore = engine.addEntity()
  Transform.create(innerCore, { scale: Vector3.create(1.25, 1.25, 1.25), parent: bossGroup })
  MeshRenderer.setSphere(innerCore)
  pbr(innerCore, Color4.create(1, 0.95, 1, 1), Color3.create(1, 0.85, 1), 3)

  // eyes (front = +Z, toward spawn)
  for (const sx of [-0.58, 0.58]) {
    const eye = engine.addEntity()
    Transform.create(eye, { position: Vector3.create(sx, 0.28, 1.34), scale: Vector3.create(0.36, 0.36, 0.36), parent: bossGroup })
    MeshRenderer.setSphere(eye)
    pbr(eye, Color4.create(1, 0.1, 0.1, 1), Color3.create(1, 0.05, 0.05), 3.2)
  }

  // crystal shards pointing outward around the equator
  for (let i = 0; i < 6; i++) {
    const aDeg = i * 60
    const a = (aDeg * Math.PI) / 180
    const shard = engine.addEntity()
    Transform.create(shard, {
      position: Vector3.create(Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85),
      scale: Vector3.create(0.22, 0.22, 0.95),
      rotation: Quaternion.fromEulerDegrees(0, 90 - aDeg, 0),
      parent: bossGroup
    })
    MeshRenderer.setBox(shard)
    pbr(shard, Color4.create(0.5, 0.2, 0.9, 1), Color3.create(0.65, 0.3, 1), 2)
  }

  // gyroscope ring A (flat)
  ringA = engine.addEntity()
  Transform.create(ringA, { parent: bossGroup })
  buildRing(ringA)

  // gyroscope ring B (tilted, spins on its own axis)
  const tilt = engine.addEntity()
  Transform.create(tilt, { rotation: Quaternion.fromEulerDegrees(62, 0, 0), parent: bossGroup })
  ringBSpin = engine.addEntity()
  Transform.create(ringBSpin, { parent: tilt })
  buildRing(ringBSpin)

  // in-world HP bar + name
  const barBg = engine.addEntity()
  Transform.create(barBg, { position: Vector3.create(0, 2.55, 0), scale: Vector3.create(2.7, 0.24, 0.06), parent: bossGroup })
  MeshRenderer.setBox(barBg)
  pbr(barBg, Color4.create(0.05, 0.05, 0.08, 0.85), undefined, 0, true)

  hpFill = engine.addEntity()
  Transform.create(hpFill, { position: Vector3.create(0, 2.55, 0.05), scale: Vector3.create(2.6, 0.16, 0.04), parent: bossGroup })
  MeshRenderer.setBox(hpFill)
  pbr(hpFill, Color4.create(1, 0.2, 0.55, 1), Color3.create(1, 0.2, 0.55), 1.6)

  const name = engine.addEntity()
  Transform.create(name, { position: Vector3.create(0, 3.15, 0), parent: bossGroup })
  TextShape.create(name, {
    text: 'NULLPOINTER',
    fontSize: 1.5,
    textColor: Color4.create(1, 0.75, 0.95, 1)
  })

  // nova ring (hidden until an attack starts)
  novaRing = engine.addEntity()
  Transform.create(novaRing, {
    position: Vector3.create(cx, 0.16, cz),
    scale: Vector3.create(0.001, 0.14, 0.001)
  })
  MeshRenderer.setCylinder(novaRing, 1, 1)
  pbr(novaRing, Color4.create(1, 0.15, 0.1, 0.5), Color3.create(1, 0.1, 0.05), 2.2, true)

  // sweep beams (phase 3)
  beamGroup = engine.addEntity()
  Transform.create(beamGroup, { position: Vector3.create(cx, 3, cz) })
  beamA = makeBeam(4.3)
  beamB = makeBeam(-4.3)
  setBeamsVisible(false)

  // projectile pool
  for (let i = 0; i < 14; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0.34, 0.34, 0.34) })
    MeshRenderer.setSphere(e)
    pbr(e, Color4.create(1, 0.45, 0.15, 1), Color3.create(1, 0.4, 0.1), 2.6)
    projectiles.push({ entity: e, active: false, vel: Vector3.Zero(), life: 0 })
  }

  // death-burst pool
  for (let i = 0; i < 12; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -10, 0), scale: Vector3.create(0.3, 0.3, 0.3) })
    MeshRenderer.setBox(e)
    pbr(e, Color4.create(0.9, 0.4, 1, 1), Color3.create(0.8, 0.3, 1), 2.2)
    burst.push({ entity: e, active: false, vel: Vector3.Zero(), spin: 0, life: 0 })
  }
}

function buildRing(parent: Entity) {
  for (let i = 0; i < 10; i++) {
    const aDeg = i * 36
    const a = (aDeg * Math.PI) / 180
    const seg = engine.addEntity()
    Transform.create(seg, {
      position: Vector3.create(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35),
      scale: Vector3.create(0.36, 0.13, 0.62),
      rotation: Quaternion.fromEulerDegrees(0, 90 - aDeg, 0),
      parent
    })
    MeshRenderer.setBox(seg)
    pbr(seg, Color4.create(0.35, 0.15, 0.6, 1), Color3.create(0.6, 0.3, 1), 1.7)
  }
}

function makeBeam(x: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, 0, 0), scale: Vector3.create(3.6, 6, 0.35), parent: beamGroup })
  MeshRenderer.setBox(e)
  pbr(e, Color4.create(1, 0.1, 0.05, 0.5), Color3.create(1, 0.08, 0.04), 2.4, true)
  return e
}

function setBeamsVisible(v: boolean) {
  const s = v ? Vector3.create(3.6, 6, 0.35) : Vector3.create(0.001, 0.001, 0.001)
  Transform.getMutable(beamA).scale = Vector3.clone(s)
  Transform.getMutable(beamB).scale = Vector3.clone(s)
}

export function getBossCoreEntity(): Entity {
  return core
}

export function damageBoss(amount: number) {
  if (state.phase !== 'fighting') return
  state.bossHp = Math.max(0, state.bossHp - amount)
  flashTimer = 0.09
  playSound('hit')
  if (state.bossHp <= 0) {
    die()
  }
}

function die() {
  state.phase = 'won'
  state.rank = computeRank(state.fightTime)
  state.message = 'VICTORY!'
  playSound('boom')
  playSound('victory')
  // hide boss, nova, beams, projectiles
  Transform.getMutable(bossGroup).scale = Vector3.create(0.001, 0.001, 0.001)
  Transform.getMutable(novaRing).scale = Vector3.create(0.001, 0.14, 0.001)
  setBeamsVisible(false)
  for (const p of projectiles) deactivateProjectile(p)
  // launch the burst
  let i = 0
  for (const b of burst) {
    const a = (i / burst.length) * Math.PI * 2
    b.active = true
    b.life = 1.4
    b.spin = Math.random() * 360
    b.vel = Vector3.create(Math.cos(a) * (2.5 + Math.random() * 3), 2.5 + Math.random() * 3.5, Math.sin(a) * (2.5 + Math.random() * 3))
    Transform.getMutable(b.entity).position = Vector3.clone(bossPos)
    Transform.getMutable(b.entity).scale = Vector3.create(0.3, 0.3, 0.3)
    i++
  }
}

function deactivateProjectile(p: Projectile) {
  p.active = false
  Transform.getMutable(p.entity).position = Vector3.create(0, -10, 0)
}

function fireShard() {
  const p = projectiles.find((x) => !x.active)
  if (!p) return
  const pp = playerPos()
  const target = Vector3.create(pp.x, pp.y + 1.1, pp.z)
  const dir = Vector3.normalize(Vector3.subtract(target, bossPos))
  p.vel = Vector3.scale(dir, 11)
  p.active = true
  p.life = 4
  Transform.getMutable(p.entity).position = Vector3.clone(bossPos)
}

export function resetBoss() {
  Transform.getMutable(bossGroup).scale = Vector3.create(1, 1, 1)
  Transform.getMutable(bossGroup).position = Vector3.create(ARENA_CENTER.x, 4.3, ARENA_CENTER.z)
  bossPos.x = ARENA_CENTER.x
  bossPos.y = 4.3
  bossPos.z = ARENA_CENTER.z
  novaTimer = 3.2
  volleyTimer = 2.2
  pendingShards = 0
  nova.active = false
  Transform.getMutable(novaRing).scale = Vector3.create(0.001, 0.14, 0.001)
  setBeamsVisible(false)
  for (const p of projectiles) deactivateProjectile(p)
  for (const b of burst) {
    b.active = false
    Transform.getMutable(b.entity).position = Vector3.create(0, -10, 0)
  }
}

export function bossSystem(dt: number) {
  const phase = bossPhase()
  const fighting = state.phase === 'fighting'
  const t = state.fightTime

  // --- movement: hover bob; slow orbit from phase 2 ---
  const orbitR = phase >= 2 && fighting ? 1.3 : 0
  const orbitA = t * 0.3
  bossPos.x = ARENA_CENTER.x + Math.cos(orbitA) * orbitR
  bossPos.z = ARENA_CENTER.z + Math.sin(orbitA) * orbitR
  bossPos.y = 4.3 + Math.sin(t * 1.4) * 0.35
  if (state.phase !== 'won') {
    Transform.getMutable(bossGroup).position = Vector3.clone(bossPos)
  }

  // --- rings spin (faster when enraged) ---
  const spinSpeed = phase === 3 ? 130 : phase === 2 ? 85 : 55
  yawA += dt * spinSpeed
  yawB -= dt * spinSpeed * 0.8
  Transform.getMutable(ringA).rotation = Quaternion.fromEulerDegrees(0, yawA, 0)
  Transform.getMutable(ringBSpin).rotation = Quaternion.fromEulerDegrees(0, yawB, 0)

  // --- hit flash + HP bar (material only rewritten when something changed) ---
  if (flashTimer > 0) flashTimer -= dt
  const flash = flashTimer > 0
  const matKey = `${flash ? 1 : 0}-${phase}`
  if (matKey !== lastMatKey) {
    lastMatKey = matKey
    Material.setPbrMaterial(core, {
      albedoColor:
        phase === 3 ? Color4.create(0.3, 0.04, 0.1, 1) : Color4.create(0.16, 0.05, 0.26, 1),
      emissiveColor: phase === 3 ? Color3.create(1, 0.15, 0.1) : Color3.create(1, 0.25, 0.85),
      emissiveIntensity: flash ? 4.5 : phase === 3 ? 2.6 : 1.8,
      roughness: 0.35,
      metallic: 0.25
    })
  }
  const frac = Math.max(0, state.bossHp / BOSS_MAX_HP)
  const ft = Transform.getMutable(hpFill)
  ft.scale = Vector3.create(2.6 * frac, 0.16, 0.04)
  ft.position = Vector3.create(-1.3 + 1.3 * frac, 2.55, 0.05)

  // --- death burst animation (runs during 'won') ---
  for (const b of burst) {
    if (!b.active) continue
    b.life -= dt
    if (b.life <= 0) {
      b.active = false
      Transform.getMutable(b.entity).position = Vector3.create(0, -10, 0)
      continue
    }
    b.vel = Vector3.create(b.vel.x, b.vel.y - 5.5 * dt, b.vel.z)
    b.spin += dt * 300
    const bt = Transform.getMutable(b.entity)
    bt.position = Vector3.add(bt.position, Vector3.scale(b.vel, dt))
    bt.rotation = Quaternion.fromEulerDegrees(b.spin, b.spin * 0.7, 0)
    const s = Math.max(0.05, 0.3 * (b.life / 1.4))
    bt.scale = Vector3.create(s, s, s)
  }

  if (!fighting) return

  const cdScale = (state.overchargeTimer > 0 ? 0.7 : 1) * (phase === 2 ? 0.88 : phase === 3 ? 0.74 : 1)

  // --- NOVA RING ---
  if (!nova.active) {
    novaTimer -= dt
    if (novaTimer <= 0) {
      nova.active = true
      nova.t = 0
      nova.damaged = false
      playSound('nova')
    }
  } else {
    nova.t += dt
    const dur = 1.5
    const r = 0.5 + (nova.t / dur) * 6.6
    const nt = Transform.getMutable(novaRing)
    nt.scale = Vector3.create(r, 0.14, r)
    nt.position = Vector3.create(bossPos.x, 0.16, bossPos.z)
    if (!nova.damaged) {
      const pp = playerPos()
      const dist = Math.hypot(pp.x - bossPos.x, pp.z - bossPos.z)
      if (Math.abs(dist - r) < 0.85) {
        nova.damaged = true
        damagePlayer(NOVA_DAMAGE)
      }
    }
    if (nova.t >= dur) {
      nova.active = false
      Transform.getMutable(novaRing).scale = Vector3.create(0.001, 0.14, 0.001)
      novaTimer = 5.6 * cdScale
    }
  }

  // --- SHARD VOLLEY ---
  volleyTimer -= dt
  if (volleyTimer <= 0) {
    pendingShards = phase === 1 ? 3 : phase === 2 ? 4 : 5
    shardStagger = 0
    volleyTimer = 4.4 * cdScale
  }
  if (pendingShards > 0) {
    shardStagger -= dt
    if (shardStagger <= 0) {
      fireShard()
      pendingShards--
      shardStagger = 0.17
    }
  }
  const ppNow = playerPos()
  const playerCenter = Vector3.create(ppNow.x, ppNow.y + 1.1, ppNow.z)
  for (const p of projectiles) {
    if (!p.active) continue
    p.life -= dt
    const pt = Transform.getMutable(p.entity)
    pt.position = Vector3.add(pt.position, Vector3.scale(p.vel, dt))
    if (p.life <= 0 || pt.position.y < 0.1 || Vector3.distance(pt.position, playerCenter) < 1.15) {
      if (Vector3.distance(pt.position, playerCenter) < 1.15) damagePlayer(SHARD_DAMAGE)
      deactivateProjectile(p)
    }
  }

  // --- SWEEP BEAMS (phase 3) ---
  if (phase === 3) {
    setBeamsVisible(true)
    beamYaw += dt * 0.75
    Transform.getMutable(beamGroup).rotation = Quaternion.fromEulerDegrees(0, (beamYaw * 180) / Math.PI, 0)
    Transform.getMutable(beamGroup).position = Vector3.create(bossPos.x, 3, bossPos.z)
    beamTick -= dt
    const pp = playerPos()
    const dist = Math.hypot(pp.x - bossPos.x, pp.z - bossPos.z)
    if (dist > 2.1 && dist < 6.7) {
      let ang = Math.atan2(pp.z - bossPos.z, pp.x - bossPos.x)
      if (ang < 0) ang += Math.PI * 2
      for (const off of [0, Math.PI]) {
        // beam children sit on the group's local X axis; a Y-rotation of
        // beamYaw maps +X to world angle -beamYaw in atan2(z, x) terms
        let ba = (-beamYaw + off) % (Math.PI * 2)
        if (ba < 0) ba += Math.PI * 2
        let diff = Math.abs(ang - ba)
        if (diff > Math.PI) diff = Math.PI * 2 - diff
        if (diff < 0.17 && beamTick <= 0) {
          damagePlayer(BEAM_DAMAGE_PER_TICK)
          beamTick = 0.5
        }
      }
    }
  } else {
    setBeamsVisible(false)
  }
}
