import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, MouseEvent } from 'react'
import type { SceneTextKey, SceneTextStyles, TimerState } from '../../shared'
import { baseFontSize, identityFits, placeSceneText } from './scene-layout'
import type { ScenePlacement, TextMetric } from './scene-layout'
import { EVENT_STARTED_HEADING, clampCountdown, digitPhase, formatTimer, secondsUntilTime, toStartClock } from './timer-utils'

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

const EMPTY_PLACEMENT: ScenePlacement = { fit: identityFits(), top: {} }

export function EventTimerScene({
  timer,
  output = false,
  textEditing = false,
  selectedText = null,
  onSelectText
}: {
  timer: TimerState
  output?: boolean
  textEditing?: boolean
  selectedText?: SceneTextKey | null
  onSelectText?: (key: SceneTextKey | null) => void
}): JSX.Element {
  const [now, setNow] = useState(() => new Date())
  const frameRef = useRef<HTMLDivElement>(null)
  const nodes = useRef<Partial<Record<SceneTextKey, HTMLDivElement | null>>>({})
  const [placement, setPlacement] = useState<ScenePlacement>(EMPTY_PLACEMENT)
  const [eventGlyph, setEventGlyph] = useState(1)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const centralMode = timer.centralTimeMode
  const toStart = centralMode === 'to-start'
    ? toStartClock(now, timer.startTime, timer.allowNegative['to-start'])
    : null
  const rawCentral = centralMode === 'timer'
    ? timer.remaining
    : centralMode === 'to-start'
      ? secondsUntilTime(now, timer.startTime)
      : centralMode === 'to-end'
        ? secondsUntilTime(now, timer.endTime)
        : null
  const centralSeconds = rawCentral == null || centralMode === 'current'
    ? rawCentral
    : centralMode === 'to-start'
      ? toStart?.seconds ?? 0
      : clampCountdown(rawCentral, timer.allowNegative[centralMode])
  const phase = rawCentral == null || centralMode === 'current'
    ? 'normal'
    : digitPhase(rawCentral, timer.allowNegative[centralMode], timer.warning[centralMode])
  const eventStarted = toStart?.started === true
  const heading = eventStarted ? EVENT_STARTED_HEADING : timer.headings[centralMode]
  const centralText = centralMode === 'current'
    ? currentClockWithSeconds(now)
    : formatTimer(centralSeconds ?? 0)
  const showSign = centralText.startsWith('−')
  const centralDigits = showSign ? centralText.slice(1) : centralText
  const rawEnd = secondsUntilTime(now, timer.endTime)
  const scheduledRemaining = clampCountdown(rawEnd, timer.allowNegative['to-end'])
  const endPhase = digitPhase(rawEnd, timer.allowNegative['to-end'], timer.warning['to-end'])
  const formattedCost = Math.max(0, timer.overtimeCostTotal).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  const remainingLabel = (timer.remainingLabel ?? 'До завершения').trim()
  const costLabel = (timer.costLabel ?? 'Итого').trim()
  const background = timer.backgroundMode === 'gradient'
    ? `linear-gradient(${timer.backgroundGradientAngle}deg, ${timer.backgroundColor}, ${timer.backgroundGradientColor})`
    : timer.backgroundColor
  const styles = timer.textStyles

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = (): void => {
      const frameW = frame.clientWidth
      const frameH = frame.clientHeight
      const items: Partial<Record<SceneTextKey, TextMetric>> = {}
      const bases: Record<SceneTextKey, [number, number]> = {
        clock: [5.16, 9.18],
        schedule: [2.56, 4.55],
        heading: [3.22, 5.73],
        time: [18.28, 32.49],
        event: [3.77, 6.7],
        remaining: [2.55, 4.54],
        cost: [2.55, 4.54]
      }
      for (const key of Object.keys(bases) as SceneTextKey[]) {
        const node = nodes.current[key]
        if (!node) continue
        const [cqw, cqh] = bases[key]
        const base = baseFontSize(frameW, frameH, cqw, cqh)
        const fontSize = Number.parseFloat(getComputedStyle(node).fontSize) || base
        items[key] = {
          height: node.offsetHeight,
          width: Math.max(node.scrollWidth, node.offsetWidth),
          renderedScale: base > 0 ? fontSize / base : 1,
          fit: placement.fit[key] || 1
        }
      }
      const eventNode = nodes.current.event
      const eventText = eventNode?.querySelector('.scene-event:not(.scene-event-measure)')
      const eventMeasure = eventNode?.querySelector('.scene-event-measure')
      if (eventNode && eventText instanceof HTMLElement) {
        const textScale = (styles.event?.scale ?? 1) * (placement.fit.event || 1)
        const glyph = eventMeasure instanceof HTMLElement && eventMeasure.clientWidth > 0 && eventMeasure.scrollWidth > eventMeasure.clientWidth + 1
          ? Math.max(0.35, (eventMeasure.clientWidth / eventMeasure.scrollWidth) * 0.99)
          : 1
        setEventGlyph((current) => Math.abs(current - glyph) < 0.004 ? current : glyph)
        items.event = {
          height: eventNode.offsetHeight,
          width: Math.max(eventText.scrollWidth, eventText.offsetWidth),
          renderedScale: glyph < 0.995 ? 1 : Math.max(0.001, textScale),
          fit: placement.fit.event || 1
        }
      }
      const next = placeSceneText(frameW, frameH, items)
      setPlacement((current) => samePlacement(current, next) ? current : next)
    }

    let cancelled = false
    const run = (): void => {
      if (!cancelled) measure()
    }
    run()
    const observer = new ResizeObserver(run)
    observer.observe(frame)
    void document.fonts.ready.then(run)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [
    placement,
    styles,
    eventGlyph,
    timer.visibility,
    heading,
    centralText,
    timer.eventName,
    timer.startTime,
    timer.endTime,
    remainingLabel,
    costLabel,
    formattedCost
  ])

  const hit = (key: SceneTextKey) => (event: MouseEvent<HTMLDivElement>): void => {
    if (!onSelectText) return
    event.stopPropagation()
    onSelectText(key)
  }

  const bind = (key: SceneTextKey) => (node: HTMLDivElement | null): void => {
    nodes.current[key] = node
  }

  return (
    <div
      className={`timer-scene ${output ? 'timer-scene-output' : ''} ${textEditing ? 'scene-editing' : ''}`}
      style={{
        background,
        color: timer.fontColor,
        ['--warning-color' as string]: timer.warningColor,
        ['--overtime-color' as string]: timer.overtimeColor
      }}
    >
      {timer.backgroundImage && <img className="scene-background" src={timer.backgroundImage} draggable={false} />}
      <div className="scene-frame" ref={frameRef} onClick={() => onSelectText?.(null)}>
        {timer.visibility.clock && (
          <div
            ref={bind('clock')}
            className={hitClass('clock', selectedText, 'scene-clock')}
            style={blockStyle(styles, 'clock', placement)}
            onClick={hit('clock')}
          >{currentClock(now)}</div>
        )}

        {timer.visibility.schedule && (
          <div
            ref={bind('schedule')}
            className={hitClass('schedule', selectedText, 'scene-schedule')}
            style={blockStyle(styles, 'schedule', placement)}
            onClick={hit('schedule')}
          >
            <div>Начало:&nbsp; {timer.startTime}</div>
            <div>Конец:&nbsp; {timer.endTime}</div>
          </div>
        )}

        <div className="scene-center">
          {timer.visibility.heading && (
            <div
              ref={bind('heading')}
              className={hitClass('heading', selectedText, 'scene-heading')}
              style={blockStyle(styles, 'heading', placement, 'heading')}
              onClick={hit('heading')}
            >{heading}</div>
          )}
          <div
            ref={bind('time')}
            className={hitClass('time', selectedText, `scene-time ${phase === 'normal' ? '' : `is-${phase}`}`)}
            style={blockStyle(styles, 'time', placement, 'time')}
            onClick={hit('time')}
          >
            <span className={`scene-time-sign ${showSign ? 'is-on' : ''}`} aria-hidden={!showSign}>−</span>
            <span className="scene-time-digits">{centralDigits}</span>
            <span className="scene-time-sign" aria-hidden="true">−</span>
          </div>
          {timer.visibility.eventName && (
            <div
              ref={bind('event')}
              className={hitClass('event', selectedText, 'scene-event-wrap')}
              style={blockStyle(styles, 'event', placement, 'event')}
              onClick={hit('event')}
            >
              <FittedEventName
                name={timer.eventName || 'МЕРОПРИЯТИЕ'}
                textScale={(styles.event?.scale ?? 1) * (placement.fit.event || 1)}
                weight={styles.event?.weight ?? 300}
                glyph={eventGlyph}
              />
            </div>
          )}
        </div>

        {timer.visibility.remaining && (
          <div
            ref={bind('remaining')}
            className={hitClass('remaining', selectedText, 'scene-remaining')}
            style={blockStyle(styles, 'remaining', placement)}
            onClick={hit('remaining')}
          >
            {remainingLabel && <span>{remainingLabel}:</span>}
            <span className={`scene-remaining-value ${endPhase === 'normal' ? '' : `is-${endPhase}`}`}>{formatTimer(scheduledRemaining)}</span>
          </div>
        )}

        {timer.visibility.cost && (
          <div
            ref={bind('cost')}
            className={hitClass('cost', selectedText, `scene-cost ${centralMode !== 'current' && rawCentral != null && rawCentral < 0 && timer.allowNegative[centralMode] ? 'is-overtime' : ''}`)}
            style={blockStyle(styles, 'cost', placement)}
            onClick={hit('cost')}
          >
            {costLabel && <span className="scene-cost-label">{costLabel}:</span>}
            <span className="scene-cost-value">{formattedCost}₽</span>
          </div>
        )}
      </div>
    </div>
  )
}

