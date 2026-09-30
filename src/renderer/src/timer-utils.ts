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

export function advanceTimer(timer: TimerState, now: Date, tickCountdown: boolean): TimerState {
  const interval = Math.min(3600, Math.max(1, Math.trunc(timer.overtimeIntervalSeconds) || 1))
  let remaining = tickCountdown ? timer.remaining - 1 : timer.remaining
  let running = timer.running
  if (tickCountdown && !timer.allowNegative.timer && remaining <= 0) {
    remaining = 0
    running = false
  }
  const mode = timer.overtimeMode
  const scheduleActive = (mode === 'schedule' || mode === 'both')
    && timer.allowNegative['to-end']
    && secondsUntilTime(now, timer.endTime) < 0
  const timerActive = (mode === 'timer' || mode === 'both')
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
  return {
    ...timer,
    remaining,
    running,
    scheduleOvertimeElapsed: schedule.elapsed,
    timerOvertimeElapsed: countdown.elapsed,
    overtimeCostTotal: Math.max(0, timer.overtimeCostTotal + schedule.add + countdown.add)
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
