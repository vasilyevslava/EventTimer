import { DEFAULT_SCENE_SLOTS, DEFAULT_SLOT_SHOWN, PRESET_SLOT_COUNT, SCENE_SLOT_ORDER } from '../../shared'
import type { CountdownFlags, CountdownMode, CountdownSeconds, OvertimeMode, SceneFontFamily, SceneSlotShown, SceneSlots, SceneTextStyle, SceneTextStyles, ScreenConfig, ScreenPreset, SlotContent, TimerCentralMode, TimerSettings, TimerState, TimerVisibility } from '../../shared'
import { nearestFontWeight, sceneFont } from './fonts'
import { initialOvertimeCost } from './timer-utils'

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
  overtimeCostBanked: 0,
  sessionOvertimeCost: 0,
  scheduleOvertimeCost: 0,
  countFullEventOvertime: false,
  fullEventOvertimeCredit: 0,
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
  blink: { timer: true, 'to-start': false, 'to-end': true },
  blinkSeconds: { timer: 5, 'to-start': 5, 'to-end': 5 },
  warningColor: '#ffd000',
  overtimeColor: '#ef1717',
  costOvertimeRed: true,
  remainingOvertimeRed: true,
  warningSoundFile: null,
  warningSoundLabel: null,
  finishSoundFile: null,
  finishSoundLabel: null,
  textStyles: {
    clock: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    date: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    schedule: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    heading: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    time: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    event: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    remaining: { scale: 1, weight: 300, family: 'sb-sans', italic: false },
    cost: { scale: 1, weight: 300, family: 'sb-sans', italic: false }
  },
  backgroundImage: null,
  centralTimeMode: 'to-end',
  slots: { ...DEFAULT_SCENE_SLOTS },
  slotShown: { ...DEFAULT_SLOT_SHOWN },
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

function textStyle(value: unknown, fallback: SceneTextStyle): SceneTextStyle {
  const source = record(value)
  const requested = typeof source.family === 'string' ? source.family : fallback.family
  const font = sceneFont(requested)
  const family = font.id as SceneFontFamily
  const weight = number(source.weight, fallback.weight, 100, 900)
  return {
    scale: number(source.scale, fallback.scale, 0.6, 1.8),
    weight: nearestFontWeight(weight, font.weights),
    family,
    italic: font.italic && source.italic === true
  }
}

