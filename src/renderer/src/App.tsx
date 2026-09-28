import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type {
  DisplayInfo,
  TimerCentralMode,
  TimerSettings,
  TimerState,
  TimerVisibility
} from '../../shared'
import { DEFAULT_TIMER, defaultHeading, normalizeSettings } from './defaults'
import { EventTimerScene } from './EventTimerScene'
import {
  advanceTimer,
  normalizeTimePart,
  secondsFromTimeParts,
  timePartsFromSeconds
} from './timer-utils'

type TimePart = 'hours' | 'minutes' | 'seconds'
type TimeParts = Record<TimePart, string>

const modeOptions: Array<[TimerCentralMode, string]> = [
  ['current', 'Текущее время'],
  ['timer', 'Таймер'],
  ['to-start', 'До начала'],
  ['to-end', 'До конца']
]

const visibilityOptions: Array<[keyof TimerVisibility, string]> = [
  ['clock', 'Часы слева'],
  ['schedule', 'Начало / конец'],
  ['heading', 'Заголовок'],
  ['eventName', 'Название мероприятия'],
  ['remaining', 'До завершения'],
  ['cost', 'Стоимость']
]

function cloneTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    headings: { ...timer.headings },
    visibility: { ...timer.visibility }
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
  const [timer, setTimer] = useState<TimerState>(() => cloneTimer(DEFAULT_TIMER))
  const [liveTimer, setLiveTimer] = useState<TimerState | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [selectedDisplayIds, setSelectedDisplayIds] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [liveControl, setLiveControl] = useState(false)
  const [status, setStatus] = useState('Получение списка экранов…')
  const [editingTime, setEditingTime] = useState(false)
  const [timePartsDirty, setTimePartsDirty] = useState(false)
  const [timeParts, setTimeParts] = useState<TimeParts>(() => timePartsFromSeconds(DEFAULT_TIMER.remaining))
  const [expanded, setExpanded] = useState(false)
  const savedPayload = useRef('')

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
      timer: { ...cloneTimer(timer), running: false, live: false, overtimeElapsed: 0 },
      selectedDisplayIds
    }
    const key = JSON.stringify(settings)
    if (key === savedPayload.current) return
    savedPayload.current = key
    window.timerPlus.saveSettings(settings)
  }, [ready, selectedDisplayIds, timer])

  useEffect(() => {
    const countdown = timer.running || Boolean(liveTimer?.running)
    const schedule = Boolean(timer.scheduleOvertime || liveTimer?.scheduleOvertime)
    if (!countdown && !schedule) return
    const interval = window.setInterval(() => {
      const now = new Date()
      setTimer((current) => advanceTimer(current, now, current.running))
      setLiveTimer((current) => current ? advanceTimer(current, now, current.running) : current)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timer.running, timer.scheduleOvertime, liveTimer?.running, liveTimer?.scheduleOvertime])

  useEffect(() => {
    if (liveTimer) window.timerPlus.updateLive(liveTimer)
  }, [liveTimer])

  useEffect(() => {
    if (!editingTime) setTimeParts(timePartsFromSeconds(timer.remaining))
  }, [editingTime, timer.remaining])

  const updateDraft = (update: Partial<TimerState>): void => {
    setTimer((current) => ({
      ...current,
      ...update,
      headings: update.headings ? { ...current.headings, ...update.headings } : current.headings,
      visibility: update.visibility ? { ...current.visibility, ...update.visibility } : current.visibility
    }))
    if (isLive) setDirty(true)
  }

  const updateTimerControl = (
    update: Partial<Pick<TimerState, 'duration' | 'remaining' | 'running'>>
  ): void => {
    setTimer((current) => ({ ...current, ...update }))
    if (isLive && liveControl) {
      setLiveTimer((current) => current ? { ...current, ...update } : current)
    } else if (isLive) {
      setDirty(true)
    }
  }

  const publish = async (): Promise<void> => {
    if (!selectedDisplayIds.length) {
      setStatus('Выберите хотя бы один экран для эфира')
      return
    }
    const output = { ...cloneTimer(timer), live: true }
    await window.timerPlus.goLive(selectedDisplayIds, output)
    setTimer((current) => ({ ...current, live: true }))
    setLiveTimer(output)
    setDirty(false)
    setLiveControl(false)
    setStatus(`Таймер в эфире на экранах: ${selectedDisplayIds.length}`)
  }

  const updateOutput = async (): Promise<void> => {
    if (!selectedDisplayIds.length) {
      setStatus('Выберите хотя бы один экран для эфира')
      return
    }
    const output = { ...cloneTimer(timer), live: true }
    await window.timerPlus.goLive(selectedDisplayIds, output)
    setLiveTimer(output)
    setDirty(false)
    setStatus('Эфир обновлён')
  }

  const stopOutput = async (): Promise<void> => {
    await window.timerPlus.stopLive()
    setLiveTimer(null)
    setTimer((current) => ({ ...current, live: false }))
    setDirty(false)
    setLiveControl(false)
    setStatus('Таймер убран из эфира')
  }

  const selectMode = (mode: TimerCentralMode): void => {
    updateDraft({ centralTimeMode: mode })
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

  const displayRows = useMemo(() => displays.map((display, index) => ({
    display,
    name: displayName(display, index)
  })), [displays])

  const toggleLayout = (): void => {
    const next = !expanded
    setExpanded(next)
    void window.timerPlus.setLayout(next ? 'expanded' : 'compact')
  }

  const timerPanel = (
    <section className="panel timer-panel">
      <h2>Управление таймером</h2>
      <div className={`time-editor ${timer.remaining < 0 ? 'negative' : ''}`}>
        {timer.remaining < 0 && <span>−</span>}
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
      <div className="time-hint">Нажмите отдельно на часы, минуты или секунды</div>
      <div className="transport">
        <button className="pause" title="Пауза" onClick={() => updateTimerControl({ running: false })}>Ⅱ</button>
        <button className="play" title="Старт" onClick={() => updateTimerControl({ running: true })}>▶</button>
        <button className="stop" title="Стоп и сброс" onClick={() => updateTimerControl({ running: false, remaining: timer.duration })}>■</button>
        <button
          disabled={!isLive}
          className={`live-control ${liveControl ? 'active' : ''}`}
          title={isLive ? 'Применять команды управления временем к эфиру немедленно' : 'Сначала отправьте таймер в эфир'}
          onClick={() => setLiveControl((value) => !value)}
        >⚡ LIVE</button>
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
              : undefined}
          >{minutes === 0 ? 'Сейчас' : `${minutes > 0 ? '+' : ''}${minutes} мин`}</button>
        ))}
      </div>
      {!isLive ? (
        <button className="primary-action" onClick={() => void publish()}>Отправить в эфир</button>
      ) : (
        <div className="live-actions">
          <button className="update-action" disabled={!dirty} onClick={() => void updateOutput()}>{dirty ? 'Обновить эфир' : 'Эфир обновлён'}</button>
          <button className="remove-action" onClick={() => void stopOutput()}>Убрать из эфира</button>
        </div>
      )}
    </section>
  )

  if (!ready) {
    return <div className="loading"><div className="spinner" /><div>EventTimer запускается…</div></div>
  }

  if (!expanded) {
    return (
      <main className="control-app compact-app" data-layout="compact">
        <header className="app-header">
          <div className="brand">
            <div className="brand-icon">ET</div>
            <div>
              <h1>EventTimer</h1>
              <p>Управление</p>
            </div>
          </div>
          <button className="layout-toggle" onClick={toggleLayout}>Развернуть</button>
          <div className={`live-badge ${isLive ? 'on' : ''}`}>
            <span />{isLive ? 'В ЭФИРЕ' : 'НЕ В ЭФИРЕ'}
          </div>
        </header>
        <div className="compact-body">
          {timerPanel}
          <div className="status-line" title={status}>{status}</div>
        </div>
      </main>
    )
  }

  return (
    <main className="control-app" data-layout="expanded">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">ET</div>
          <div>
            <h1>EventTimer</h1>
            <p>Самостоятельный таймер мероприятия</p>
          </div>
        </div>
        <div className="display-picker">
          <div className="display-picker-title">
            <span>Экраны для эфира</span>
            <button className="link-button" onClick={() => void refreshDisplays()}>Обновить</button>
          </div>
          <div className="display-list">
            {displayRows.map(({ display, name }) => {
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
                  {name}
                </button>
              )
            })}
          </div>
        </div>
        <div className="header-side">
          <button className="layout-toggle" onClick={toggleLayout}>Свернуть</button>
          <div className={`live-badge ${isLive ? 'on' : ''}`}>
            <span />{isLive ? 'В ЭФИРЕ' : 'НЕ В ЭФИРЕ'}
          </div>
        </div>
      </header>

      <div className="workspace">
        <section className="left-column panel">
          <h2>Настройка таймера</h2>
          <div className="form-grid">
            <label>
              <span className="label-row">
                <span>Заголовок</span>
                {timer.headings[timer.centralTimeMode] !== defaultHeading(timer.centralTimeMode) && (
                  <button
                    className="link-button"
                    onClick={() => updateDraft({
                      headings: {
                        ...timer.headings,
                        [timer.centralTimeMode]: defaultHeading(timer.centralTimeMode)
                      }
                    })}
                  >Авто</button>
                )}
              </span>
              <input
                value={timer.headings[timer.centralTimeMode]}
                maxLength={120}
                onChange={(event) => updateDraft({
                  headings: { ...timer.headings, [timer.centralTimeMode]: event.target.value }
                })}
              />
            </label>
            <label>
              <span>Время мероприятия</span>
              <div className="time-range">
                <input type="time" value={timer.startTime} onChange={(event) => updateSchedule('startTime', event.target.value)} />
                <input type="time" value={timer.endTime} onChange={(event) => updateSchedule('endTime', event.target.value)} />
              </div>
            </label>
            <label>
              <span>Название мероприятия</span>
              <input
                value={timer.eventName}
                maxLength={120}
                onChange={(event) => updateDraft({ eventName: event.target.value })}
              />
            </label>
            <label>
              <span>Текст конца мероприятия</span>
              <input
                value={timer.remainingLabel ?? 'До завершения'}
                maxLength={40}
                placeholder="До завершения"
                onChange={(event) => updateDraft({ remainingLabel: event.target.value })}
              />
            </label>
            <label>
              <span>Текст стоимости</span>
              <input
                value={timer.costLabel ?? 'Итого'}
                maxLength={40}
                placeholder="Итого"
                onChange={(event) => updateDraft({ costLabel: event.target.value })}
              />
            </label>
            <label>
              <span>Расчёт стоимости перелимита</span>
              <div className="cost-row">
                <div className="unit-input">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={timer.costPerMinute || ''}
                    placeholder="Стоимость"
                    onChange={(event) => updateDraft({ costPerMinute: Math.max(0, Number(event.target.value) || 0) })}
                  />
                  <span>₽ / мин</span>
                </div>
                <button className="danger-ghost" onClick={() => updateDraft({ overtimeCostTotal: 0 })}>Сбросить итог</button>
                <button
                  className={`schedule-toggle ${timer.scheduleOvertime ? 'active' : ''}`}
                  title="Когда включено, после времени конца мероприятия стоимость копится каждую секунду"
                  onClick={() => {
                    const scheduleOvertime = !timer.scheduleOvertime
                    setTimer((current) => ({ ...current, scheduleOvertime, overtimeElapsed: 0 }))
                    if (isLive) setLiveTimer((current) => current ? { ...current, scheduleOvertime, overtimeElapsed: 0 } : current)
                  }}
                >По времени мероприятия</button>
              </div>
            </label>
            <label>
              <span>Частота обновления перелимита</span>
              <div className="unit-input">
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
                    setTimer((current) => ({ ...current, overtimeIntervalSeconds, overtimeElapsed: 0 }))
                    if (isLive) {
                      setLiveTimer((current) => current
                        ? { ...current, overtimeIntervalSeconds, overtimeElapsed: 0 }
                        : current)
                    }
                  }}
                />
                <span>сек</span>
              </div>
            </label>
          </div>

          <div className="background-bar">
            <span>Фон</span>
            <button onClick={async () => {
              const image = await window.timerPlus.selectBackground()
              if (image) updateDraft({ backgroundImage: image })
            }}>Изображение</button>
            {timer.backgroundImage && <button onClick={() => updateDraft({ backgroundImage: null })}>Убрать</button>}
            <div className="segmented compact">
              <button className={timer.backgroundMode === 'solid' ? 'active' : ''} onClick={() => updateDraft({ backgroundMode: 'solid' })}>Один цвет</button>
              <button className={timer.backgroundMode === 'gradient' ? 'active' : ''} onClick={() => updateDraft({ backgroundMode: 'gradient' })}>Градиент</button>
            </div>
            <label className="color-field">Цвет 1<input type="color" value={timer.backgroundColor} onChange={(event) => updateDraft({ backgroundColor: event.target.value })} /></label>
            <label className="color-field">Цвет шрифта<input type="color" value={timer.fontColor} onChange={(event) => updateDraft({ fontColor: event.target.value })} /></label>
            {timer.backgroundMode === 'gradient' && (
              <>
                <label className="color-field">Цвет 2<input type="color" value={timer.backgroundGradientColor} onChange={(event) => updateDraft({ backgroundGradientColor: event.target.value })} /></label>
                <label className="angle-field">Угол<input type="number" min={0} max={360} value={timer.backgroundGradientAngle} onChange={(event) => updateDraft({ backgroundGradientAngle: Math.min(360, Math.max(0, Number(event.target.value) || 0)) })} />°</label>
              </>
            )}
          </div>

          <div className="preview-frame"><EventTimerScene timer={timer} /></div>
          <div className="preview-caption">Превью — изменения не попадут в эфир до команды «Обновить эфир»</div>
        </section>

        <aside className="right-column">
          <section className="panel settings-panel">
            <h2>Отображение на экране</h2>
            <p className="section-label">Центральное время</p>
            <div className="segmented mode-grid">
              {modeOptions.map(([mode, label]) => (
                <button key={mode} className={timer.centralTimeMode === mode ? 'active' : ''} onClick={() => selectMode(mode)}>{label}</button>
              ))}
            </div>
            <p className="section-label">Отображаемые элементы</p>
            <div className="visibility-grid">
              {visibilityOptions.map(([key, label]) => (
                <button
                  key={key}
                  className={timer.visibility[key] ? 'active' : ''}
                  onClick={() => updateDraft({ visibility: { ...timer.visibility, [key]: !timer.visibility[key] } })}
                >{label}</button>
              ))}
            </div>
          </section>

          {timerPanel}

          <div className="status-line" title={status}>{status}</div>
        </aside>
      </div>
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
