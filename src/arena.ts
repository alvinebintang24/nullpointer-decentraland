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
import { ARENA_CENTER, ARENA_RADIUS, CRYSTAL_HP } from './game'

// ---------------------------------------------------------------------------
// Arena: circular duelling platform, force-field walls (they carry colliders
// so the avatar stays inside), decorative pillars, an instruction sign, the
// START pedestal and three OVERCHARGE crystals.
// ---------------------------------------------------------------------------

export interface Crystal {
  group: Entity
  gem: Entity
  angle: number // radians, position around the arena
  hp: number
  active: boolean
  respawnTimer: number
  spin: number
}

export const crystals: Crystal[] = []
export let startPedestal: Entity = 0 as Entity

const DARK_METAL = Color4.create(0.08, 0.09, 0.14, 1)
const PANEL = Color4.create(0.12, 0.14, 0.22, 1)
const CYAN = Color3.create(0.2, 0.9, 1)
const MAGENTA = Color3.create(1, 0.25, 0.85)

function box(
  pos: Vector3,
  scale: Vector3,
  color: Color4,
  opts: { emissive?: Color3; emissiveIntensity?: number; collider?: boolean; rotation?: Quaternion; alpha?: boolean } = {}
): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale, rotation: opts.rotation })
  MeshRenderer.setBox(e)
  if (opts.collider) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    emissiveColor: opts.emissive,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    roughness: 0.55,
    metallic: 0.35,
    transparencyMode: opts.alpha ? MaterialTransparencyMode.MTM_ALPHA_BLEND : MaterialTransparencyMode.MTM_OPAQUE
  })
  return e
}

