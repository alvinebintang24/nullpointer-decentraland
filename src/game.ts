import { engine, AudioSource, type Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// NULLPOINTER — Game Over 2026
// Shared game state + tuning constants + tiny audio helper.
// All gameplay numbers live here so balancing is a one-file job.
// ---------------------------------------------------------------------------

export const ARENA_CENTER = Vector3.create(8, 0, 8)
export const ARENA_RADIUS = 7.2

export const BOSS_MAX_HP = 320
export const PLAYER_MAX_HP = 100
export const BLASTER_DAMAGE = 10
export const BLASTER_COOLDOWN = 0.22
export const BLASTER_RANGE = 42

export const CRYSTAL_HP = 20
export const CRYSTAL_RESPAWN = 25
export const OVERCHARGE_MULT = 3
export const OVERCHARGE_DURATION = 8

export const NOVA_DAMAGE = 16
export const SHARD_DAMAGE = 10
export const BEAM_DAMAGE_PER_TICK = 7

export type GamePhase = 'idle' | 'intro' | 'fighting' | 'won' | 'lost'

export interface GameState {
  phase: GamePhase
  bossHp: number
  playerHp: number
  fightTime: number // seconds since the fight started
  introTimer: number
  overchargeTimer: number // >0 while OVERCHARGE is active
  lastDamageTimer: number // seconds since the player last took damage (regen gate)
  shakeTimer: number // camera-adjacent feedback timer (used for hit flash UI)
  message: string // big center-screen message
  rank: string // victory rank (S/A/B/C)
}

export const state: GameState = {
  phase: 'idle',
  bossHp: BOSS_MAX_HP,
  playerHp: PLAYER_MAX_HP,
  fightTime: 0,
  introTimer: 0,
  overchargeTimer: 0,
  lastDamageTimer: 99,
  shakeTimer: 0,
  message: '',
  rank: ''
}

export function bossPhase(): 1 | 2 | 3 {
  const f = state.bossHp / BOSS_MAX_HP
  if (f > 0.66) return 1
  if (f > 0.33) return 2
  return 3
}

export function resetGame() {
  state.bossHp = BOSS_MAX_HP
  state.playerHp = PLAYER_MAX_HP
  state.fightTime = 0
  state.introTimer = 0
  state.overchargeTimer = 0
  state.lastDamageTimer = 99
  state.shakeTimer = 0
  state.message = ''
  state.rank = ''
}

export function computeRank(seconds: number): string {
  if (seconds <= 90) return 'S'
  if (seconds <= 150) return 'A'
  if (seconds <= 210) return 'B'
  return 'C'
}

/**
 * Apply damage to the player. A short 0.3s invulnerability window after each
 * hit keeps overlapping attacks (beam tick + shard) from deleting the player
 * unfairly in a single frame.
 */
export function damagePlayer(amount: number) {
  if (state.phase !== 'fighting') return
  if (state.lastDamageTimer < 0.3) return
  state.playerHp = Math.max(0, state.playerHp - amount)
  state.lastDamageTimer = 0
  state.shakeTimer = 0.25
  playSound('hurt')
  if (state.playerHp <= 0) {
    state.phase = 'lost'
    state.message = 'GAME OVER'
    playSound('defeat')
  }
}

// ---------------------------------------------------------------------------
// Audio: one entity per clip, two alternating voices per clip so rapid
// one-shots (shoot/hit) can overlap without cutting each other off.
// ---------------------------------------------------------------------------

const voices = new Map<string, { entities: Entity[]; next: number }>()

function makeVoice(clip: string, volume: number, loop: boolean): Entity {
  const e = engine.addEntity()
  AudioSource.create(e, {
    audioClipUrl: clip,
    volume,
    loop,
    playing: false
  })
  return e
}

export function initAudio() {
  const defs: Array<[string, string, number]> = [
    ['shoot', 'assets/sounds/shoot.wav', 0.5],
    ['hit', 'assets/sounds/hit.wav', 0.6],
    ['hurt', 'assets/sounds/hurt.wav', 0.7],
    ['nova', 'assets/sounds/nova.wav', 0.6],
    ['boom', 'assets/sounds/boom.wav', 0.9],
    ['crystal', 'assets/sounds/crystal.wav', 0.7],
    ['victory', 'assets/sounds/victory.wav', 0.8],
    ['defeat', 'assets/sounds/defeat.wav', 0.8]
  ]
  for (const [name, clip, volume] of defs) {
    voices.set(name, {
      entities: [makeVoice(clip, volume, false), makeVoice(clip, volume, false)],
      next: 0
    })
  }
  // ambient hum, loops forever at low volume
  const amb = engine.addEntity()
  AudioSource.create(amb, {
    audioClipUrl: 'assets/sounds/ambient.wav',
    volume: 0.35,
    loop: true,
    playing: true
  })
}

export function playSound(name: string) {
  const v = voices.get(name)
  if (!v) return
  const e = v.entities[v.next]
  v.next = (v.next + 1) % v.entities.length
  const src = AudioSource.getMutable(e)
  src.playing = false
  src.playing = true
}

// ---------------------------------------------------------------------------
// Minimal frame scheduler (avoids extra deps; deterministic with dt).
// ---------------------------------------------------------------------------

interface Scheduled {
  time: number
  fn: () => void
  cancelled: boolean
}

const queue: Scheduled[] = []
let clock = 0

export function after(delaySeconds: number, fn: () => void): Scheduled {
  const item: Scheduled = { time: clock + delaySeconds, fn, cancelled: false }
  queue.push(item)
  return item
}

export function clearSchedule() {
  queue.length = 0
}

export function schedulerSystem(dt: number) {
  clock += dt
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i]
    if (item.cancelled) {
      queue.splice(i, 1)
    } else if (clock >= item.time) {
      queue.splice(i, 1)
      item.fn()
    }
  }
}
