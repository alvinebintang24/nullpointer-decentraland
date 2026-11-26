import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { state, bossPhase, BOSS_MAX_HP, PLAYER_MAX_HP } from './game'

// ---------------------------------------------------------------------------
// HUD: boss HP (top center), player HP (bottom left), timer (top right),
// OVERCHARGE indicator, damage flash, and state screens (idle / victory /
// defeat) with START / PLAY AGAIN buttons.
// ---------------------------------------------------------------------------

const WHITE = Color4.create(1, 1, 1, 1)
const CYAN = Color4.create(0.45, 0.95, 1, 1)
const MAGENTA = Color4.create(1, 0.45, 0.85, 1)
const DARK = Color4.create(0.04, 0.05, 0.1, 0.78)
const RED = Color4.create(1, 0.15, 0.1, 1)
const GREEN = Color4.create(0.35, 1, 0.55, 1)

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function Bar(props: { frac: number; width: number; height: number; fill: Color4 }) {
  const w = Math.max(0, Math.min(1, props.frac)) * props.width
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: props.height,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}
    >
      <UiEntity uiTransform={{ width: w, height: props.height }} uiBackground={{ color: props.fill }} />
    </UiEntity>
  )
}

function ui(onStart: () => void) {
  const bossFrac = state.bossHp / BOSS_MAX_HP
  const playerFrac = state.playerHp / PLAYER_MAX_HP
  const inGame = state.phase === 'fighting' || state.phase === 'intro'
  const flashAlpha = state.shakeTimer > 0 ? 0.22 * (state.shakeTimer / 0.25) : 0

  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}
    >
      {/* damage flash */}
      {flashAlpha > 0 ? (
        <UiEntity
          uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 } }}
          uiBackground={{ color: Color4.create(1, 0.1, 0.1, flashAlpha) }}
        />
      ) : null}

      {/* boss bar */}
      {inGame || state.phase === 'won' ? (
        <UiEntity
          uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { top: 18 } }}
        >
          <Label
            value={state.phase === 'intro' ? 'NULLPOINTER AWAKENS…' : `NULLPOINTER — PHASE ${bossPhase()}`}
            fontSize={20}
            color={MAGENTA}
            uiTransform={{ margin: { bottom: 4 } }}
          />
          <Bar frac={bossFrac} width={420} height={16} fill={Color4.create(1, 0.2, 0.55, 1)} />
        </UiEntity>
      ) : null}

      {/* timer */}
      {inGame ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 16, right: 24 }, padding: { top: 4, bottom: 4, left: 10, right: 10 } }}
          uiBackground={{ color: DARK }}
        >
          <Label value={fmtTime(state.fightTime)} fontSize={20} color={WHITE} />
        </UiEntity>
      ) : null}

      {/* overcharge */}
      {state.overchargeTimer > 0 ? (
        <UiEntity uiTransform={{ margin: { top: 10 }, padding: { top: 3, bottom: 3, left: 10, right: 10 } }} uiBackground={{ color: DARK }}>
          <Label value={`⚡ OVERCHARGE x3 — ${state.overchargeTimer.toFixed(0)}s`} fontSize={18} color={CYAN} />
        </UiEntity>
      ) : null}

      {/* player HP */}
      {inGame ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { bottom: 22, left: 24 }, flexDirection: 'column' }}
        >
          <Label value="INTEGRITY" fontSize={14} color={WHITE} uiTransform={{ margin: { bottom: 3 } }} />
          <Bar frac={playerFrac} width={240} height={13} fill={playerFrac > 0.3 ? GREEN : RED} />
        </UiEntity>
      ) : null}

      {/* controls hint */}
      {inGame ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 20, right: 24 } }}>
          <Label value="CLICK shoot • WASD move • dodge the rings" fontSize={13} color={Color4.create(1, 1, 1, 0.65)} />
        </UiEntity>
      ) : null}

      {/* ---- state screens ---- */}
      {state.phase === 'idle' ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: '26%', left: 0 },
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            padding: { top: 22, bottom: 22 }
          }}
          uiBackground={{ color: DARK }}
        >
          <Label value="NULLPOINTER" fontSize={46} color={MAGENTA} />
          <Label value="THE FINAL BOSS — GAME OVER 2026" fontSize={19} color={CYAN} uiTransform={{ margin: { top: 2, bottom: 10 } }} />
          <Label
            value={'Destroy the Devourer of Scenes before it deletes you.\nClick to shoot. Dodge the expanding nova rings.\nBreak cyan crystals for OVERCHARGE x3 damage. Survive all 3 phases!'}
            fontSize={16}
            color={WHITE}
            uiTransform={{ margin: { bottom: 14 } }}
          />
          <Button value="▶  START THE FIGHT" fontSize={20} onMouseDown={onStart} uiBackground={{ color: Color4.create(0.55, 0.1, 0.45, 1) }} color={WHITE} uiTransform={{ padding: { top: 10, bottom: 10, left: 22, right: 22 } }} />
        </UiEntity>
      ) : null}

      {state.phase === 'won' ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: '30%', left: 0 },
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            padding: { top: 22, bottom: 22 }
          }}
          uiBackground={{ color: DARK }}
        >
          <Label value="🏆 VICTORY!" fontSize={44} color={GREEN} />
          <Label
            value={`NULLPOINTER deleted in ${fmtTime(state.fightTime)} — RANK ${state.rank}`}
            fontSize={21}
            color={WHITE}
            uiTransform={{ margin: { top: 6, bottom: 14 } }}
          />
          <Button value="↻  PLAY AGAIN" fontSize={19} onMouseDown={onStart} uiBackground={{ color: Color4.create(0.1, 0.45, 0.3, 1) }} color={WHITE} uiTransform={{ padding: { top: 9, bottom: 9, left: 20, right: 20 } }} />
        </UiEntity>
      ) : null}

      {state.phase === 'lost' ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: '30%', left: 0 },
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            padding: { top: 22, bottom: 22 }
          }}
          uiBackground={{ color: DARK }}
        >
          <Label value="💀 GAME OVER" fontSize={44} color={RED} />
          <Label
            value={`NULLPOINTER survives with ${Math.ceil((state.bossHp / BOSS_MAX_HP) * 100)}% integrity. Recompile and retry!`}
            fontSize={18}
            color={WHITE}
            uiTransform={{ margin: { top: 6, bottom: 14 } }}
          />
          <Button value="↻  TRY AGAIN" fontSize={19} onMouseDown={onStart} uiBackground={{ color: Color4.create(0.5, 0.12, 0.12, 1) }} color={WHITE} uiTransform={{ padding: { top: 9, bottom: 9, left: 20, right: 20 } }} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

export function setupUi(onStart: () => void) {
  ReactEcsRenderer.setUiRenderer(() => ui(onStart))
}
