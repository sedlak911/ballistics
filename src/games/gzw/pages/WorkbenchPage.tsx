import { useEffect, useMemo, useRef } from 'react'
import { angleOfOffset } from '../../../engine/units'
import { ScopeView } from '../../../components/ScopeView'
import { aimSolution, crossingSpeedMs, suggestedZero } from '../../../engine/aim'
import { pointAt, SIGHT_HEIGHT_M, solveTrajectory, type TrajectoryPoint } from '../../../engine/trajectory'
import { fmtDistance, fmtLength } from '../../../format'
import { useSettings } from '../../../settings/SettingsContext'
import { FirstSetup } from '../components/FirstSetup'
import { FocusView, type Figure } from '../components/FocusView'
import { ImportControl } from '../components/ImportControl'
import { SetupMenus } from '../components/SetupMenus'
import { Toolbar } from '../components/Toolbar'
import { CHART_RANGE_M, energyShift } from '../penetration'
import { STEADINESS_MIL, useGzwProfile } from '../profile'
import { applyImport } from '../ocr/apply'
import { SOLVE_TO_M, verdictFor } from '../verdict'
import { DISTANCE_M } from '../ranging'
import { bestAmmoId, useGzwSetup, WEAPONS, zeroRange } from '../setup'
import type { GzwAmmo, GzwBarrel } from '../types'
import { accuracyFor, projectileFor } from '../workbench'

function useTrajectories(ammoList: GzwAmmo[], barrel: GzwBarrel | null, zeroM: number) {
  return useMemo(() => {
    const out = new Map<string, TrajectoryPoint[]>()
    for (const a of ammoList) {
      const { projectile } = projectileFor(a, barrel)
      out.set(a.id, solveTrajectory({ projectile, zeroM, sightHeightM: SIGHT_HEIGHT_M }, SOLVE_TO_M))
    }
    return out
  }, [ammoList, barrel, zeroM])
}

