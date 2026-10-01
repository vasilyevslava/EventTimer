import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type {
  CountdownMode,
  DisplayInfo,
  SceneSlot,
  SceneSlotShown,
  SceneSlots,
  SceneTextKey,
  ScreenPreset,
  SlotContent,
  SoundSlot,
  TimerCentralMode,
  TimerSettings,
  TimerState,
  TimerVisibility
} from '../../shared'
import { DEFAULT_SCENE_SLOTS, DEFAULT_SLOT_SHOWN, PRESET_SLOT_COUNT, SCENE_SLOT_ORDER } from '../../shared'
import { DEFAULT_TIMER, defaultHeading, normalizeSettings, screenConfigFromTimer } from './defaults'
import { nearestFontWeight, SCENE_FONTS, sceneFont } from './fonts'
import appIcon from './assets/app-icon.png'
import { EventTimerScene } from './EventTimerScene'
import {
  advanceTimer,
  retargetTimerCost,
  consumeCue,
  digitPhase,
  normalizeTimePart,
  secondsFromTimeParts,
  secondsUntilTime,
  seedCue,
  timePartsFromSeconds
} from './timer-utils'
import type { CueSlot, CueState } from './timer-utils'

type TimePart = 'hours' | 'minutes' | 'seconds'
type TimeParts = Record<TimePart, string>

const expandedLayoutFlag = '__eventTimerExpanded'
const expandedLayoutRoot = globalThis as typeof globalThis & { [expandedLayoutFlag]?: boolean }
if (!expandedLayoutRoot[expandedLayoutFlag]) {
  expandedLayoutRoot[expandedLayoutFlag] = true
  void window.timerPlus.setLayout('expanded')
}

const modeOptions: Array<[TimerCentralMode, string]> = [
  ['current', 'Время'],
  ['timer', 'Таймер'],
  ['to-start', 'До начала'],
  ['to-end', 'До конца']
]

const behaviorModes: Array<[CountdownMode, string]> = [
  ['timer', 'Таймер'],
  ['to-start', 'До начала мероприятия'],
  ['to-end', 'До конца мероприятия']
]

const SLOT_PLACES: Record<SceneSlot, string> = {
  topLeft: 'Левый верх',
  topCenter: 'Центр верх',
  topRight: 'Правый верх',
  bottomLeft: 'Левый низ',
  bottomCenter: 'Центр низ',
  bottomRight: 'Правый низ'
}

const SLOT_CHOICES: Array<[SlotContent, string]> = [
  ['clock', 'Время'],
  ['date', 'Дата'],
  ['schedule', 'Начало и конец'],
  ['remaining', 'До завершения'],
  ['cost', 'Перелимит'],
  ['empty', 'Пусто']
]

const TEXT_LABELS: Record<SceneTextKey, string> = {
  clock: 'Часы',
  date: 'Дата',
  schedule: 'Начало и конец',
  heading: 'Заголовок',
  time: 'Цифры таймера',
  event: 'Название мероприятия',
  remaining: 'До завершения',
  cost: 'Итого'
}

