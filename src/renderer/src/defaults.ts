import type { TimerCentralMode, TimerSettings, TimerState, TimerVisibility } from '../../shared'

export const DEFAULT_TIMER: TimerState = {
  eventName: 'Оперативное совещание',
  headings: {
    current: 'Текущее время:',
    timer: 'Таймер:',
    'to-start': 'До начала мероприятия:',
    'to-end': 'До конца мероприятия:'
  },
  startTime: '14:30',
  endTime: '16:00',
  costPerMinute: 0,
  overtimeCostTotal: 0,
  overtimeElapsed: 0,
  overtimeIntervalSeconds: 1,
  scheduleOvertime: true,
  remainingLabel: 'До завершения',
  costLabel: 'Итого',
  backgroundMode: 'gradient',
  backgroundColor: '#18c56e',
  backgroundGradientColor: '#19b9d1',
  backgroundGradientAngle: 115,
  fontColor: '#ffffff',
  backgroundImage: null,
  centralTimeMode: 'to-end',
  visibility: {
    clock: true,
    schedule: true,
    heading: true,
    eventName: true,
    remaining: true,
    cost: true
  },
  duration: 90 * 60,
  remaining: 90 * 60,
  running: false,
  live: false
}

const modes: TimerCentralMode[] = ['current', 'timer', 'to-start', 'to-end']
const visibilityKeys: Array<keyof TimerVisibility> = [
  'clock', 'schedule', 'heading', 'eventName', 'remaining', 'cost'
]

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function string(value: unknown, fallback: string, maximum = 120): string {
  return typeof value === 'string' ? value.slice(0, maximum) : fallback
}

function number(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function clockTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
}

export function normalizeSettings(raw: unknown): TimerSettings {
  const source = record(raw)
  const timerRaw = record(source.timer)
  const headingsRaw = record(timerRaw.headings)
  const visibilityRaw = record(timerRaw.visibility)
  const centralTimeMode = modes.includes(timerRaw.centralTimeMode as TimerCentralMode)
    ? timerRaw.centralTimeMode as TimerCentralMode
    : DEFAULT_TIMER.centralTimeMode
  const visibility = { ...DEFAULT_TIMER.visibility }
  for (const key of visibilityKeys) {
    if (typeof visibilityRaw[key] === 'boolean') visibility[key] = visibilityRaw[key] as boolean
  }

  const duration = Math.trunc(number(timerRaw.duration, DEFAULT_TIMER.duration, 0, 99 * 3600 + 3599))
  const selectedDisplayIds = Array.isArray(source.selectedDisplayIds)
    ? [...new Set(source.selectedDisplayIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)))]
    : []

  return {
    timer: {
      eventName: string(timerRaw.eventName, DEFAULT_TIMER.eventName),
      headings: {
        current: string(headingsRaw.current, DEFAULT_TIMER.headings.current),
        timer: string(headingsRaw.timer, DEFAULT_TIMER.headings.timer),
        'to-start': string(headingsRaw['to-start'], DEFAULT_TIMER.headings['to-start']),
        'to-end': string(headingsRaw['to-end'], DEFAULT_TIMER.headings['to-end'])
      },
      startTime: clockTime(timerRaw.startTime, DEFAULT_TIMER.startTime),
      endTime: clockTime(timerRaw.endTime, DEFAULT_TIMER.endTime),
      costPerMinute: number(timerRaw.costPerMinute, 0, 0, 1_000_000_000),
      overtimeCostTotal: number(timerRaw.overtimeCostTotal, 0, 0, 1_000_000_000_000),
      overtimeElapsed: 0,
      overtimeIntervalSeconds: Math.round(number(timerRaw.overtimeIntervalSeconds, 1, 1, 3600)),
      scheduleOvertime: typeof timerRaw.scheduleOvertime === 'boolean'
        ? timerRaw.scheduleOvertime
        : DEFAULT_TIMER.scheduleOvertime,
      remainingLabel: string(timerRaw.remainingLabel, DEFAULT_TIMER.remainingLabel, 40),
      costLabel: string(timerRaw.costLabel, DEFAULT_TIMER.costLabel, 40),
      backgroundMode: timerRaw.backgroundMode === 'solid' ? 'solid' : 'gradient',
      backgroundColor: color(timerRaw.backgroundColor, DEFAULT_TIMER.backgroundColor),
      backgroundGradientColor: color(
        timerRaw.backgroundGradientColor,
        DEFAULT_TIMER.backgroundGradientColor
      ),
      backgroundGradientAngle: number(
        timerRaw.backgroundGradientAngle,
        DEFAULT_TIMER.backgroundGradientAngle,
        0,
        360
      ),
      fontColor: color(timerRaw.fontColor, DEFAULT_TIMER.fontColor),
      backgroundImage: typeof timerRaw.backgroundImage === 'string'
        && timerRaw.backgroundImage.startsWith('data:image/')
        ? timerRaw.backgroundImage
        : null,
      centralTimeMode,
      visibility,
      duration,
      remaining: Math.trunc(number(timerRaw.remaining, duration, -7 * 24 * 3600, 7 * 24 * 3600)),
      running: false,
      live: false
    },
    selectedDisplayIds
  }
}

export function defaultHeading(mode: TimerCentralMode): string {
  return DEFAULT_TIMER.headings[mode]
}