function textStyles(value: unknown): SceneTextStyles {
  const source = record(value)
  return {
    clock: textStyle(source.clock, DEFAULT_TIMER.textStyles.clock),
    date: textStyle(source.date, DEFAULT_TIMER.textStyles.date),
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

function countdownSeconds(value: unknown, fallback: CountdownSeconds): CountdownSeconds {
  const source = record(value)
  const seconds = { ...fallback }
  for (const key of countdownModes) {
    seconds[key] = Math.round(number(source[key], fallback[key], 1, 3600))
  }
  return seconds
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
  const visibilityRaw = record(timerRaw.visibility)
  const centralTimeMode = modes.includes(timerRaw.centralTimeMode as TimerCentralMode)
    ? timerRaw.centralTimeMode as TimerCentralMode
    : DEFAULT_TIMER.centralTimeMode
  const visibility = { ...DEFAULT_TIMER.visibility }
  for (const key of visibilityKeys) {
    if (typeof visibilityRaw[key] === 'boolean') visibility[key] = visibilityRaw[key] as boolean
  }

  const duration = Math.trunc(number(timerRaw.duration, DEFAULT_TIMER.duration, 0, 99 * 3600 + 3599))
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
    timer: normalizeTimerState(timerRaw, duration, overtimeMode, centralTimeMode, visibility),
    selectedDisplayIds,
    presets: normalizePresets(source.presets)
  }
}

function normalizeTimerState(
  timerRaw: Record<string, unknown>,
  duration: number,
  overtimeMode: OvertimeMode,
  centralTimeMode: TimerCentralMode,
  visibility: TimerVisibility
): TimerState {
  const headingsRaw = record(timerRaw.headings)
  const legacyCost = number(timerRaw.costPerMinute, 0, 0, 1_000_000_000)
  const slots = normalizeSlots(timerRaw.slots, visibility)
  const slotShown = normalizeSlotShown(timerRaw.slotShown, slots)
  const shown = new Set(SCENE_SLOT_ORDER.filter((key) => slotShown[key]).map((key) => slots[key]))
  return {
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
      ...initialOvertimeCost({
        total: number(timerRaw.overtimeCostTotal, 0, 0, 1_000_000_000_000),
        banked: timerRaw.overtimeCostBanked,
        session: timerRaw.sessionOvertimeCost,
        remaining: Math.trunc(number(timerRaw.remaining, duration, -7 * 24 * 3600, 7 * 24 * 3600)),
        mode: overtimeMode,
        allowNegative: countdownFlags(timerRaw.allowNegative, DEFAULT_TIMER.allowNegative).timer,
        rate: number(timerRaw.timerCostPerMinute, legacyCost, 0, 1_000_000_000),
        interval: Math.round(number(timerRaw.overtimeIntervalSeconds, 1, 1, 3600))
      }),
      scheduleOvertimeCost: number(timerRaw.scheduleOvertimeCost, 0, 0, 1_000_000_000_000),
      countFullEventOvertime: timerRaw.countFullEventOvertime === true,
      fullEventOvertimeCredit: number(timerRaw.fullEventOvertimeCredit, 0, 0, 1_000_000_000_000),
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
      blink: countdownFlags(timerRaw.blink, DEFAULT_TIMER.blink),
      blinkSeconds: countdownSeconds(timerRaw.blinkSeconds, DEFAULT_TIMER.blinkSeconds),
      warningColor: color(timerRaw.warningColor, DEFAULT_TIMER.warningColor),
      overtimeColor: color(timerRaw.overtimeColor, DEFAULT_TIMER.overtimeColor),
      costOvertimeRed: timerRaw.costOvertimeRed !== false,
      remainingOvertimeRed: timerRaw.remainingOvertimeRed !== false,
      warningSoundFile: soundFile(timerRaw.warningSoundFile, 'warning'),
      warningSoundLabel: soundLabel(timerRaw.warningSoundLabel),
      finishSoundFile: soundFile(timerRaw.finishSoundFile, 'finish'),
      finishSoundLabel: soundLabel(timerRaw.finishSoundLabel),
      slots,
      slotShown,
      textStyles: textStyles(timerRaw.textStyles),
      backgroundImage: typeof timerRaw.backgroundImage === 'string'
        && timerRaw.backgroundImage.startsWith('data:image/')
        ? timerRaw.backgroundImage
        : null,
      centralTimeMode,
      visibility: {
        ...visibility,
        clock: shown.has('clock'),
        schedule: shown.has('schedule'),
        remaining: shown.has('remaining'),
        cost: shown.has('cost')
      },
      duration,
      remaining: Math.trunc(number(timerRaw.remaining, duration, -7 * 24 * 3600, 7 * 24 * 3600)),
      running: false,
      live: false
  }
}

export function screenConfigFromTimer(timer: TimerState): ScreenConfig {
  return {
    eventName: timer.eventName,
    headings: { ...timer.headings },
    startTime: timer.startTime,
    endTime: timer.endTime,
    scheduleCostPerMinute: timer.scheduleCostPerMinute,
    timerCostPerMinute: timer.timerCostPerMinute,
    overtimeIntervalSeconds: timer.overtimeIntervalSeconds,
    overtimeMode: timer.overtimeMode,
    remainingLabel: timer.remainingLabel,
    costLabel: timer.costLabel,
    backgroundMode: timer.backgroundMode,
    backgroundColor: timer.backgroundColor,
    backgroundGradientColor: timer.backgroundGradientColor,
    backgroundGradientAngle: timer.backgroundGradientAngle,
    fontColor: timer.fontColor,
    allowNegative: { ...timer.allowNegative },
    warning: { ...timer.warning },
    blink: { ...(timer.blink ?? DEFAULT_TIMER.blink) },
    blinkSeconds: { ...(timer.blinkSeconds ?? DEFAULT_TIMER.blinkSeconds) },
    warningColor: timer.warningColor,
    overtimeColor: timer.overtimeColor,
    costOvertimeRed: timer.costOvertimeRed,
    remainingOvertimeRed: timer.remainingOvertimeRed,
    warningSoundFile: timer.warningSoundFile,
    warningSoundLabel: timer.warningSoundLabel,
    finishSoundFile: timer.finishSoundFile,
    finishSoundLabel: timer.finishSoundLabel,
    textStyles: {
      clock: { ...timer.textStyles.clock },
      date: { ...(timer.textStyles.date ?? DEFAULT_TIMER.textStyles.date) },
      schedule: { ...timer.textStyles.schedule },
      heading: { ...timer.textStyles.heading },
      time: { ...timer.textStyles.time },
      event: { ...timer.textStyles.event },
      remaining: { ...timer.textStyles.remaining },
      cost: { ...timer.textStyles.cost }
    },
    backgroundImage: timer.backgroundImage,
    centralTimeMode: timer.centralTimeMode,
    slots: { ...timer.slots },
    slotShown: { ...timer.slotShown },
    visibility: { ...timer.visibility }
  }
}

function normalizePresets(raw: unknown): ScreenPreset[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: PRESET_SLOT_COUNT }, (_, index) => {
    const item = record(list[index])
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 40) : ''
    if (item.config == null || typeof item.config !== 'object') return { name, config: null }
    const timer = normalizeTimerState(
      record(item.config),
      DEFAULT_TIMER.duration,
      overtimeModeFrom(record(item.config)),
      centralModeFrom(record(item.config)),
      visibilityFrom(record(item.config))
    )
    return { name, config: screenConfigFromTimer(timer) }
  })
}

