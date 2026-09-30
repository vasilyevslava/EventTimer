import type { SceneTextKey } from '../../shared'

export const SCENE_TEXT_KEYS: SceneTextKey[] = [
  'clock', 'schedule', 'heading', 'time', 'event', 'remaining', 'cost'
]

/** Widest a block may be, as a fraction of the frame width. */
const MAX_WIDTH: Record<SceneTextKey, number> = {
  clock: 0.46,
  schedule: 0.46,
  heading: 0.86,
  time: 0.94,
  event: 0.86,
  remaining: 0.46,
  cost: 0.46
}

export interface TextMetric {
  height: number
  width: number
  /** Current font size divided by the size at scale 1. Includes the applied fit. */
  renderedScale: number
  fit: number
}

export interface ScenePlacement {
  fit: Record<SceneTextKey, number>
  /** Center Y for heading and time, top edge for the event block. */
  top: Partial<Record<'heading' | 'time' | 'event', number>>
}

export function identityFits(): Record<SceneTextKey, number> {
  return { clock: 1, schedule: 1, heading: 1, time: 1, event: 1, remaining: 1, cost: 1 }
}

function cq(frameW: number, frameH: number, cqw: number, cqh: number): number {
  return Math.min(frameW * cqw / 100, frameH * cqh / 100)
}

/**
 * Places scene text so a larger block pushes its neighbors away, then stops
 * at the frame edges instead of overlapping or leaving the screen.
 * Measurements are the sizes currently painted on screen.
 */
export function placeSceneText(
  frameW: number,
  frameH: number,
  items: Partial<Record<SceneTextKey, TextMetric>>
): ScenePlacement {
  const fit = identityFits()
  if (frameW <= 0 || frameH <= 0) return { fit, top: {} }

  const sized = (key: SceneTextKey): { height: number, delta: number } | null => {
    const item = items[key]
    if (!item || item.renderedScale <= 0) return null
    const applied = Math.max(item.fit, 0.001)
    const widthAtFit1 = item.width / applied
    const heightAtFit1 = item.height / applied
    const maxWidth = frameW * MAX_WIDTH[key]
    const widthFit = Math.min(1, maxWidth / Math.max(widthAtFit1, 1))
    fit[key] = widthFit
    const height = heightAtFit1 * widthFit
    const heightAt1 = item.height / item.renderedScale
    return { height, delta: height - heightAt1 }
  }

  const clock = sized('clock')
  const schedule = sized('schedule')
  const heading = sized('heading')
  const time = sized('time')
  const event = sized('event')
  const remaining = sized('remaining')
  const cost = sized('cost')

  const capBlock = (box: { height: number } | null, key: SceneTextKey, maxFraction: number): number => {
    if (!box) return 0
    const maxHeight = frameH * maxFraction
    if (box.height > maxHeight && box.height > 0) {
      fit[key] *= maxHeight / box.height
      return maxHeight
    }
    return box.height
  }

  const clockH = capBlock(clock, 'clock', 0.34)
  const scheduleH = capBlock(schedule, 'schedule', 0.34)
  const topEdge = Math.max(
    clock ? frameH * 0.037 + clockH : 0,
    schedule ? frameH * 0.019 + scheduleH : 0
  )
  const topLimit = topEdge > 0 ? topEdge + frameH * 0.018 : frameH * 0.04

  const remainingH = capBlock(remaining, 'remaining', 0.24)
  const costH = capBlock(cost, 'cost', 0.24)
  const footerH = Math.max(remainingH, costH)
  const bottomLimit = frameH - frameH * 0.036 - footerH - frameH * 0.018

  let headingH = heading?.height ?? 0
  let timeH = time?.height ?? 0
  let eventH = event?.height ?? 0
  let headingDelta = heading?.delta ?? 0
  let timeDelta = time?.delta ?? 0

  const headingCenterOf = (): number => frameH * 0.304 - headingDelta / 2 - timeDelta / 2
  const timeCenterOf = (): number => frameH * 0.5135
  const eventTopOf = (): number => frameH * 0.6667 + timeDelta / 2

  const stackTop = (): number => {
    if (heading) return headingCenterOf() - headingH / 2
    if (time) return timeCenterOf() - timeH / 2
    return event ? eventTopOf() : topLimit
  }
  const stackBottom = (): number => {
    if (event) return eventTopOf() + eventH
    if (time) return timeCenterOf() + timeH / 2
    return heading ? headingCenterOf() + headingH / 2 : bottomLimit
  }

  let shift = 0
  if (stackTop() < topLimit) shift += topLimit - stackTop()
  if (stackBottom() + shift > bottomLimit) shift -= stackBottom() + shift - bottomLimit

  const overflow = Math.max(0, topLimit - (stackTop() + shift), stackBottom() + shift - bottomLimit)
  if (overflow > 0.5) {
    const stackH = Math.max(1, stackBottom() - stackTop())
    const available = Math.max(frameH * 0.2, bottomLimit - topLimit)
    const squeeze = Math.max(0.35, Math.min(1, available / stackH))
    for (const key of ['heading', 'time', 'event'] as const) {
      if (items[key]) fit[key] *= squeeze
    }
    const scaleDelta = (delta: number): number => delta > 0 ? delta * squeeze : delta
    headingH *= squeeze
    timeH *= squeeze
    eventH *= squeeze
    headingDelta = scaleDelta(headingDelta)
    timeDelta = scaleDelta(timeDelta)
    shift = 0
    if (stackTop() < topLimit) shift += topLimit - stackTop()
    if (stackBottom() + shift > bottomLimit) shift -= stackBottom() + shift - bottomLimit
  }

  const top: ScenePlacement['top'] = {}
  if (heading) top.heading = headingCenterOf() + shift
  if (time) top.time = timeCenterOf() + shift
  if (event) top.event = eventTopOf() + shift
  return { fit, top }
}

export function baseFontSize(frameW: number, frameH: number, cqw: number, cqh: number): number {
  return cq(frameW, frameH, cqw, cqh)
}