export function WorkbenchPage() {
  const { display, t } = useSettings()
  const { setup, weapon, barrels, barrel, scopes, scope, ammoList, ammo, update } = useGzwSetup()
  const sys = display.system
  const unit = display.angle
  const unitLabel = unit === 'mil' ? 'MIL' : 'MOA'

  const trajectories = useTrajectories(ammoList, barrel, setup.zeroM)
  const traj = trajectories.get(ammo.id)!
  const accuracy = accuracyFor(weapon, barrel, ammo, setup.accuracyMoa)
  const aim = aimSolution(traj, setup.distanceM, { movement: setup.movement, crossing: setup.crossing, unit, accuracyMoa: accuracy })
  const zeroHere = suggestedZero(setup.distanceM, zeroRange(weapon, scope))
  const [profile, setProfile] = useGzwProfile()
  // The energy a round keeps at the target against its energy where the wiki chart holds; penetration falls off
  // with it past that range (our estimate).
  const ref = pointAt(traj, CHART_RANGE_M).velocityMs
  const energy = ref > 0 ? Math.min(1, (pointAt(traj, setup.distanceM).velocityMs / ref) ** 2) : 1
  const shift = energyShift(energy)
  const verdict = verdictFor(traj, setup.distanceM, {
    accuracyMoa: accuracy,
    steadinessMil: STEADINESS_MIL[profile.steadiness],
    rangeSigmaPct: setup.rangeSigmaPct,
    crossingSpeedMs: crossingSpeedMs(setup.movement, setup.crossing),
    zone: profile.aimZone,
    posture: setup.posture,
  })

  const holdingUnder = aim.holdover < -0.05
  const hold: Figure = {
    key: 'hold',
    label: holdingUnder ? t('wb.holdUnder') : t('wb.holdOver'),
    value: `${holdingUnder ? '↓' : '↑'}${Math.abs(aim.holdover).toFixed(1)}`, unit: unitLabel,
    sub: `≈ ${fmtLength(aim.holdoverLinearM, sys)}${zeroHere !== null && zeroHere !== setup.zeroM ? ` · ${t('orZero', { d: fmtDistance(zeroHere, sys) })}` : ''}`,
  }
  const lead: Figure = {
    key: 'lead', label: t('wb.lead'),
    value: aim.lead > 0 ? `${setup.direction > 0 ? '→' : '←'}${aim.lead.toFixed(1)}` : '0', unit: unitLabel,
    sub: aim.lead > 0 ? `≈ ${fmtLength(aim.leadLinearM, sys)}` : undefined,
  }

  const importControl = (
    <ImportControl currentWeapon={weapon} onApply={(sel) => {
      const r = applyImport(sel, { currentWeapon: weapon })
      if (Object.keys(r.setup).length === 0) return
      update(r.setup)
      if (!profile.setupDone) setProfile({ setupDone: true })
    }} />
  )
  const scopeView = (
    <ScopeView distanceM={setup.distanceM} holdover={aim.holdover} lead={aim.lead} direction={setup.direction}
      pose={setup.posture !== 'standing' ? setup.posture : setup.movement === 'jogging' || setup.movement === 'sprinting' ? 'running' : 'standing'} unit={unit}
      spread={{ x: angleOfOffset(verdict.sigmaM.x, setup.distanceM, unit), y: angleOfOffset(verdict.sigmaM.y, setup.distanceM, unit) }}
      aimAt={profile.aimZone} labels={{ hold: t(holdingUnder ? 'sc.holdUnder' : 'sc.holdOver'), lead: t('sc.lead') }}
      legend={{ aim: t('sc.legendAim'), r68: t('sc.legend68'), r95: t('sc.legend95') }}
      caption={`${scope.magnification ?? ''} · ${scope.ffp ? 'FFP' : 'SFP'} · ${unitLabel}`} offViewLabel={t('wb.offView')} />
  )
  // The wheel over the scope: 1 m per step. Steps can come faster than renders, so they add to the last distance set.
  const lastDistance = useRef(setup.distanceM)
  useEffect(() => {
    lastDistance.current = setup.distanceM
  }, [setup.distanceM])
  const onScopeWheel = (steps: number) => {
    const d = Math.min(DISTANCE_M.max, Math.max(DISTANCE_M.min, lastDistance.current + steps))
    if (d === lastDistance.current) return
    lastDistance.current = d
    update({ distanceM: d })
  }
  const toolbar = <Toolbar setup={setup} update={update} unit={unit} system={sys}
    rangeBy={profile.rangeBy} onRangeBy={(rangeBy) => setProfile({ rangeBy })}
    stance={profile.steadiness} onStance={(s) => setProfile({ steadiness: s })} />

  return (
    <FocusView
      firstSetup={profile.setupDone ? undefined : (
        <FirstSetup weapons={WEAPONS} importControl={importControl}
          onWeapon={(id) => { update({ weaponId: id, ammoId: bestAmmoId(id) }); setProfile({ setupDone: true }) }} />
      )}
      tags={
        <SetupMenus setup={setup} update={update} weapons={WEAPONS} weapon={weapon} barrels={barrels} barrel={barrel}
          scopes={scopes} scope={scope} ammoList={ammoList} ammo={ammo} />
      }
      importControl={importControl} scope={scopeView}
      verdict={verdict} zone={profile.aimZone} onZone={(z) => setProfile({ aimZone: z })}
      spreadKnown={accuracy !== null} hold={hold} lead={lead}
      ammo={ammo} shift={shift} energyNote={t('pen.energy', { e: Math.round(energy * 100), d: fmtDistance(setup.distanceM, sys), ref: fmtDistance(CHART_RANGE_M, sys) })} toolbar={toolbar}
      formatDistance={(m) => fmtDistance(m, sys)} onScopeWheel={onScopeWheel} />
  )
}
