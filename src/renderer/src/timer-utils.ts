import type { TimerState } from '../../shared'

export type DigitPhase = 'normal' | 'warning' | 'overtime'
export type CueSlot = 'warning' | 'finish'

export interface CueState {
  warningArmed: boolean
  finishArmed: boolean
  previous: number | null
}

export function formatTimer(totalSeconds: number): string {
  const negative = totalSeconds < 0
  const absolute = Math.abs(Math.trunc(totalSeconds))
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const seconds = absolute % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${negative ? '−' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function accrueOvertime(
  elapsed: number,
  active: boolean,
  costPerMinute: number,
  interval: number
): { elapsed: number; add: number } {
  if (!active || costPerMinute <= 0) return { elapsed: 0, add: 0 }
  const next = (elapsed || 0) + 1
  if (next < interval) return { elapsed: next, add: 0 }
  return { elapsed: 0, add: (costPerMinute / 60) * interval }
}

function overtimeInterval(timer: TimerState): number {
  return Math.min(3600, Math.max(1, Math.trunc(timer.overtimeIntervalSeconds) || 1))
}

function billedOvertimeSeconds(seconds: number, interval: number): number {
  if (seconds <= 0) return 0
  return Math.floor(seconds / interval) * interval
}

export interface OvertimeCost {
  overtimeCostBanked: number
  sessionOvertimeCost: number
  overtimeCostTotal: number
  timerOvertimeElapsed: number
}

function countsTimerOvertime(timer: TimerState): boolean {
  return (timer.overtimeMode === 'timer' || timer.overtimeMode === 'both')
    && timer.allowNegative.timer
    && timer.timerCostPerMinute > 0
}

function sessionMoney(timer: TimerState, remaining: number): number {
  if (!countsTimerOvertime(timer)) return 0
  const billed = billedOvertimeSeconds(Math.max(0, -remaining), overtimeInterval(timer))
  return (billed / 60) * timer.timerCostPerMinute
}

function packCost(banked: number, session: number, elapsed: number): OvertimeCost {
  return {
    overtimeCostBanked: banked,
    sessionOvertimeCost: session,
    overtimeCostTotal: Math.max(0, banked + session),
    timerOvertimeElapsed: elapsed
  }
}

/** Saved totals from before the split count as already recorded money, minus this timer's overtime. */
export function splitOvertimeCost(timer: TimerState): { banked: number; session: number } {
  const banked = timer.overtimeCostBanked
  const session = timer.sessionOvertimeCost
  if (typeof banked === 'number' && typeof session === 'number') return { banked, session }
  const current = sessionMoney(timer, timer.remaining)
  return {
    session: current,
    banked: Math.max(0, (timer.overtimeCostTotal || 0) - current)
  }
}

export function initialOvertimeCost(input: {
  total: number
  banked: unknown
  session: unknown
  remaining: number
  mode: TimerState['overtimeMode']
  allowNegative: boolean
  rate: number
  interval: number
}): Pick<OvertimeCost, 'overtimeCostBanked' | 'sessionOvertimeCost' | 'overtimeCostTotal'> {
  const limit = 1_000_000_000_000
  const clamp = (value: number): number => Math.min(limit, Math.max(0, value))
  if (typeof input.banked === 'number' && Number.isFinite(input.banked)
    && typeof input.session === 'number' && Number.isFinite(input.session)) {
    const banked = clamp(input.banked)
    const session = clamp(input.session)
    return {
      overtimeCostBanked: banked,
      sessionOvertimeCost: session,
      overtimeCostTotal: clamp(banked + session)
    }
  }
  const counts = (input.mode === 'timer' || input.mode === 'both') && input.allowNegative && input.rate > 0
  const interval = Math.min(3600, Math.max(1, Math.trunc(input.interval) || 1))
  const billed = counts ? billedOvertimeSeconds(Math.max(0, -input.remaining), interval) : 0
  const session = clamp((billed / 60) * input.rate)
  const banked = clamp(Math.max(0, input.total - session))
  return {
    overtimeCostBanked: banked,
    sessionOvertimeCost: session,
    overtimeCostTotal: clamp(banked + session)
  }
}

/** Close this timer: its overtime is recorded and later jumps cannot change it. */
export function commitTimerSession(timer: TimerState): OvertimeCost {
  const { banked, session } = splitOvertimeCost(timer)
  return packCost(banked + session, 0, 0)
}

/** +/- minutes rewrites only the open timer session. Recorded overtime stays put. */
export function retargetTimerCost(timer: TimerState, nextRemaining: number): OvertimeCost {
  const { banked, session } = splitOvertimeCost(timer)
  if (!countsTimerOvertime(timer)) {
    return packCost(banked, session, nextRemaining < 0 ? (timer.timerOvertimeElapsed || 0) : 0)
  }
  const afterSeconds = Math.max(0, -nextRemaining)
  const after = billedOvertimeSeconds(afterSeconds, overtimeInterval(timer))
  return packCost(banked, (after / 60) * timer.timerCostPerMinute, afterSeconds - after)
}

export function advanceTimer(timer: TimerState, now: Date, tickCountdown: boolean): TimerState {
  const interval = overtimeInterval(timer)
  let remaining = tickCountdown ? timer.remaining - 1 : timer.remaining
  let running = timer.running
  if (tickCountdown && !timer.allowNegative.timer && remaining <= 0) {
    remaining = 0
    running = false
  }
  const mode = timer.overtimeMode
  const counting = timer.running
  const scheduleActive = counting
    && (mode === 'schedule' || mode === 'both')
    && timer.allowNegative['to-end']
    && secondsUntilTime(now, timer.endTime) < 0
  const timerActive = counting
    && (mode === 'timer' || mode === 'both')
    && timer.allowNegative.timer
    && remaining < 0
  if (
    remaining === timer.remaining
    && running === timer.running
    && !scheduleActive
    && !timerActive
  ) return timer
  const schedule = accrueOvertime(timer.scheduleOvertimeElapsed, scheduleActive, timer.scheduleCostPerMinute, interval)
  const countdown = accrueOvertime(timer.timerOvertimeElapsed, timerActive, timer.timerCostPerMinute, interval)
  const parts = splitOvertimeCost(timer)
  const cost = packCost(parts.banked + schedule.add, parts.session + countdown.add, countdown.elapsed)
  return {
    ...timer,
    remaining,
    running,
    scheduleOvertimeElapsed: schedule.elapsed,
    ...cost
  }
}

export function clampCountdown(seconds: number, allowNegative: boolean): number {
  return allowNegative || seconds > 0 ? seconds : 0
}

export function digitPhase(seconds: number, allowNegative: boolean, warning: boolean): DigitPhase {
  if (seconds < 0) return allowNegative ? 'overtime' : 'normal'
  if (seconds === 0) return allowNegative ? 'overtime' : 'normal'
  if (warning && seconds <= 60) return 'warning'
  return 'normal'
}

export function seedCue(seconds: number | null): CueState {
  if (seconds == null) return { warningArmed: true, finishArmed: true, previous: null }
  return {
    warningArmed: seconds > 60,
    finishArmed: seconds > 0,
    previous: seconds
  }
}

export function consumeCue(
  state: CueState,
  seconds: number | null,
  warningEnabled: boolean,
  announce = true
): { state: CueState; play: CueSlot | null } {
  if (seconds == null) return { state, play: null }
  let finishArmed = state.finishArmed
  if (state.previous != null && seconds > state.previous + 1) finishArmed = true
  const previous = state.previous
  if (!announce) {
    return {
      state: { warningArmed: seconds >= 60, finishArmed: seconds > 0, previous: seconds },
      play: null
    }
  }
  if (seconds <= 0) {
    const play = finishArmed && previous != null && previous > 0 ? 'finish' as const : null
    return { state: { warningArmed: false, finishArmed: false, previous: seconds }, play }
  }
  const crossedMinute = previous != null && previous >= 60 && seconds < 60
  if (crossedMinute && warningEnabled) {
    return { state: { warningArmed: false, finishArmed: true, previous: seconds }, play: 'warning' }
  }
  return { state: { warningArmed: seconds >= 60, finishArmed: true, previous: seconds }, play: null }
}

export const EVENT_STARTED_HEADING = 'Мероприятие началось'

export function toStartClock(
  now: Date,
  startTime: string,
  allowNegative: boolean
): { seconds: number; started: boolean } {
  const untilStart = secondsUntilTime(now, startTime)
  if (untilStart > 0) return { seconds: untilStart, started: false }
  return { seconds: clampCountdown(untilStart, allowNegative), started: true }
}

export function secondsUntilTime(now: Date, time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return 0
  const target = new Date(now)
  target.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 1000)
}

export function timePartsFromSeconds(totalSeconds: number): Record<'hours' | 'minutes' | 'seconds', string> {
  const absolute = Math.abs(Math.trunc(totalSeconds))
  const pad = (value: number): string => String(value).padStart(2, '0')
  return {
    hours: pad(Math.min(99, Math.floor(absolute / 3600))),
    minutes: pad(Math.floor((absolute % 3600) / 60)),
    seconds: pad(absolute % 60)
  }
}

export function secondsFromTimeParts(parts: Record<'hours' | 'minutes' | 'seconds', string>): number {
  return Math.min(99, Number(parts.hours) || 0) * 3600
    + Math.min(59, Number(parts.minutes) || 0) * 60
    + Math.min(59, Number(parts.seconds) || 0)
}

export function normalizeTimePart(part: 'hours' | 'minutes' | 'seconds', value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 2)
  if (!digits) return ''
  const maximum = part === 'hours' ? 99 : 59
  return String(Math.min(maximum, Number(digits))).padStart(digits.length, '0')
}
