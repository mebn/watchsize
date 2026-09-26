import type { Processed } from './image'

export interface Item extends Processed {
  id: string
  name: string
  /** Case width in mm */
  diameter: number
  /** Case centre on the sheet, mm from the top left */
  x: number
  y: number
  ghost?: boolean
  raw?: Blob
}

export const SHEET_W = 210
export const SHEET_H = 297
/** CSS pixels per CSS millimetre */
export const CSS_MM = 96 / 25.4

/** Millimetres per image pixel */
export const mmPerPx = (i: Pick<Item, 'diameter' | 'caseLeft' | 'caseRight'>) =>
  i.diameter / Math.max(1, i.caseRight - i.caseLeft)
