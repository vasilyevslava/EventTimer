export type TimerCentralMode = 'current' | 'timer' | 'to-start' | 'to-end'
export type CountdownMode = 'timer' | 'to-start' | 'to-end'
export type CountdownFlags = Record<CountdownMode, boolean>
export type CountdownSeconds = Record<CountdownMode, number>
export type OvertimeMode = 'schedule' | 'timer' | 'both' | 'none'
export type SoundSlot = 'warning' | 'finish'
export type TimerHeadings = Record<TimerCentralMode, string>
export type SceneTextKey = 'clock' | 'date' | 'schedule' | 'heading' | 'time' | 'event' | 'remaining' | 'cost'
export type SceneSlot = 'topLeft' | 'topCenter' | 'topRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight'
export type SlotContent = 'empty' | 'clock' | 'date' | 'schedule' | 'remaining' | 'cost'
export type SceneSlots = Record<SceneSlot, SlotContent>
export type SceneSlotShown = Record<SceneSlot, boolean>

export const SCENE_SLOT_ORDER: SceneSlot[] = [
  'topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight'
]

export const DEFAULT_SCENE_SLOTS: SceneSlots = {
  topLeft: 'clock',
  topCenter: 'date',
  topRight: 'schedule',
  bottomLeft: 'remaining',
  bottomCenter: 'empty',
  bottomRight: 'cost'
}

export const DEFAULT_SLOT_SHOWN: SceneSlotShown = {
  topLeft: true,
  topCenter: true,
  topRight: true,
  bottomLeft: true,
  bottomCenter: false,
  bottomRight: true
}
export type SceneFontFamily = 'sb-sans' | 'sf-pro' | 'sf-display' | 'sf-text' | 'sf-rounded'

export interface SceneTextStyle {
  scale: number
  weight: number
  family: SceneFontFamily
  italic: boolean
}

export type SceneTextStyles = Record<SceneTextKey, SceneTextStyle>

export interface TimerVisibility {
  clock: boolean
  schedule: boolean
  heading: boolean
  eventName: boolean
  remaining: boolean
  cost: boolean
}

export interface TimerState {
  eventName: string
  headings: TimerHeadings
  startTime: string
  endTime: string
  scheduleCostPerMinute: number
  timerCostPerMinute: number
  overtimeCostTotal: number
  overtimeCostBanked: number
  sessionOvertimeCost: number
  scheduleOvertimeCost: number
  countFullEventOvertime: boolean
  fullEventOvertimeCredit: number
  overtimeHoldTotal: number | null
  scheduleOvertimeElapsed: number
  timerOvertimeElapsed: number
  overtimeIntervalSeconds: number
  overtimeMode: OvertimeMode
  remainingLabel: string
  costLabel: string
  backgroundMode: 'solid' | 'gradient'
  backgroundColor: string
  backgroundGradientColor: string
  backgroundGradientAngle: number
  fontColor: string
  allowNegative: CountdownFlags
  warning: CountdownFlags
  blink: CountdownFlags
  blinkSeconds: CountdownSeconds
  warningColor: string
  overtimeColor: string
  costOvertimeRed: boolean
  remainingOvertimeRed: boolean
  warningSoundFile: string | null
  warningSoundLabel: string | null
  finishSoundFile: string | null
  finishSoundLabel: string | null
  textStyles: SceneTextStyles
  backgroundImage: string | null
  centralTimeMode: TimerCentralMode
  slots: SceneSlots
  slotShown: SceneSlotShown
  visibility: TimerVisibility
  duration: number
  remaining: number
  running: boolean
  live: boolean
}

export interface DisplayInfo {
  id: number
  label: string
  isPrimary: boolean
  width: number
  height: number
  scaleFactor: number
}

export interface ScreenConfig {
  eventName: string
  headings: TimerHeadings
  startTime: string
  endTime: string
  scheduleCostPerMinute: number
  timerCostPerMinute: number
  overtimeIntervalSeconds: number
  overtimeMode: OvertimeMode
  remainingLabel: string
  costLabel: string
  backgroundMode: 'solid' | 'gradient'
  backgroundColor: string
  backgroundGradientColor: string
  backgroundGradientAngle: number
  fontColor: string
  allowNegative: CountdownFlags
  warning: CountdownFlags
  blink: CountdownFlags
  blinkSeconds: CountdownSeconds
  warningColor: string
  overtimeColor: string
  costOvertimeRed: boolean
  remainingOvertimeRed: boolean
  warningSoundFile: string | null
  warningSoundLabel: string | null
  finishSoundFile: string | null
  finishSoundLabel: string | null
  textStyles: SceneTextStyles
  backgroundImage: string | null
  centralTimeMode: TimerCentralMode
  slots: SceneSlots
  slotShown: SceneSlotShown
  visibility: TimerVisibility
}

export interface ScreenPreset {
  name: string
  config: ScreenConfig | null
}

export const PRESET_SLOT_COUNT = 5

export interface TimerSettings {
  timer: TimerState
  selectedDisplayIds: number[]
  presets: ScreenPreset[]
}

export type ControlLayout = 'compact' | 'expanded'

export type SoundPickResult =
  | { ok: true; fileName: string; label: string }
  | { ok: false; reason: 'canceled' | 'too-large' | 'failed' }

export interface SoundPayload {
  mime: string
  base64: string
}

export interface TimerPlusApi {
  listDisplays: () => Promise<DisplayInfo[]>
  setLayout: (layout: ControlLayout) => Promise<void>
  onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void) => () => void
  selectBackground: () => Promise<string | null>
  pickSound: (slot: SoundSlot) => Promise<SoundPickResult>
  readSound: (fileName: string) => Promise<SoundPayload | null>
  clearSound: (slot: SoundSlot) => Promise<void>
  loadSettings: () => Promise<unknown>
  saveSettings: (settings: TimerSettings) => void
  goLive: (displayIds: number[], timer: TimerState) => Promise<void>
  updateLive: (timer: TimerState) => void
  stopLive: () => Promise<void>
  onLiveState: (callback: (timer: TimerState | null) => void) => () => void
  outputReady: (displayId: number) => void
}
