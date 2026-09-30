export type TimerCentralMode = 'current' | 'timer' | 'to-start' | 'to-end'
export type CountdownMode = 'timer' | 'to-start' | 'to-end'
export type CountdownFlags = Record<CountdownMode, boolean>
export type OvertimeMode = 'schedule' | 'timer' | 'both'
export type SoundSlot = 'warning' | 'finish'
export type TimerHeadings = Record<TimerCentralMode, string>
export type SceneTextKey = 'clock' | 'schedule' | 'heading' | 'time' | 'event' | 'remaining' | 'cost'

export interface SceneTextStyle {
  scale: number
  weight: number
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
  warningColor: string
  overtimeColor: string
  warningSoundFile: string | null
  warningSoundLabel: string | null
  finishSoundFile: string | null
  finishSoundLabel: string | null
  textStyles: SceneTextStyles
  backgroundImage: string | null
  centralTimeMode: TimerCentralMode
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

export interface TimerSettings {
  timer: TimerState
  selectedDisplayIds: number[]
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