export function createArena() {
  const cx = ARENA_CENTER.x
  const cz = ARENA_CENTER.z

  // --- platform: two stacked cylinders read as a stepped duelling disc ---
  const base = engine.addEntity()
  Transform.create(base, { position: Vector3.create(cx, -0.25, cz), scale: Vector3.create(16, 0.5, 16) })
  MeshRenderer.setCylinder(base, 1, 1)
  MeshCollider.setCylinder(base, 1, 1)
  Material.setPbrMaterial(base, { albedoColor: DARK_METAL, roughness: 0.8, metallic: 0.4 })

  const top = engine.addEntity()
  Transform.create(top, { position: Vector3.create(cx, 0.02, cz), scale: Vector3.create(15.2, 0.14, 15.2) })
  MeshRenderer.setCylinder(top, 1, 1)
  Material.setPbrMaterial(top, { albedoColor: PANEL, roughness: 0.6, metallic: 0.5 })

  // glowing trim ring: 24 emissive segments
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    box(
      Vector3.create(cx + Math.cos(a) * 6.9, 0.12, cz + Math.sin(a) * 6.9),
      Vector3.create(1.7, 0.1, 0.18),
      Color4.create(0.05, 0.1, 0.16, 1),
      { emissive: i % 2 === 0 ? CYAN : MAGENTA, emissiveIntensity: 1.6, rotation: Quaternion.fromEulerDegrees(0, -a * (180 / Math.PI) + 90, 0) }
    )
  }

  // --- force-field walls: 12 segments with colliders keep the player in ---
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    box(
      Vector3.create(cx + Math.cos(a) * (ARENA_RADIUS + 0.55), 1.6, cz + Math.sin(a) * (ARENA_RADIUS + 0.55)),
      Vector3.create(4.15, 3.2, 0.15),
      Color4.create(0.3, 0.8, 1, 0.16),
      { collider: true, alpha: true, rotation: Quaternion.fromEulerDegrees(0, -a * (180 / Math.PI) + 90, 0) }
    )
  }

  // --- four decorative pillars outside the walls ---
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const px = cx + Math.cos(a) * 9.2
    const pz = cz + Math.sin(a) * 9.2
    box(Vector3.create(px, 2.2, pz), Vector3.create(0.7, 4.4, 0.7), DARK_METAL, { collider: true })
    box(Vector3.create(px, 4.7, pz), Vector3.create(0.95, 0.5, 0.95), Color4.create(0.1, 0.05, 0.14, 1), {
      emissive: i % 2 === 0 ? MAGENTA : CYAN,
      emissiveIntensity: 2
    })
  }

  // --- instruction sign, in front of the spawn point, facing the player ---
  box(Vector3.create(cx, 2.6, 13.2), Vector3.create(5.6, 2.4, 0.2), DARK_METAL, { collider: true })
  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(cx, 2.65, 13.05) })
  TextShape.create(sign, {
    text: 'NULLPOINTER — THE FINAL BOSS\nCLICK to shoot  •  Dodge the expanding red rings\nBreak the cyan crystals for OVERCHARGE x3 damage\nTouch the pedestal to begin!',
    fontSize: 1.6,
    textColor: Color4.create(0.85, 0.97, 1, 1),
    lineSpacing: 1.25
  })

  // --- START pedestal ---
  const ped = engine.addEntity()
  Transform.create(ped, { position: Vector3.create(cx, 0.5, 11.6), scale: Vector3.create(1.1, 1, 1.1) })
  MeshRenderer.setCylinder(ped, 0.75, 1)
  MeshCollider.setCylinder(ped, 0.75, 1)
  Material.setPbrMaterial(ped, { albedoColor: PANEL, roughness: 0.5, metallic: 0.6 })
  startPedestal = ped

  const shard = engine.addEntity()
  Transform.create(shard, {
    position: Vector3.create(cx, 1.7, 11.6),
    scale: Vector3.create(0.34, 0.8, 0.34),
    rotation: Quaternion.fromEulerDegrees(0, 30, 0)
  })
  MeshRenderer.setCylinder(shard, 0, 1)
  Material.setPbrMaterial(shard, {
    albedoColor: Color4.create(0.6, 1, 1, 1),
    emissiveColor: CYAN,
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metallic: 0.1
  })

  // The pedestal's click callback is wired in index.ts via pointerEventsSystem.

  // --- OVERCHARGE crystals ---
  const crystalAngles = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]
  for (const a of crystalAngles) {
    const gx = cx + Math.cos(a) * 5.4
    const gz = cz + Math.sin(a) * 5.4
    const group = engine.addEntity()
    Transform.create(group, { position: Vector3.create(gx, 1.5, gz) })

    const gemTop = engine.addEntity()
    Transform.create(gemTop, {
      position: Vector3.create(0, 0.42, 0),
      scale: Vector3.create(0.62, 0.85, 0.62),
      parent: group
    })
    MeshRenderer.setCylinder(gemTop, 0, 1)
    MeshCollider.setCylinder(gemTop, 0, 1)
    Material.setPbrMaterial(gemTop, {
      albedoColor: Color4.create(0.55, 0.98, 1, 1),
      emissiveColor: CYAN,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metallic: 0.1
    })

    const gemBottom = engine.addEntity()
    Transform.create(gemBottom, {
      position: Vector3.create(0, -0.42, 0),
      scale: Vector3.create(0.62, 0.85, 0.62),
      rotation: Quaternion.fromEulerDegrees(180, 0, 0),
      parent: group
    })
    MeshRenderer.setCylinder(gemBottom, 0, 1)
    Material.setPbrMaterial(gemBottom, {
      albedoColor: Color4.create(0.55, 0.98, 1, 1),
      emissiveColor: CYAN,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metallic: 0.1
    })

    crystals.push({ group, gem: gemTop, angle: a, hp: CRYSTAL_HP, active: true, respawnTimer: 0, spin: Math.random() * 360 })
  }
}

export function resetCrystals() {
  for (const c of crystals) {
    c.hp = CRYSTAL_HP
    c.active = true
    c.respawnTimer = 0
    const t = Transform.getMutable(c.group)
    t.scale = Vector3.create(1, 1, 1)
  }
}

export function crystalWorldPos(c: Crystal): Vector3 {
  const t = Transform.get(c.group)
  return t.position
}

/** Idle animation + respawn logic for the crystals. */
export function crystalSystem(dt: number) {
  for (const c of crystals) {
    if (!c.active) {
      c.respawnTimer -= dt
      if (c.respawnTimer <= 0) {
        c.active = true
        c.hp = CRYSTAL_HP
        Transform.getMutable(c.group).scale = Vector3.create(1, 1, 1)
      }
      continue
    }
    c.spin += dt * 60
    const t = Transform.getMutable(c.group)
    t.rotation = Quaternion.fromEulerDegrees(0, c.spin, 0)
    t.position = Vector3.create(t.position.x, 1.5 + Math.sin(c.spin * 0.04) * 0.15, t.position.z)
  }
}

export function breakCrystal(c: Crystal) {
  c.active = false
  c.respawnTimer = 25
  Transform.getMutable(c.group).scale = Vector3.create(0.001, 0.001, 0.001)
}