function blobUrl(mime: string, base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

function revokeSoundUrls(urls: { warning: string | null; finish: string | null }): void {
  if (urls.warning) URL.revokeObjectURL(urls.warning)
  if (urls.finish) URL.revokeObjectURL(urls.finish)
}

function SoundCard({
  title,
  label,
  ready,
  onPick,
  onPlay,
  onClear
}: {
  title: string
  label: string | null
  ready: boolean
  onPick: () => void
  onPlay: () => void
  onClear: () => void
}): JSX.Element {
  return (
    <div className="sound-card">
      <span>{title}</span>
      <div className="sound-name">{label || 'Файл не выбран'}</div>
      <div className="sound-actions">
        <button onClick={onPick}>Загрузить</button>
        <button disabled={!ready} onClick={onPlay}>Прослушать</button>
        <button disabled={!label} onClick={onClear}>Убрать</button>
      </div>
    </div>
  )
}

function HeadingField({
  label,
  value,
  onChange,
  onReset
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onReset: () => void
}): JSX.Element {
  return (
    <label>
      <span className="label-row">
        <span>{label}</span>
        <button type="button" className="link-button" onClick={onReset}>Авто</button>
      </span>
      <input
        value={value}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function BlockTextStyle({
  scale,
  weight,
  family,
  italic,
  onScale,
  onWeight,
  onFamily,
  onItalic,
  onReset
}: {
  scale: number
  weight: number
  family: TimerState['textStyles'][SceneTextKey]['family']
  italic: boolean
  onScale: (scale: number) => void
  onWeight: (weight: number) => void
  onFamily: (family: TimerState['textStyles'][SceneTextKey]['family']) => void
  onItalic: (italic: boolean) => void
  onReset: () => void
}): JSX.Element {
  const font = sceneFont(family)
  return (
    <>
      <p className="section-label">Оформление</p>
      <label>
        <span>Шрифт</span>
        <select value={font.id} onChange={(event) => onFamily(sceneFont(event.target.value).id)}>
          {SCENE_FONTS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      {font.italic && (
        <div className="field">
          <span>Начертание</span>
          <div className="segmented two">
            <button className={italic ? '' : 'active'} onClick={() => onItalic(false)}>Обычное</button>
            <button className={italic ? 'active' : ''} onClick={() => onItalic(true)}>Курсив</button>
          </div>
        </div>
      )}
      <label>
        <span>Размер</span>
        <div className="size-row">
          <input
            type="range"
            min={60}
            max={180}
            step={1}
            value={Math.round(scale * 100)}
            onChange={(event) => onScale(Number(event.target.value) / 100)}
          />
          <strong>{Math.round(scale * 100)}%</strong>
        </div>
      </label>
      <div className="field">
        <span>Толщина</span>
        <div className="weight-choices">
          {font.weights.map(([value, label]) => (
            <button
              key={value}
              className={weight === value ? 'active' : ''}
              onClick={() => onWeight(value)}
            >{label}</button>
          ))}
        </div>
      </div>
      <button type="button" className="link-button" onClick={onReset}>Сбросить</button>
      <p className="text-edit-hint">Соседние блоки сдвигаются вместе с размером и останавливаются у края экрана.</p>
    </>
  )
}

function PresetSlot({
  index,
  label,
  filled,
  onLoad,
  onSave,
  onRename,
  onDelete
}: {
  index: number
  label: string
  filled: boolean
  onLoad: () => void
  onSave: () => void
  onRename: (name: string) => void
  onDelete: () => void
}): JSX.Element {
  const holdRef = useRef<number | null>(null)
  const savedRef = useRef(false)
  const cancelledRef = useRef(false)
  const [holding, setHolding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const skipCommitRef = useRef(false)

  const cancelHold = (): void => {
    if (holdRef.current != null) {
      window.clearTimeout(holdRef.current)
      holdRef.current = null
    }
    setHolding(false)
  }

  const commitName = (): void => {
    onRename(draft)
    setEditing(false)
  }

  return (
    <div className="preset-row">
      {editing ? (
        <label className="preset-name">
          <b>{index + 1}</b>
          <input
            value={draft}
            maxLength={40}
            autoFocus
            aria-label={`Название пресета ${index + 1}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (skipCommitRef.current) {
                skipCommitRef.current = false
                return
              }
              commitName()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                skipCommitRef.current = true
                setEditing(false)
              }
            }}
          />
        </label>
      ) : (
        <button
          type="button"
          className={`preset-slot ${filled ? 'is-filled' : ''} ${holding ? 'is-holding' : ''}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            savedRef.current = false
            cancelledRef.current = false
            setHolding(true)
            holdRef.current = window.setTimeout(() => {
              holdRef.current = null
              savedRef.current = true
              setHolding(false)
              onSave()
            }, 600)
          }}
          onPointerUp={() => {
            const saved = savedRef.current
            const cancelled = cancelledRef.current
            cancelHold()
            savedRef.current = false
            cancelledRef.current = false
            if (!saved && !cancelled) onLoad()
          }}
          onPointerLeave={() => {
            if (holdRef.current != null) cancelledRef.current = true
            cancelHold()
          }}
          onPointerCancel={() => {
            cancelledRef.current = true
            cancelHold()
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <b>{index + 1}</b>
          <span>{label}</span>
        </button>
      )}
      <button
        type="button"
        className="preset-icon"
        title="Переименовать"
        aria-label={`Переименовать пресет ${index + 1}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (editing) {
            commitName()
            return
          }
          setDraft(label === 'Пусто' ? '' : label)
          setEditing(true)
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13.2 6.6l4.2 4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button type="button" className="preset-save" onClick={onSave}>Сохранить</button>
      <button
        type="button"
        className="preset-icon danger"
        title="Удалить пресет"
        aria-label={`Удалить пресет ${index + 1}`}
        disabled={!filled}
        onClick={onDelete}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 7V5h6v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

function choiceLabel(content: SlotContent): string {
  return SLOT_CHOICES.find(([value]) => value === content)?.[1] ?? 'Пусто'
}

function ShowMap({
  slots,
  slotShown,
  layoutEditing,
  openSlot,
  headingOn,
  nameOn,
  onOpen,
  onAssign,
  onToggleSlot,
  onToggle
}: {
  slots: SceneSlots
  slotShown: SceneSlotShown
  layoutEditing: boolean
  openSlot: SceneSlot | null
  headingOn: boolean
  nameOn: boolean
  onOpen: (slot: SceneSlot | null) => void
  onAssign: (slot: SceneSlot, content: SlotContent) => void
  onToggleSlot: (slot: SceneSlot) => void
  onToggle: (key: 'heading' | 'eventName') => void
}): JSX.Element {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const node = anchorRef.current
    if (!node || !openSlot) {
      setMenuBox(null)
      return
    }
    const rect = node.getBoundingClientRect()
    const height = 248
    const below = rect.bottom + 6
    const top = below + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : below
    setMenuBox({ top, left: rect.left, width: Math.max(rect.width, 168) })
  }, [openSlot])

  useEffect(() => {
    if (!openSlot) return
    const close = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('.show-slot.is-open, .show-menu')) return
      onOpen(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [openSlot, onOpen])

  const place = (slot: SceneSlot): JSX.Element => {
    const content = slots[slot] ?? 'empty'
    const shown = slotShown[slot] !== false
    const open = layoutEditing && openSlot === slot
    return (
      <button
        key={slot}
        type="button"
        ref={open ? anchorRef : undefined}
        className={`show-slot ${open ? 'is-open' : ''} ${shown ? 'is-on' : 'is-off'}`}
        onClick={() => {
          if (layoutEditing) onOpen(open ? null : slot)
          else onToggleSlot(slot)
        }}
      >
        <span>{SLOT_PLACES[slot]}</span>
        <strong>{choiceLabel(content)}</strong>
      </button>
    )
  }

  const fixed = (key: 'heading' | 'eventName', title: string, on: boolean): JSX.Element => (
    <button
      type="button"
      className={`show-fixed ${on ? 'is-on' : 'is-off'}`}
      onClick={() => { if (!layoutEditing) onToggle(key) }}
    >
      <span>{title}</span>
      <strong>{on ? 'На экране' : 'Скрыт'}</strong>
    </button>
  )

  return (
    <div className={`show-map ${layoutEditing ? 'is-editing' : ''}`}>
      {place('topLeft')}
      {place('topCenter')}
      {place('topRight')}
      <span />
      {fixed('heading', 'Заголовок', headingOn)}
      <span />
      <span />
      {fixed('eventName', 'Название', nameOn)}
      <span />
      {place('bottomLeft')}
      {place('bottomCenter')}
      {place('bottomRight')}
      {openSlot && menuBox && (
        <div className="show-menu" style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}>
          {SLOT_CHOICES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={slots[openSlot] === value ? 'active' : ''}
              onClick={() => onAssign(openSlot, value)}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function screensLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  const word = mod10 === 1 && mod100 !== 11
    ? 'экран'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'экрана'
      : 'экранов'
  return `${count} ${word}`
}

function cloneTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    headings: { ...timer.headings },
    slots: { ...(timer.slots ?? DEFAULT_SCENE_SLOTS) },
    slotShown: { ...(timer.slotShown ?? DEFAULT_SLOT_SHOWN) },
    visibility: { ...timer.visibility },
    allowNegative: { ...timer.allowNegative },
    warning: { ...timer.warning },
    blink: { ...(timer.blink ?? DEFAULT_TIMER.blink) },
    blinkSeconds: { ...(timer.blinkSeconds ?? DEFAULT_TIMER.blinkSeconds) },
    textStyles: {
      clock: { ...timer.textStyles.clock },
      date: { ...(timer.textStyles.date ?? { scale: 1, weight: 300, family: 'sb-sans', italic: false }) },
      schedule: { ...timer.textStyles.schedule },
      heading: { ...timer.textStyles.heading },
      time: { ...timer.textStyles.time },
      event: { ...timer.textStyles.event },
      remaining: { ...timer.textStyles.remaining },
      cost: { ...timer.textStyles.cost }
    }
  }
}

function clampInterval(value: number): number {
  return Math.min(3600, Math.max(1, Math.round(value)))
}

function displayName(display: DisplayInfo, index: number): string {
  const suffix = `${display.width}×${display.height}`
  if (display.isPrimary) return `Дисплей ${index} · основной · ${suffix}`
  return `Дисплей ${index} · ${display.label} · ${suffix}`
}

export function TimerControl(): JSX.Element {
  const [timer, setTimerState] = useState<TimerState>(() => cloneTimer(DEFAULT_TIMER))
  const [liveTimer, setLiveTimerState] = useState<TimerState | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplayIds, setSelectedDisplayIds] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [liveControl, setLiveControl] = useState(false)
  const [status, setStatus] = useState('Получение списка экранов…')
  const [editingTime, setEditingTime] = useState(false)
  const [timePartsDirty, setTimePartsDirty] = useState(false)
  const [timeParts, setTimeParts] = useState<TimeParts>(() => timePartsFromSeconds(DEFAULT_TIMER.remaining))
  const [screenEditing, setScreenEditing] = useState(false)
  const [openSlot, setOpenSlot] = useState<SceneSlot | null>(null)
  const [selectedText, setSelectedText] = useState<SceneTextKey | null>(null)
  const [presets, setPresets] = useState<ScreenPreset[]>(() => (
    Array.from({ length: PRESET_SLOT_COUNT }, () => ({ name: '', config: null }))
  ))
  const [presetNote, setPresetNote] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(true)
  const [soundsOpen, setSoundsOpen] = useState(false)
  const [costOpen, setCostOpen] = useState(false)
  const [lookOpen, setLookOpen] = useState(false)
  const [soundUrls, setSoundUrls] = useState<{ warning: string | null; finish: string | null }>({ warning: null, finish: null })
  const [soundMessage, setSoundMessage] = useState('')
  const elementEditorRef = useRef<HTMLDivElement>(null)
  const savedPayload = useRef('')
  const timerRef = useRef(timer)
  const liveRef = useRef(liveTimer)
  const soundUrlsRef = useRef(soundUrls)
  const cueRef = useRef<Record<CountdownMode, CueState>>({
    timer: seedCue(null),
    'to-start': seedCue(null),
    'to-end': seedCue(null)
  })
  const playSoundRef = useRef<(slot: CueSlot) => void>(() => {})
  const setTimer = (update: TimerState | ((current: TimerState) => TimerState)): void => {
    const next = typeof update === 'function' ? update(timerRef.current) : update
    timerRef.current = next
    setTimerState(next)
  }
  const setLiveTimer = (
    update: TimerState | null | ((current: TimerState | null) => TimerState | null)
  ): void => {
    const next = typeof update === 'function' ? update(liveRef.current) : update
    liveRef.current = next
    setLiveTimerState(next)
  }
  playSoundRef.current = (slot) => {
    const url = soundUrlsRef.current[slot]
    if (!url) return
    const audio = new Audio(url)
    void audio.play().catch(() => {})
  }

  const isLive = liveTimer !== null

  const refreshDisplays = useCallback(async (preferred?: number[]) => {
    const nextDisplays = await window.timerPlus.listDisplays()
    setDisplays(nextDisplays)
    setSelectedDisplayIds((current) => {
      const source = preferred ?? current
      const available = new Set(nextDisplays.map((display) => display.id))
      const valid = source.filter((id) => available.has(id))
      if (valid.length) return valid
      const fallback = nextDisplays.find((display) => !display.isPrimary) || nextDisplays[0]
      return fallback ? [fallback.id] : []
    })
    setStatus(nextDisplays.length ? `Найдено экранов: ${nextDisplays.length}` : 'Экраны не найдены')
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const restored = normalizeSettings(await window.timerPlus.loadSettings())
      if (!active) return
      setTimer(restored.timer)
      setPresets(restored.presets)
      setTimeParts(timePartsFromSeconds(restored.timer.remaining))
      await refreshDisplays(restored.selectedDisplayIds)
      if (active) setReady(true)
    })()
    const unsubscribe = window.timerPlus.onDisplaysChanged((nextDisplays) => {
      setDisplays(nextDisplays)
      setSelectedDisplayIds((current) => {
        const available = new Set(nextDisplays.map((display) => display.id))
        const valid = current.filter((id) => available.has(id))
        if (valid.length || !nextDisplays.length) return valid
        const fallback = nextDisplays.find((display) => !display.isPrimary) || nextDisplays[0]
        return fallback ? [fallback.id] : []
      })
      setStatus(`Список экранов обновлён: ${nextDisplays.length}`)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [refreshDisplays])

  useEffect(() => {
    if (!ready) return
    const settings: TimerSettings = {
      timer: {
        ...cloneTimer(timer),
        running: false,
        live: false,
        scheduleOvertimeElapsed: 0,
        timerOvertimeElapsed: 0
      },
      selectedDisplayIds,
      presets
    }
    const key = JSON.stringify(settings)
    if (key === savedPayload.current) return
    savedPayload.current = key
    window.timerPlus.saveSettings(settings)
  }, [ready, selectedDisplayIds, timer, presets])

  useEffect(() => {
    soundUrlsRef.current = soundUrls
  }, [soundUrls])

  useEffect(() => {
    let cancelled = false
    const previous = soundUrlsRef.current
    void (async () => {
      const next = { warning: null as string | null, finish: null as string | null }
      const files = [
        ['warning', timer.warningSoundFile],
        ['finish', timer.finishSoundFile]
      ] as const
      for (const [slot, fileName] of files) {
        if (!fileName) continue
        const payload = await window.timerPlus.readSound(fileName)
        if (payload) next[slot] = blobUrl(payload.mime, payload.base64)
      }
      if (cancelled) {
        revokeSoundUrls(next)
        return
      }
      revokeSoundUrls(previous)
      soundUrlsRef.current = next
      setSoundUrls(next)
    })()
    return () => {
      cancelled = true
    }
  }, [timer.warningSoundFile, timer.finishSoundFile])

  useEffect(() => {
    if (!ready) return
    const now = new Date()
    const state = liveRef.current ?? timerRef.current
    cueRef.current = {
      timer: seedCue(state.remaining),
      'to-start': seedCue(secondsUntilTime(now, state.startTime)),
      'to-end': seedCue(secondsUntilTime(now, state.endTime))
    }
    const interval = window.setInterval(() => {
      const tickNow = new Date()
      const before = timerRef.current
      const liveBefore = liveRef.current
      const next = advanceTimer(before, tickNow, before.running)
      if (next !== before) setTimer(next)
      const liveNext = liveBefore ? advanceTimer(liveBefore, tickNow, liveBefore.running) : null
      if (liveBefore && liveNext && liveNext !== liveBefore) setLiveTimer(liveNext)
      const source = liveNext ?? next
      const sourceBefore = liveBefore ?? before
      const stoppedAtZero = !source.running
        && sourceBefore.running
        && sourceBefore.remaining > 0
        && source.remaining <= 0
      const samples: Array<[CountdownMode, number | null, boolean, boolean]> = [
        ['timer', source.remaining, source.warning.timer, source.running || stoppedAtZero],
        ['to-start', secondsUntilTime(tickNow, source.startTime), source.warning['to-start'], true],
        ['to-end', secondsUntilTime(tickNow, source.endTime), source.warning['to-end'], true]
      ]
      let chosen: CueSlot | null = null
      for (const [mode, seconds, enabled, announce] of samples) {
        const result = consumeCue(cueRef.current[mode], seconds, enabled, announce)
        const fileName = result.play === 'warning'
          ? source.warningSoundFile
          : result.play === 'finish'
            ? source.finishSoundFile
            : null
        if (result.play && fileName && !soundUrlsRef.current[result.play]) continue
        cueRef.current[mode] = result.state
        if (result.play === 'finish') chosen = 'finish'
        else if (result.play === 'warning' && chosen !== 'finish') chosen = 'warning'
      }
      if (chosen) playSoundRef.current(chosen)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [ready])

  useEffect(() => {
    if (!ready || timer.running || liveTimer?.running) return
    const result = consumeCue(cueRef.current.timer, timer.remaining, timer.warning.timer, false)
    cueRef.current.timer = result.state
  }, [ready, timer.remaining, timer.running, timer.warning.timer, liveTimer?.running])

  useEffect(() => {
    if (liveTimer) window.timerPlus.updateLive(liveTimer)
  }, [liveTimer])

  useEffect(() => {
    if (!editingTime) setTimeParts(timePartsFromSeconds(timer.remaining))
  }, [editingTime, timer.remaining])

  const savePreset = (index: number): void => {
    const config = screenConfigFromTimer(timer)
    setPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index ? { ...preset, config } : preset
    )))
    const note = `Экран сохранён в пресет ${index + 1}`
    setPresetNote(note)
    setStatus(note)
  }

  const loadPreset = (index: number): void => {
    const config = presets[index]?.config
    if (!config) {
      const note = `Пресет ${index + 1} пуст`
      setPresetNote(note)
      setStatus(note)
      return
    }
    updateDraft(screenConfigFromTimer({ ...timer, ...config }))
    const note = `${presets[index]?.name.trim() || `Пресет ${index + 1}`} загружен`
    setPresetNote(note)
    setStatus(note)
  }

  const renamePreset = (index: number, name: string): void => {
    const trimmed = name.trim().slice(0, 40)
    setPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index ? { ...preset, name: trimmed } : preset
    )))
    const note = trimmed ? `Пресет ${index + 1}: ${trimmed}` : `Название пресета ${index + 1} сброшено`
    setPresetNote(note)
    setStatus(note)
  }

  const deletePreset = (index: number): void => {
    setPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index ? { name: '', config: null } : preset
    )))
    const note = `Пресет ${index + 1} удалён`
    setPresetNote(note)
    setStatus(note)
  }

  const updateDraft = (update: Partial<TimerState>): void => {
    setTimer((current) => ({
      ...current,
      ...update,
      headings: update.headings ? { ...current.headings, ...update.headings } : current.headings,
      visibility: update.visibility ? { ...current.visibility, ...update.visibility } : current.visibility,
      allowNegative: update.allowNegative ? { ...current.allowNegative, ...update.allowNegative } : current.allowNegative,
      warning: update.warning ? { ...current.warning, ...update.warning } : current.warning,
      blink: update.blink ? { ...(current.blink ?? DEFAULT_TIMER.blink), ...update.blink } : current.blink,
      blinkSeconds: update.blinkSeconds
        ? { ...(current.blinkSeconds ?? DEFAULT_TIMER.blinkSeconds), ...update.blinkSeconds }
        : current.blinkSeconds,
      textStyles: update.textStyles ? { ...current.textStyles, ...update.textStyles } : current.textStyles
    }))
    if (isLive) setDirty(true)
  }

  const updateTimerControl = (
    update: Partial<Pick<TimerState, 'duration' | 'remaining' | 'running'>>,
    options?: { keepCost?: boolean }
  ): void => {
    const apply = (current: TimerState): TimerState => {
      if (options?.keepCost) {
        return {
          ...current,
          ...update,
          overtimeCostTotal: current.overtimeCostTotal,
          timerOvertimeElapsed: 0
        }
      }
      if (update.remaining == null || update.remaining === current.remaining) return { ...current, ...update }
      const cost = retargetTimerCost(current, update.remaining)
      return {
        ...current,
        ...update,
        overtimeCostTotal: cost.overtimeCostTotal,
        timerOvertimeElapsed: cost.timerOvertimeElapsed
      }
    }
    setTimer(apply)
    if (isLive && liveControl) {
      setLiveTimer((current) => current ? apply(current) : current)
    } else if (isLive) {
      setDirty(true)
    }
  }

  const airPayload = (): { output: TimerState; pausedTimer: boolean } => {
    const output = { ...cloneTimer(timer), live: true }
    const pausedTimer = output.centralTimeMode !== 'timer' && output.running
    if (pausedTimer) output.running = false
    return { output, pausedTimer }
  }

  const publish = async (): Promise<void> => {
    if (!selectedDisplayIds.length) {
      setStatus('Выберите хотя бы один экран для эфира')
      return
    }
    const { output, pausedTimer } = airPayload()
    await window.timerPlus.goLive(selectedDisplayIds, output)
    setTimer((current) => ({ ...current, live: true, running: pausedTimer ? false : current.running }))
    setLiveTimer(output)
    setDirty(false)
    setLiveControl(false)
    setStatus(pausedTimer
      ? `Таймер в эфире на экранах: ${selectedDisplayIds.length}. Таймер на паузе`
      : `Таймер в эфире на экранах: ${selectedDisplayIds.length}`)
  }

  const updateOutput = async (): Promise<void> => {
    if (!selectedDisplayIds.length) {
      setStatus('Выберите хотя бы один экран для эфира')
      return
    }
    const { output, pausedTimer } = airPayload()
    await window.timerPlus.goLive(selectedDisplayIds, output)
    if (pausedTimer) setTimer((current) => ({ ...current, running: false }))
    setLiveTimer(output)
    setDirty(false)
    setStatus(pausedTimer ? 'Эфир обновлён. Таймер на паузе' : 'Эфир обновлён')
  }

  const stopOutput = async (): Promise<void> => {
    await window.timerPlus.stopLive()
    setLiveTimer(null)
    setTimer((current) => ({ ...current, live: false }))
    setDirty(false)
    setLiveControl(false)
    setStatus('Таймер убран из эфира')
  }

  useEffect(() => {
    if (!screenEditing || !selectedText) return
    elementEditorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [screenEditing, selectedText])

  const setTextStyle = (key: SceneTextKey, patch: Partial<TimerState['textStyles'][SceneTextKey]>): void => {
    updateDraft({
      textStyles: {
        ...timer.textStyles,
        [key]: { ...timer.textStyles[key], ...patch }
      }
    })
  }

  const slotsNow = (): SceneSlots => ({ ...(timer.slots ?? DEFAULT_SCENE_SLOTS) })
  const shownNow = (): SceneSlotShown => ({ ...(timer.slotShown ?? DEFAULT_SLOT_SHOWN) })

  const visibilityFor = (slots: SceneSlots, slotShown: SceneSlotShown): TimerVisibility => {
    const active = new Set(SCENE_SLOT_ORDER.filter((key) => slotShown[key]).map((key) => slots[key]))
    return {
      ...timer.visibility,
      clock: active.has('clock'),
      schedule: active.has('schedule'),
      remaining: active.has('remaining'),
      cost: active.has('cost')
    }
  }

  const toggleSlot = (slot: SceneSlot): void => {
    const slots = slotsNow()
    const slotShown = shownNow()
    slotShown[slot] = !slotShown[slot]
    updateDraft({ slotShown, visibility: visibilityFor(slots, slotShown) })
  }

  const assignSlot = (slot: SceneSlot, content: SlotContent): void => {
    const next = slotsNow()
    const slotShown = shownNow()
    if (content !== 'empty') {
      for (const key of SCENE_SLOT_ORDER) {
        if (key !== slot && next[key] === content) {
          const displaced = next[slot]
          next[key] = displaced
          slotShown[key] = displaced !== 'empty'
        }
      }
    }
    next[slot] = content
    slotShown[slot] = content !== 'empty'
    updateDraft({
      slots: next,
      slotShown,
      visibility: visibilityFor(next, slotShown)
    })
    setOpenSlot(null)
  }

  const selectMode = (mode: TimerCentralMode): void => {
    updateDraft({ centralTimeMode: mode })
  }

  const setModeFlag = (key: 'allowNegative' | 'warning', mode: CountdownMode, enabled: boolean): void => {
    setTimer((current) => {
      const next: TimerState = {
        ...current,
        [key]: { ...current[key], [mode]: enabled }
      }
      if (key === 'allowNegative' && mode === 'timer' && !enabled && current.remaining < 0) {
        const cost = retargetTimerCost(current, 0)
        next.remaining = 0
        next.running = false
        next.overtimeCostTotal = cost.overtimeCostTotal
        next.timerOvertimeElapsed = cost.timerOvertimeElapsed
      }
      return next
    })
    if (isLive) setDirty(true)
  }

  const pickSound = async (slot: SoundSlot): Promise<void> => {
    const result = await window.timerPlus.pickSound(slot)
    if (result.ok) {
      setSoundMessage('')
      updateDraft(slot === 'warning'
        ? { warningSoundFile: result.fileName, warningSoundLabel: result.label }
        : { finishSoundFile: result.fileName, finishSoundLabel: result.label })
      return
    }
    if (result.reason === 'too-large') setSoundMessage('Файл больше 20 МБ')
    else if (result.reason === 'failed') setSoundMessage('Не удалось прочитать файл')
  }

  const clearSound = async (slot: SoundSlot): Promise<void> => {
    await window.timerPlus.clearSound(slot)
    setSoundMessage('')
    updateDraft(slot === 'warning'
      ? { warningSoundFile: null, warningSoundLabel: null }
      : { finishSoundFile: null, finishSoundLabel: null })
  }

  const previewSound = (slot: SoundSlot): void => {
    setSoundMessage(soundUrls[slot] ? '' : 'Сначала загрузите файл')
    playSoundRef.current(slot)
  }

  const updateSchedule = (field: 'startTime' | 'endTime', value: string): void => {
    updateDraft({ [field]: value })
  }

  const commitTime = (): void => {
    if (!timePartsDirty) {
      setTimeParts(timePartsFromSeconds(timer.remaining))
      setEditingTime(false)
      return
    }
    const seconds = secondsFromTimeParts(timeParts)
    updateTimerControl({ duration: seconds, remaining: seconds, running: false })
    setTimeParts(timePartsFromSeconds(seconds))
    setEditingTime(false)
    setTimePartsDirty(false)
  }

  const adjustMinutes = (minutes: number): void => {
    const delta = minutes * 60
    updateTimerControl({
      duration: Math.max(0, timer.duration + delta),
      remaining: timer.remaining + delta
    })
  }

  const restoreTimerFromLive = (): void => {
    if (!liveTimer) return
    const nextTimer = {
      ...timer,
      duration: liveTimer.duration,
      remaining: liveTimer.remaining,
      running: liveTimer.running
    }
    setTimer(nextTimer)
    setTimeParts(timePartsFromSeconds(liveTimer.remaining))
    setEditingTime(false)
    setTimePartsDirty(false)
    setDirty(JSON.stringify(nextTimer) !== JSON.stringify(liveTimer))
  }

  const restartTimer = (): void => {
    const seconds = timePartsDirty ? secondsFromTimeParts(timeParts) : timer.duration
    updateTimerControl({ duration: seconds, remaining: seconds, running: true })
    setTimeParts(timePartsFromSeconds(seconds))
    setEditingTime(false)
    setTimePartsDirty(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      event.preventDefault()
      updateTimerControl({ running: !timer.running })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isLive, liveControl, timer.running])

  const setOvertimeMode = (overtimeMode: TimerState['overtimeMode']): void => {
    setTimer((current) => ({ ...current, overtimeMode, scheduleOvertimeElapsed: 0, timerOvertimeElapsed: 0 }))
    if (isLive) {
      setLiveTimer((current) => current
        ? { ...current, overtimeMode, scheduleOvertimeElapsed: 0, timerOvertimeElapsed: 0 }
        : current)
    }
  }

  const displayRows = useMemo(() => displays.map((display, index) => ({
    display,
    name: displayName(display, index)
  })), [displays])

  const syncLabel = !isLive ? 'Не в эфире' : dirty ? 'Есть изменения' : 'Синхронно с эфиром'
  const footerStatus = !isLive ? 'Эфир не запущен' : dirty ? 'Нужно обновить эфир' : 'Эфир актуален'
  const lookMode = timer.backgroundImage ? 'image' : timer.backgroundMode
  const activeCountdown = behaviorModes.find(([mode]) => mode === timer.centralTimeMode) ?? null
  const deckPhase = digitPhase(timer.remaining, timer.allowNegative.timer, timer.warning.timer)
  const colorVars = {
    ['--warning-color' as string]: timer.warningColor,
    ['--overtime-color' as string]: timer.overtimeColor
  }

  const chooseBackgroundImage = async (): Promise<void> => {
    const image = await window.timerPlus.selectBackground()
    if (image) updateDraft({ backgroundImage: image })
  }

  const timerDeck = (
    <div className="timer-deck">
      <div className="timer-main">
        <div className={`time-editor ${deckPhase === 'warning' ? 'is-warning' : ''} ${deckPhase === 'overtime' ? 'is-overtime' : ''}`}>
          {timer.remaining < 0 && <span className="time-sign">−</span>}
          {(['hours', 'minutes', 'seconds'] as TimePart[]).map((part, index) => (
            <div className="time-part" key={part}>
              {index > 0 && <b>:</b>}
              <input
                aria-label={part === 'hours' ? 'Часы' : part === 'minutes' ? 'Минуты' : 'Секунды'}
                inputMode="numeric"
                maxLength={2}
                value={timeParts[part]}
                onFocus={(event) => {
                  setEditingTime(true)
                  setTimePartsDirty(false)
                  event.currentTarget.select()
                }}
                onChange={(event) => {
                  if (!timePartsDirty && timer.running) updateTimerControl({ running: false })
                  setTimePartsDirty(true)
                  setTimeParts((current) => ({ ...current, [part]: normalizeTimePart(part, event.target.value) }))
                }}
                onBlur={commitTime}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
              />
            </div>
          ))}
        </div>
        <div className="transport">
          <button className="pause" title="Пауза" onClick={() => updateTimerControl({ running: false })}>Ⅱ</button>
          <button className={`play ${timer.running ? 'active' : ''}`} title="Старт" onClick={() => updateTimerControl({ running: true })}>▶</button>
          <button className="stop" title="Стоп и сброс" onClick={() => updateTimerControl({ running: false, remaining: timer.duration }, { keepCost: true })}>■</button>
          <button className="refresh" title="Запустить заново с набранного времени" aria-label="Рефреш" onClick={restartTimer}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M20.5 3.5V8H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            disabled={!isLive}
            className={`live-control ${liveControl ? 'active' : ''}`}
            title={isLive ? 'Применять команды управления временем к эфиру немедленно' : 'Сначала отправьте таймер в эфир'}
            onClick={() => setLiveControl((value) => !value)}
          >Live</button>
        </div>
      </div>
      <div className="adjust-grid">
        {[-10, -5, -1, 0, 1, 5, 10].map((minutes) => (
          <button
            key={minutes}
            disabled={minutes === 0 && !liveTimer}
            className={minutes < 0 ? 'minus' : minutes > 0 ? 'plus' : 'now'}
            onClick={() => minutes === 0 ? restoreTimerFromLive() : adjustMinutes(minutes)}
            title={minutes === 0
              ? liveTimer
                ? 'Вернуть в превью время и состояние таймера, которые сейчас идут в эфире'
                : 'Сначала отправьте таймер в эфир'
              : 'Сдвиг времени в минутах'}
          >{minutes === 0 ? 'Сейчас' : `${minutes > 0 ? '+' : ''}${minutes}`}</button>
        ))}
      </div>
      <p className="time-hint">Сдвиг времени в минутах. Пробел — пауза/пуск.</p>
    </div>
  )

  if (!ready) {
    return <div className="loading"><div className="spinner" /><div>EventTimer запускается…</div></div>
  }

  return (
    <main className="control-app" data-layout="expanded" style={colorVars}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <img src={appIcon} alt="" />
          </div>
          <div>
            <h1>EventTimer</h1>
            <p>Таймер мероприятия</p>
          </div>
        </div>
        <div className="display-picker">
          <div className="display-list">
            {displayRows.map(({ display, name }, index) => {
              const selected = selectedDisplayIds.includes(display.id)
              return (
                <button
                  key={display.id}
                  className={`display-chip ${selected ? 'selected' : ''}`}
                  title={name}
                  onClick={() => {
                    setSelectedDisplayIds((current) => selected
                      ? current.filter((id) => id !== display.id)
                      : [...current, display.id])
                    if (isLive) setDirty(true)
                  }}
                >
                  <span className="display-check">{selected ? '✓' : ''}</span>
                  {`Дисплей ${index}, ${display.width}×${display.height}`}
                </button>
              )
            })}
          </div>
        </div>
        <div className="header-side">
          <div className={`live-badge ${isLive ? 'on' : ''}`}>
            <span />{isLive ? `В эфире · ${screensLabel(selectedDisplayIds.length)}` : 'Не в эфире'}
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="panel stage-column">
          <div className="preview-head">
            <span>Превью эфира</span>
            <span className={isLive && !dirty ? 'sync on' : 'sync'}>{syncLabel}</span>
          </div>
          <div className={`preview-frame ${screenEditing ? 'editing' : ''}`}>
            <EventTimerScene
              timer={timer}
              textEditing={screenEditing}
              selectedText={screenEditing ? selectedText : null}
              onSelectText={screenEditing ? setSelectedText : undefined}
            />
          </div>
          {timerDeck}
        </section>

          <aside className="panel settings-column">
            <div className="settings-stack">
              <div className={`settings-card ${displayOpen ? '' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="card-toggle"
                  aria-expanded={displayOpen}
                  onClick={() => {
                    setDisplayOpen((open) => {
                      if (open) {
                        setScreenEditing(false)
                        setSelectedText(null)
                        setOpenSlot(null)
                      }
                      return !open
                    })
                  }}
                >
                  <span className="card-title">Редактировать отображение</span>
                  <span className="card-toggle-meta">
                    {modeOptions.find(([mode]) => mode === timer.centralTimeMode)?.[1]}
                  </span>
                  <span className={`card-chevron ${displayOpen ? 'is-open' : ''}`} aria-hidden="true" />
                </button>
                {displayOpen && <>
                <button
                  className={`text-edit-toggle ${screenEditing ? 'active' : ''}`}
                  onClick={() => {
                    setScreenEditing((value) => !value)
                    setSelectedText(null)
                    setOpenSlot(null)
                  }}
                >
                  {screenEditing ? 'Завершить редактирование' : 'Редактировать отображение'}
                </button>
                {screenEditing && selectedText ? (
                  <div className="element-editor" ref={elementEditorRef}>
                    <p className="card-title">{TEXT_LABELS[selectedText]}</p>
                    {selectedText === 'clock' && (
                      <p className="text-edit-hint">Это время компьютера. Меняется само.</p>
                    )}
                    {selectedText === 'schedule' && (
                      <div className="split-fields">
                        <label>
                          <span>Начало</span>
                          <input type="time" value={timer.startTime} onChange={(event) => updateSchedule('startTime', event.target.value)} />
                        </label>
                        <label>
                          <span>Конец</span>
                          <input type="time" value={timer.endTime} onChange={(event) => updateSchedule('endTime', event.target.value)} />
                        </label>
                      </div>
                    )}
                    {selectedText === 'heading' && (
                      <>
                        <HeadingField
                          label={timer.centralTimeMode === 'current' ? 'Заголовок времени' : 'Заголовок'}
                          value={timer.headings[timer.centralTimeMode]}
                          onChange={(value) => updateDraft({ headings: { ...timer.headings, [timer.centralTimeMode]: value } })}
                          onReset={() => updateDraft({ headings: { ...timer.headings, [timer.centralTimeMode]: defaultHeading(timer.centralTimeMode) } })}
                        />
                        {timer.centralTimeMode === 'to-start' && (
                          <p className="text-edit-hint">После начала на экране будет «Мероприятие началось».</p>
                        )}
                      </>
                    )}
                    {selectedText === 'time' && (
                      <>
                        {!timer.visibility.heading && (
                          <HeadingField
                            label={timer.centralTimeMode === 'current' ? 'Заголовок времени' : 'Заголовок'}
                            value={timer.headings[timer.centralTimeMode]}
                            onChange={(value) => updateDraft({ headings: { ...timer.headings, [timer.centralTimeMode]: value } })}
                            onReset={() => updateDraft({ headings: { ...timer.headings, [timer.centralTimeMode]: defaultHeading(timer.centralTimeMode) } })}
                          />
                        )}
                        <div className="look-grid">
                          <label className="swatch">
                            <span>Цвет предупреждения</span>
                            <input type="color" value={timer.warningColor} onChange={(event) => updateDraft({ warningColor: event.target.value })} />
                          </label>
                          <label className="swatch">
                            <span>Цвет минуса</span>
                            <input type="color" value={timer.overtimeColor} onChange={(event) => updateDraft({ overtimeColor: event.target.value })} />
                          </label>
                        </div>
                      </>
                    )}
                    {selectedText === 'event' && (
                      <label>
                        <span>Название мероприятия</span>
                        <input
                          value={timer.eventName}
                          maxLength={120}
                          onChange={(event) => updateDraft({ eventName: event.target.value })}
                        />
                      </label>
                    )}
                    {selectedText === 'remaining' && (
                      <label>
                        <span>Подпись до конца</span>
                        <input
                          value={timer.remainingLabel ?? 'До завершения'}
                          maxLength={40}
                          placeholder="До завершения"
                          onChange={(event) => updateDraft({ remainingLabel: event.target.value })}
                        />
                      </label>
                    )}
                    {selectedText === 'cost' && (
                      <>
                        <label>
                          <span>Подпись стоимости</span>
                          <input
                            value={timer.costLabel ?? 'Итого'}
                            maxLength={40}
                            placeholder="Итого"
                            onChange={(event) => updateDraft({ costLabel: event.target.value })}
                          />
                        </label>
                        <p className="text-edit-hint">Ставки и что считать — в блоке «Стоимость» ниже.</p>
                      </>
                    )}
                    <BlockTextStyle
                      scale={timer.textStyles[selectedText]?.scale ?? 1}
                      weight={timer.textStyles[selectedText]?.weight ?? 300}
                      family={timer.textStyles[selectedText]?.family ?? 'sb-sans'}
                      italic={timer.textStyles[selectedText]?.italic ?? false}
                      onScale={(scale) => setTextStyle(selectedText, { scale })}
                      onWeight={(weight) => setTextStyle(selectedText, { weight })}
                      onFamily={(family) => {
                        const spec = sceneFont(family)
                        const current = timer.textStyles[selectedText]
                        setTextStyle(selectedText, {
                          family,
                          italic: spec.italic && Boolean(current?.italic),
                          weight: nearestFontWeight(current?.weight ?? 300, spec.weights)
                        })
                      }}
                      onItalic={(italic) => setTextStyle(selectedText, { italic })}
                      onReset={() => setTextStyle(selectedText, { scale: 1, weight: 300, family: 'sb-sans', italic: false })}
                    />
                  </div>
                ) : null}
                <p className="section-label">Что показывают часы</p>
                <div className="segmented mode-grid">
                  {modeOptions.map(([mode, label]) => (
                    <button
                      key={mode}
                      className={timer.centralTimeMode === mode ? 'active' : ''}
                      onClick={() => selectMode(mode)}
                    >{label}</button>
                  ))}
                </div>
                {activeCountdown && (
                  <div className="visibility-grid">
                    <button
                      className={timer.allowNegative[activeCountdown[0]] ? 'active' : ''}
                      onClick={() => setModeFlag('allowNegative', activeCountdown[0], !timer.allowNegative[activeCountdown[0]])}
                    >
                      <i />Уходить в минус
                    </button>
                    <button
                      className={timer.warning[activeCountdown[0]] ? 'active' : ''}
                      onClick={() => setModeFlag('warning', activeCountdown[0], !timer.warning[activeCountdown[0]])}
                    >
                      <i />Предупреждение
                    </button>
                  </div>
                )}
                {activeCountdown && (
                  <div className="blink-row">
                    <button
                      className={(timer.blink ?? DEFAULT_TIMER.blink)[activeCountdown[0]] ? 'active' : ''}
                      onClick={() => {
                        const mode = activeCountdown[0]
                        const blink = { ...(timer.blink ?? DEFAULT_TIMER.blink) }
                        updateDraft({ blink: { ...blink, [mode]: !blink[mode] } })
                      }}
                    >
                      <i />Мигание
                    </button>
                    <label>
                      <span>Секунд до нуля</span>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        value={(timer.blinkSeconds ?? DEFAULT_TIMER.blinkSeconds)[activeCountdown[0]]}
                        onChange={(event) => {
                          const parsed = Number(event.target.value)
                          if (!Number.isFinite(parsed)) return
                          const mode = activeCountdown[0]
                          updateDraft({
                            blinkSeconds: {
                              ...(timer.blinkSeconds ?? DEFAULT_TIMER.blinkSeconds),
                              [mode]: Math.min(3600, Math.max(1, Math.round(parsed)))
                            }
                          })
                        }}
                      />
                    </label>
                  </div>
                )}
                <ShowMap
                  slots={timer.slots ?? DEFAULT_SCENE_SLOTS}
                  slotShown={timer.slotShown ?? DEFAULT_SLOT_SHOWN}
                  layoutEditing={screenEditing}
                  openSlot={openSlot}
                  headingOn={timer.visibility.heading}
                  nameOn={timer.visibility.eventName}
                  onOpen={setOpenSlot}
                  onAssign={assignSlot}
                  onToggleSlot={toggleSlot}
                  onToggle={(key) => updateDraft({ visibility: { ...timer.visibility, [key]: !timer.visibility[key] } })}
                />
                <p className="text-edit-hint">
                  {screenEditing
                    ? 'Нажмите блок схемы и выберите, что показывать. На превью нажмите элемент, чтобы изменить текст и шрифт.'
                    : 'Нажмите блок, чтобы скрыть или показать его. Рамка значит, что он на экране.'}
                </p>
                <p className="section-label">Перелимит</p>
                <div className="visibility-grid stack">
                  <button
                    className={timer.costOvertimeRed !== false ? 'active' : ''}
                    onClick={() => updateDraft({ costOvertimeRed: timer.costOvertimeRed === false })}
                  >
                    <i />Деньги красным
                  </button>
                  <button
                    className={timer.remainingOvertimeRed !== false ? 'active' : ''}
                    onClick={() => updateDraft({ remainingOvertimeRed: timer.remainingOvertimeRed === false })}
                  >
                    <i />До завершения красным
                  </button>
                </div>
                <p className="text-edit-hint">Деньги остаются красными, пока сумма не сброшена. До завершения краснеет целиком, пока мероприятие идёт после конца. Выключенная кнопка оставляет блок белым.</p>
                </>}
              </div>

              <div className={`settings-card ${soundsOpen ? '' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="card-toggle"
                  aria-expanded={soundsOpen}
                  onClick={() => setSoundsOpen((open) => !open)}
                >
                  <span className="card-title">Звуки</span>
                  <span className="card-toggle-meta">
                    {[timer.warningSoundLabel, timer.finishSoundLabel].filter(Boolean).length} из 2
                  </span>
                  <span className={`card-chevron ${soundsOpen ? 'is-open' : ''}`} aria-hidden="true" />
                </button>
                {soundsOpen && <>
                <SoundCard
                  title="За 1 минуту"
                  label={timer.warningSoundLabel}
                  ready={Boolean(soundUrls.warning)}
                  onPick={() => void pickSound('warning')}
                  onPlay={() => previewSound('warning')}
                  onClear={() => void clearSound('warning')}
                />
                <SoundCard
                  title="На нуле"
                  label={timer.finishSoundLabel}
                  ready={Boolean(soundUrls.finish)}
                  onPick={() => void pickSound('finish')}
                  onPlay={() => previewSound('finish')}
                  onClear={() => void clearSound('finish')}
                />
                {soundMessage && <p className="text-edit-hint">{soundMessage}</p>}
                <p className="text-edit-hint">
                  Предупреждение включает цвет и звук за минуту до нуля. На нуле второй звук играет всегда, если файл загружен. Без «Уходить в минус» цифры останавливаются на 00:00:00.
                </p>
                </>}
              </div>

              <div className={`settings-card ${costOpen ? '' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="card-toggle"
                  aria-expanded={costOpen}
                  onClick={() => setCostOpen((open) => !open)}
                >
                  <span className="card-title">Стоимость</span>
                  <span className="card-toggle-meta">
                    {timer.overtimeMode === 'timer' ? 'Таймер' : timer.overtimeMode === 'both' ? 'Таймер и время' : 'По времени'}
                  </span>
                  <span className={`card-chevron ${costOpen ? 'is-open' : ''}`} aria-hidden="true" />
                </button>
                {costOpen && <>
                <label>
                  <span>Перелимит по времени мероприятия</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={timer.scheduleCostPerMinute || ''}
                    placeholder="0"
                    onChange={(event) => updateDraft({ scheduleCostPerMinute: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <label>
                  <span>Перелимит по таймеру</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={timer.timerCostPerMinute || ''}
                    placeholder="0"
                    onChange={(event) => updateDraft({ timerCostPerMinute: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <label>
                  <span>Обновлять, сек</span>
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    step={1}
                    value={timer.overtimeIntervalSeconds || 1}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      if (!Number.isFinite(parsed)) return
                      const overtimeIntervalSeconds = clampInterval(parsed)
                      setTimer((current) => ({
                        ...current,
                        overtimeIntervalSeconds,
                        scheduleOvertimeElapsed: 0,
                        timerOvertimeElapsed: 0
                      }))
                      if (isLive) {
                        setLiveTimer((current) => current
                          ? { ...current, overtimeIntervalSeconds, scheduleOvertimeElapsed: 0, timerOvertimeElapsed: 0 }
                          : current)
                      }
                    }}
                  />
                </label>
                <div className="field">
                  <span>Считать</span>
                  <div className="segmented stack">
                    <button className={timer.overtimeMode === 'schedule' ? 'active' : ''} onClick={() => setOvertimeMode('schedule')}>По времени</button>
                    <button className={timer.overtimeMode === 'timer' ? 'active' : ''} onClick={() => setOvertimeMode('timer')}>Таймер</button>
                    <button className={timer.overtimeMode === 'both' ? 'active' : ''} onClick={() => setOvertimeMode('both')}>Считать таймер и время</button>
                  </div>
                </div>
                <button className="danger-ghost" onClick={() => updateDraft({ overtimeCostTotal: 0 })}>Сбросить итог</button>
                </>}
              </div>

              <div className={`settings-card ${lookOpen ? '' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="card-toggle"
                  aria-expanded={lookOpen}
                  onClick={() => setLookOpen((open) => !open)}
                >
                  <span className="card-title">Вид</span>
                  <span className="card-toggle-meta">
                    {lookMode === 'image' ? 'Картинка' : lookMode === 'solid' ? 'Цвет' : 'Градиент'}
                  </span>
                  <span className={`card-chevron ${lookOpen ? 'is-open' : ''}`} aria-hidden="true" />
                </button>
                {lookOpen && <>
                <p className="section-label">Фон</p>
                <div className="segmented three">
                  <button className={lookMode === 'image' ? 'active' : ''} onClick={() => void chooseBackgroundImage()}>Картинка</button>
                  <button className={lookMode === 'solid' ? 'active' : ''} onClick={() => updateDraft({ backgroundMode: 'solid', backgroundImage: null })}>Цвет</button>
                  <button className={lookMode === 'gradient' ? 'active' : ''} onClick={() => updateDraft({ backgroundMode: 'gradient', backgroundImage: null })}>Градиент</button>
                </div>
                <div className="look-grid">
                  <label className="swatch">
                    <span>Цвет 1</span>
                    <input type="color" value={timer.backgroundColor} onChange={(event) => updateDraft({ backgroundColor: event.target.value })} />
                  </label>
                  {timer.backgroundMode === 'gradient' && (
                    <label className="swatch">
                      <span>Цвет 2</span>
                      <input type="color" value={timer.backgroundGradientColor} onChange={(event) => updateDraft({ backgroundGradientColor: event.target.value })} />
                    </label>
                  )}
                  <label className="swatch">
                    <span>Цвет шрифта</span>
                    <input type="color" value={timer.fontColor} onChange={(event) => updateDraft({ fontColor: event.target.value })} />
                  </label>
                  {timer.backgroundMode === 'gradient' && (
                    <label>
                      <span>Угол, °</span>
                      <input
                        type="number"
                        min={0}
                        max={360}
                        value={timer.backgroundGradientAngle}
                        onChange={(event) => updateDraft({ backgroundGradientAngle: Math.min(360, Math.max(0, Number(event.target.value) || 0)) })}
                      />
                    </label>
                  )}
                </div>
                <p className="text-edit-hint">Размер и толщина текста — в настройках выбранного блока.</p>
                </>}
              </div>
              <div className={`settings-card ${presetsOpen ? '' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="card-toggle"
                  aria-expanded={presetsOpen}
                  onClick={() => setPresetsOpen((open) => !open)}
                >
                  <span className="card-title">Пресеты</span>
                  <span className="card-toggle-meta">
                    {presets.filter((preset) => preset.config).length} из {PRESET_SLOT_COUNT}
                  </span>
                  <span className={`card-chevron ${presetsOpen ? 'is-open' : ''}`} aria-hidden="true" />
                </button>
                {presetsOpen && (
                  <>
                    <p className="text-edit-hint">Нажмите слот, чтобы загрузить экран. Удерживайте его или нажмите «Сохранить», чтобы записать текущую конфигурацию. Таймер и сумма перелимита не меняются.</p>
                    {presetNote && <p className="text-edit-hint">{presetNote}</p>}
                    {presets.map((preset, index) => (
                      <PresetSlot
                        key={index}
                        index={index}
                        filled={preset.config != null}
                        label={preset.name.trim() || preset.config?.eventName.trim() || 'Пусто'}
                        onLoad={() => loadPreset(index)}
                        onSave={() => savePreset(index)}
                        onRename={(name) => renamePreset(index, name)}
                        onDelete={() => deletePreset(index)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </aside>
      </div>

      <footer className="air-bar">
        <div className="air-status" title={status}>{footerStatus}</div>
        {!isLive ? (
          <button className="primary-action" onClick={() => void publish()}>Отправить в эфир</button>
        ) : (
          <div className="live-actions">
            <button className="update-action" disabled={!dirty} onClick={() => void updateOutput()}>Обновить эфир</button>
            <button className="remove-action" onClick={() => void stopOutput()}>Убрать из эфира</button>
          </div>
        )}
      </footer>
    </main>
  )
}


export function OutputDisplay({ displayId }: { displayId: number }): JSX.Element {
  const [timer, setTimer] = useState<TimerState | null>(null)

  useEffect(() => {
    const unsubscribe = window.timerPlus.onLiveState(setTimer)
    window.timerPlus.outputReady(displayId)
    return unsubscribe
  }, [displayId])

  return <div className="output-root">{timer && <EventTimerScene timer={timer} output />}</div>
}
