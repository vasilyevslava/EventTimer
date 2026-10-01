import type { SceneFontFamily } from '../../shared'

export interface SceneFont {
  id: SceneFontFamily
  label: string
  css: string
  italic: boolean
  weights: Array<[number, string]>
}

const sfWeights: Array<[number, string]> = [
  [100, 'Ультратонкий'],
  [200, 'Тонкий'],
  [300, 'Легкий'],
  [400, 'Обычный'],
  [500, 'Средний'],
  [600, 'Полужирный'],
  [700, 'Жирный'],
  [800, 'Тяжелый'],
  [900, 'Черный']
]

export const SCENE_FONTS: SceneFont[] = [
  {
    id: 'sb-sans',
    label: 'SB Sans Display',
    css: 'SB Sans Display',
    italic: false,
    weights: [
      [100, 'Тонкий'],
      [300, 'Легкий'],
      [400, 'Обычный'],
      [600, 'Полужирный'],
      [700, 'Жирный']
    ]
  },
  {
    id: 'sf-pro',
    label: 'SF Pro',
    css: 'SF Pro',
    italic: true,
    weights: sfWeights
  },
  {
    id: 'sf-display',
    label: 'SF Pro Display',
    css: 'SF Pro Display',
    italic: true,
    weights: sfWeights
  },
  {
    id: 'sf-text',
    label: 'SF Pro Text',
    css: 'SF Pro Text',
    italic: true,
    weights: sfWeights
  },
  {
    id: 'sf-rounded',
    label: 'SF Pro Rounded',
    css: 'SF Pro Rounded',
    italic: false,
    weights: sfWeights
  }
]

export function sceneFont(family: string | undefined): SceneFont {
  return SCENE_FONTS.find((font) => font.id === family) ?? SCENE_FONTS[0]
}

export function nearestFontWeight(weight: number, weights: Array<[number, string]>): number {
  return weights.reduce(
    (best, [value]) => Math.abs(value - weight) < Math.abs(best - weight) ? value : best,
    weights[0][0]
  )
}
