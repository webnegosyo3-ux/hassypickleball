import { expect, test } from '@playwright/test'

/**
 * The catalog at phone width.
 *
 * jsdom has no layout engine, so "two courts side by side" only means something
 * when a browser measures it — and a card too wide for its column would make the
 * whole page scroll sideways, which no unit test can see.
 */
test('shows the courts two up, without pushing the page sideways', async ({ page }) => {
  await page.goto('/')

  const cards = page.locator('#courts article')
  await expect(cards).toHaveCount(4)

  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  const viewport = page.viewportSize()

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(viewport).not.toBeNull()

  // Same row, one column apart, each about half the screen.
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(2)
  expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0)
  expect(first?.width ?? 0).toBeLessThan((viewport?.width ?? 0) / 2)

  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )

  expect(scrollsSideways).toBe(false)
})

/** The narrowest phone still worth supporting: two 138px columns plus gaps. */
test.describe('on a 320px screen', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test('keeps two courts per row without spilling past the edge', async ({ page }) => {
    await page.goto('/')

    const cards = page.locator('#courts article')
    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()

    expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(2)
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0)

    const scrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(scrollsSideways).toBe(false)
  })
})