function centralModeFrom(timerRaw: Record<string, unknown>): TimerCentralMode {
  return modes.includes(timerRaw.centralTimeMode as TimerCentralMode)
    ? timerRaw.centralTimeMode as TimerCentralMode
    : DEFAULT_TIMER.centralTimeMode
}

const slotContents: SlotContent[] = ['empty', 'clock', 'date', 'schedule', 'remaining', 'cost']

function normalizeSlots(raw: unknown, visibility: TimerVisibility): SceneSlots {
  const source = record(raw)
  const saved = SCENE_SLOT_ORDER.some((key) => typeof source[key] === 'string')
  const slots: SceneSlots = saved
    ? { ...DEFAULT_SCENE_SLOTS }
    : {
      topLeft: visibility.clock ? 'clock' : 'empty',
      topCenter: 'date',
      topRight: visibility.schedule ? 'schedule' : 'empty',
      bottomLeft: visibility.remaining ? 'remaining' : 'empty',
      bottomCenter: 'empty',
      bottomRight: visibility.cost ? 'cost' : 'empty'
    }
  if (saved) {
    for (const key of SCENE_SLOT_ORDER) {
      const value = source[key]
      if (typeof value === 'string' && slotContents.includes(value as SlotContent)) slots[key] = value as SlotContent
    }
  }
  const seen = new Set<SlotContent>()
  for (const key of SCENE_SLOT_ORDER) {
    const content = slots[key]
    if (content === 'empty') continue
    if (seen.has(content)) slots[key] = 'empty'
    else seen.add(content)
  }
  return slots
}

function normalizeSlotShown(raw: unknown, slots: SceneSlots): SceneSlotShown {
  const source = record(raw)
  const shown = { ...DEFAULT_SLOT_SHOWN }
  for (const key of SCENE_SLOT_ORDER) {
    shown[key] = typeof source[key] === 'boolean' ? source[key] : slots[key] !== 'empty'
  }
  return shown
}

function visibilityFrom(timerRaw: Record<string, unknown>): TimerVisibility {
  const visibilityRaw = record(timerRaw.visibility)
  const visibility = { ...DEFAULT_TIMER.visibility }
  for (const key of visibilityKeys) {
    if (typeof visibilityRaw[key] === 'boolean') visibility[key] = visibilityRaw[key] as boolean
  }
  return visibility
}

function overtimeModeFrom(timerRaw: Record<string, unknown>): OvertimeMode {
  const overtimeModes: OvertimeMode[] = ['schedule', 'timer', 'both']
  return overtimeModes.includes(timerRaw.overtimeMode as OvertimeMode)
    ? timerRaw.overtimeMode as OvertimeMode
    : timerRaw.scheduleOvertime === false
      ? 'timer'
      : DEFAULT_TIMER.overtimeMode
}

export function defaultHeading(mode: TimerCentralMode): string {
  return DEFAULT_TIMER.headings[mode]
}