function hitClass(key: SceneTextKey, selected: SceneTextKey | null, extra = ''): string {
  return ['scene-hit', extra, selected === key ? 'selected' : ''].filter(Boolean).join(' ')
}

function blockStyle(
  styles: SceneTextStyles,
  key: SceneTextKey,
  placement: ScenePlacement,
  anchor?: 'heading' | 'time' | 'event'
): CSSProperties {
  const item = styles[key] ?? { scale: 1, weight: 300 }
  const style: CSSProperties = {
    fontWeight: item.weight,
    ['--text-scale' as string]: String(item.scale * (placement.fit[key] || 1))
  }
  const top = anchor ? placement.top[anchor] : undefined
  if (top != null) style.top = `${top}px`
  return style
}

function samePlacement(current: ScenePlacement, next: ScenePlacement): boolean {
  const keys = Object.keys(current.fit) as SceneTextKey[]
  for (const key of keys) {
    if (Math.abs((current.fit[key] || 1) - (next.fit[key] || 1)) > 0.004) return false
  }
  const anchors = ['heading', 'time', 'event'] as const
  for (const key of anchors) {
    const left = current.top[key]
    const right = next.top[key]
    if (left == null && right == null) continue
    if (left == null || right == null || Math.abs(left - right) > 0.5) return false
  }
  return true
}

function FittedEventName({
  name,
  textScale,
  weight,
  glyph
}: {
  name: string
  textScale: number
  weight: number
  glyph: number
}): JSX.Element {
  const textStyle = {
    fontWeight: weight,
    ['--text-scale' as string]: String(textScale),
    ['--event-scale' as string]: String(glyph)
  } as CSSProperties
  return (
    <>
      <div className="scene-event" title={name} style={textStyle}>{name}</div>
      <div
        className="scene-event scene-event-measure"
        aria-hidden="true"
        style={{ fontWeight: weight, ['--text-scale' as string]: String(textScale) } as CSSProperties}
      >{name}</div>
    </>
  )
}
