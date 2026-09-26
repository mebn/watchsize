import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { expect, test } from 'vitest'
import { detect } from './detect'

test('finds the case edges of the SRPE51 example, excluding the crown', () => {
  const png = PNG.sync.read(readFileSync('example/seiko-srpe51.png'))
  const d = detect(png)
  // Case spans roughly x 223..860, crown reaches ~895
  expect(d.caseLeft).toBeGreaterThan(210)
  expect(d.caseLeft).toBeLessThan(240)
  expect(d.caseRight).toBeGreaterThan(840)
  expect(d.caseRight).toBeLessThan(875)
  expect(d.bbox.x + d.bbox.w).toBeGreaterThan(880)
  expect(d.plain).toBe(true)
})
