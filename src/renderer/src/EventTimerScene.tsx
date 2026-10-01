import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, MouseEvent } from 'react'
import type { SceneMeasureKey, ScenePlacement, TextMetric } from './scene-layout'
import { DEFAULT_SCENE_SLOTS, DEFAULT_SLOT_SHOWN } from '../../shared'
import type { SceneSlot, SceneTextKey, SceneTextStyle, SceneTextStyles, SlotContent, TimerState } from '../../shared'
import { sceneFont } from './fonts'
import { baseFontSize, identityFits, placeSceneText } from './scene-layout'
import { EVENT_STARTED_HEADING, clampCountdown, digitPhase, formatTimer, secondsUntilTime, toStartClock } from './timer-utils'

function currentClock(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function currentDate(date: Date): string {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
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
  const nodes = useRef<Partial<Record<SceneMeasureKey, HTMLDivElement | null>>>({})
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
  const finishing = (centralMode === 'timer' || centralMode === 'to-end')
    && centralSeconds != null
    && centralSeconds >= 0
    && centralSeconds <= 5
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
  const slots = timer.slots ?? DEFAULT_SCENE_SLOTS
  const slotShown = timer.slotShown ?? DEFAULT_SLOT_SHOWN
  const dateLabel = currentDate(now)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = (): void => {
      const frameW = frame.clientWidth
      const frameH = frame.clientHeight
      const items: Partial<Record<SceneMeasureKey, TextMetric>> = {}
      const bases: Record<SceneMeasureKey, [number, number]> = {
        topLeft: [5.16, 9.18],
        topCenter: [3.2, 5.7],
        topRight: [2.56, 4.55],
        heading: [3.22, 5.73],
        time: [18.28, 32.49],
        event: [3.77, 6.7],
        bottomLeft: [2.55, 4.54],
        bottomCenter: [2.55, 4.54],
        bottomRight: [2.55, 4.54]
      }
      for (const key of Object.keys(bases) as SceneMeasureKey[]) {
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
    const onFonts = (): void => run()
    document.fonts.addEventListener('loadingdone', onFonts)
    void document.fonts.ready.then(run)
    return () => {
      cancelled = true
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', onFonts)
    }
  }, [
    placement,
    styles,
    eventGlyph,
    timer.visibility,
    heading,
    centralText,
    dateLabel,
    slots.topLeft,
    slots.topCenter,
    slots.topRight,
    slots.bottomLeft,
    slots.bottomCenter,
    slots.bottomRight,
    slotShown.topLeft,
    slotShown.topCenter,
    slotShown.topRight,
    slotShown.bottomLeft,
    slotShown.bottomCenter,
    slotShown.bottomRight,
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

  const bind = (key: SceneMeasureKey) => (node: HTMLDivElement | null): void => {
    nodes.current[key] = node
  }

  const renderSlot = (slot: SceneSlot, className: string): JSX.Element | null => {
    const content = slots[slot]
    if (content === 'empty' || slotShown[slot] === false) return null
    return (
      <div
        ref={bind(slot)}
        className={hitClass(content, selectedText, `scene-slot ${className}`)}
        style={blockStyle(styles, content, placement, slot)}
        onClick={hit(content)}
      >
        {slotBody(content)}
      </div>
    )
  }

  const slotBody = (content: Exclude<SlotContent, 'empty'>): JSX.Element | string => {
    if (content === 'clock') return currentClock(now)
    if (content === 'date') return dateLabel
    if (content === 'schedule') {
      return (
        <>
          <div>Начало:&nbsp; {timer.startTime}</div>
          <div>Конец:&nbsp; {timer.endTime}</div>
        </>
      )
    }
    if (content === 'remaining') {
      return (
        <span className="scene-slot-line">
          {remainingLabel && <span>{remainingLabel}:</span>}
          <span className={endPhase === 'warning' ? 'is-warning' : ''}>{formatTimer(scheduledRemaining)}</span>
        </span>
      )
    }
    return (
      <span className="scene-slot-line">
        {costLabel && <span className="scene-cost-label">{costLabel}:</span>}
        <span>{formattedCost}₽</span>
      </span>
    )
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
        {renderSlot('topLeft', 'scene-slot-top-left')}
        {renderSlot('topCenter', 'scene-slot-top-center')}
        {renderSlot('topRight', 'scene-slot-top-right')}

        <div className="scene-center">
          {timer.visibility.heading && (
            <div
              ref={bind('heading')}
              className={hitClass('heading', selectedText, `scene-heading ${finishing ? 'is-finishing' : ''}`)}
              style={blockStyle(styles, 'heading', placement, 'heading', 'heading')}
              onClick={hit('heading')}
            >{heading}</div>
          )}
          <div
            ref={bind('time')}
            className={hitClass('time', selectedText, `scene-time ${phase === 'normal' ? '' : `is-${phase}`}`)}
            style={blockStyle(styles, 'time', placement, 'time', 'time')}
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
              style={blockStyle(styles, 'event', placement, 'event', 'event')}
              onClick={hit('event')}
            >
              <FittedEventName
                name={timer.eventName || 'МЕРОПРИЯТИЕ'}
                textScale={(styles.event?.scale ?? 1) * (placement.fit.event || 1)}
                weight={styles.event?.weight ?? 300}
                family={styles.event?.family}
                italic={styles.event?.italic}
                glyph={eventGlyph}
              />
            </div>
          )}
        </div>

        {renderSlot('bottomLeft', 'scene-slot-bottom-left')}
        {renderSlot('bottomCenter', 'scene-slot-bottom-center')}
        {renderSlot('bottomRight', 'scene-slot-bottom-right')}
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
  fitKey: SceneMeasureKey,
  anchor?: 'heading' | 'time' | 'event'
): CSSProperties {
  const item = styles[key] ?? { scale: 1, weight: 300, family: 'sb-sans', italic: false }
  const font = sceneFont(item.family)
  const style: CSSProperties = {
    fontFamily: font.css,
    fontStyle: item.italic && font.italic ? 'italic' : 'normal',
    fontWeight: item.weight,
    ['--text-scale' as string]: String(item.scale * (placement.fit[fitKey] || 1))
  }
  const top = anchor ? placement.top[anchor] : undefined
  if (top != null) style.top = `${top}px`
  return style
}

function samePlacement(current: ScenePlacement, next: ScenePlacement): boolean {
  const keys = Object.keys(current.fit) as SceneMeasureKey[]
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
  family,
  italic,
  glyph
}: {
  name: string
  textScale: number
  weight: number
  family: SceneTextStyle['family'] | undefined
  italic: boolean | undefined
  glyph: number
}): JSX.Element {
  const font = sceneFont(family)
  const textStyle = {
    fontFamily: font.css,
    fontStyle: italic && font.italic ? 'italic' : 'normal',
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
        style={{
          fontFamily: font.css,
          fontStyle: italic && font.italic ? 'italic' : 'normal',
          fontWeight: weight,
          ['--text-scale' as string]: String(textScale)
        } as CSSProperties}
      >{name}</div>
    </>
  )
}

