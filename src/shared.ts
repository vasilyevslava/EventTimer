export type TimerCentralMode = 'current' | 'timer' | 'to-start' | 'to-end'
export type TimerHeadings = Record<TimerCentralMode, string>

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
  costPerMinute: number
  overtimeCostTotal: number
  overtimeElapsed: number
  overtimeIntervalSeconds: number
  scheduleOvertime: boolean
  remainingLabel: string
  costLabel: string
  backgroundMode: 'solid' | 'gradient'
  backgroundColor: string
  backgroundGradientColor: string
  backgroundGradientAngle: number
  fontColor: string
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

export interface TimerPlusApi {
  listDisplays: () => Promise<DisplayInfo[]>
  setLayout: (layout: ControlLayout) => Promise<void>
  onDisplaysChanged: (callback: (displays: DisplayInfo[]) => void) => () => void
  selectBackground: () => Promise<string | null>
  loadSettings: () => Promise<unknown>
  saveSettings: (settings: TimerSettings) => void
  goLive: (displayIds: number[], timer: TimerState) => Promise<void>
  updateLive: (timer: TimerState) => void
  stopLive: () => Promise<void>
  onLiveState: (callback: (timer: TimerState | null) => void) => () => void
  outputReady: (displayId: number) => void
}
