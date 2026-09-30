import type { CountdownFlags, CountdownMode, OvertimeMode, SceneTextStyle, SceneTextStyles, TimerCentralMode, TimerSettings, TimerState, TimerVisibility } from '../../shared'

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
  scheduleCostPerMinute: 0,
  timerCostPerMinute: 0,
  overtimeCostTotal: 0,
  scheduleOvertimeElapsed: 0,
  timerOvertimeElapsed: 0,
  overtimeIntervalSeconds: 1,
  overtimeMode: 'schedule',
  remainingLabel: 'До завершения',
  costLabel: 'Итого',
  backgroundMode: 'gradient',
  backgroundColor: '#18c56e',
  backgroundGradientColor: '#19b9d1',
  backgroundGradientAngle: 115,
  fontColor: '#ffffff',
  allowNegative: { timer: true, 'to-start': false, 'to-end': true },
  warning: { timer: false, 'to-start': false, 'to-end': false },
  warningColor: '#ffd000',
  overtimeColor: '#ef1717',
  warningSoundFile: null,
  warningSoundLabel: null,
  finishSoundFile: null,
  finishSoundLabel: null,
  textStyles: {
    clock: { scale: 1, weight: 300 },
    schedule: { scale: 1, weight: 300 },
    heading: { scale: 1, weight: 300 },
    time: { scale: 1, weight: 300 },
    event: { scale: 1, weight: 300 },
    remaining: { scale: 1, weight: 300 },
    cost: { scale: 1, weight: 300 }
  },
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
const textWeights = [300, 400, 500, 600, 700]

function textStyle(value: unknown, fallback: SceneTextStyle): SceneTextStyle {
  const source = record(value)
  const weight = number(source.weight, fallback.weight, 300, 700)
  const snapped = textWeights.reduce((best, item) => Math.abs(item - weight) < Math.abs(best - weight) ? item : best)
  return {
    scale: number(source.scale, fallback.scale, 0.6, 1.8),
    weight: snapped
  }
}

function textStyles(value: unknown): SceneTextStyles {
  const source = record(value)
  return {
    clock: textStyle(source.clock, DEFAULT_TIMER.textStyles.clock),
    schedule: textStyle(source.schedule, DEFAULT_TIMER.textStyles.schedule),
    heading: textStyle(source.heading, DEFAULT_TIMER.textStyles.heading),
    time: textStyle(source.time, DEFAULT_TIMER.textStyles.time),
    event: textStyle(source.event, DEFAULT_TIMER.textStyles.event),
    remaining: textStyle(source.remaining, DEFAULT_TIMER.textStyles.remaining),
    cost: textStyle(source.cost, DEFAULT_TIMER.textStyles.cost)
  }
}
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

const countdownModes: CountdownMode[] = ['timer', 'to-start', 'to-end']

function countdownFlags(value: unknown, fallback: CountdownFlags): CountdownFlags {
  const source = record(value)
  const flags = { ...fallback }
  for (const key of countdownModes) {
    if (typeof source[key] === 'boolean') flags[key] = source[key]
  }
  return flags
}

function soundFile(value: unknown, slot: 'warning' | 'finish'): string | null {
  return typeof value === 'string' && new RegExp(`^${slot}\\.(mp3|wav|m4a|aac|ogg|aiff|aif|caf)$`).test(value)
    ? value
    : null
}

function soundLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, 80)
  return trimmed || null
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
  const legacyCost = number(timerRaw.costPerMinute, 0, 0, 1_000_000_000)
  const overtimeModes: OvertimeMode[] = ['schedule', 'timer', 'both']
  const overtimeMode = overtimeModes.includes(timerRaw.overtimeMode as OvertimeMode)
    ? timerRaw.overtimeMode as OvertimeMode
    : timerRaw.scheduleOvertime === false
      ? 'timer'
      : DEFAULT_TIMER.overtimeMode
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
      scheduleCostPerMinute: number(timerRaw.scheduleCostPerMinute, legacyCost, 0, 1_000_000_000),
      timerCostPerMinute: number(timerRaw.timerCostPerMinute, legacyCost, 0, 1_000_000_000),
      overtimeCostTotal: number(timerRaw.overtimeCostTotal, 0, 0, 1_000_000_000_000),
      scheduleOvertimeElapsed: 0,
      timerOvertimeElapsed: 0,
      overtimeIntervalSeconds: Math.round(number(timerRaw.overtimeIntervalSeconds, 1, 1, 3600)),
      overtimeMode,
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
      allowNegative: countdownFlags(timerRaw.allowNegative, DEFAULT_TIMER.allowNegative),
      warning: countdownFlags(timerRaw.warning, DEFAULT_TIMER.warning),
      warningColor: color(timerRaw.warningColor, DEFAULT_TIMER.warningColor),
      overtimeColor: color(timerRaw.overtimeColor, DEFAULT_TIMER.overtimeColor),
      warningSoundFile: soundFile(timerRaw.warningSoundFile, 'warning'),
      warningSoundLabel: soundLabel(timerRaw.warningSoundLabel),
      finishSoundFile: soundFile(timerRaw.finishSoundFile, 'finish'),
      finishSoundLabel: soundLabel(timerRaw.finishSoundLabel),
      textStyles: textStyles(timerRaw.textStyles),
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
