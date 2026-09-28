import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { TimerState } from '../../shared'
import { formatTimer, secondsUntilTime } from './timer-utils'

function currentClock(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function currentClockWithSeconds(date: Date): string {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function EventTimerScene({ timer, output = false }: { timer: TimerState; output?: boolean }): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const centralSeconds = timer.centralTimeMode === 'timer'
    ? timer.remaining
    : timer.centralTimeMode === 'to-start'
      ? secondsUntilTime(now, timer.startTime)
      : timer.centralTimeMode === 'to-end'
        ? secondsUntilTime(now, timer.endTime)
        : null
  const overtime = centralSeconds !== null && centralSeconds < 0
  const centralText = timer.centralTimeMode === 'current'
    ? currentClockWithSeconds(now)
    : formatTimer(centralSeconds ?? 0)
  const scheduledRemaining = secondsUntilTime(now, timer.endTime)
  const formattedCost = Math.max(0, timer.overtimeCostTotal).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  const remainingLabel = (timer.remainingLabel ?? 'До завершения').trim()
  const costLabel = (timer.costLabel ?? 'Итого').trim()
  const background = timer.backgroundMode === 'gradient'
    ? `linear-gradient(${timer.backgroundGradientAngle}deg, ${timer.backgroundColor}, ${timer.backgroundGradientColor})`
    : timer.backgroundColor
  return (
    <div
      className={`timer-scene ${output ? 'timer-scene-output' : ''}`}
      style={{ background, color: timer.fontColor }}
    >
      {timer.backgroundImage && <img className="scene-background" src={timer.backgroundImage} draggable={false} />}
      <div className="scene-frame">
        {timer.visibility.clock && <div className="scene-clock">{currentClock(now)}</div>}

        {timer.visibility.schedule && (
          <div className="scene-schedule">
            <div>Начало:&nbsp; {timer.startTime}</div>
            <div>Конец:&nbsp; {timer.endTime}</div>
          </div>
        )}

        <div className="scene-center">
          {timer.visibility.heading && (
            <div className="scene-heading">{timer.headings[timer.centralTimeMode]}</div>
          )}
          <div className={`scene-time ${overtime ? 'overtime' : ''}`}>{centralText}</div>
          {timer.visibility.eventName && (
            <div className="scene-event-wrap">
              <div className="scene-event" title={timer.eventName}>{timer.eventName || 'МЕРОПРИЯТИЕ'}</div>
            </div>
          )}
        </div>

        {timer.visibility.remaining && (
          <div className="scene-remaining">
            {remainingLabel && <span>{remainingLabel}:</span>}
            <span className="scene-remaining-value">{formatTimer(scheduledRemaining)}</span>
          </div>
        )}

        {timer.visibility.cost && (
          <div className={`scene-cost ${overtime ? 'overtime' : ''}`}>
            {costLabel && <span className="scene-cost-label">{costLabel}:</span>}
            <span className="scene-cost-value">{formattedCost}₽</span>
          </div>
        )}
      </div>
    </div>
  )
}
