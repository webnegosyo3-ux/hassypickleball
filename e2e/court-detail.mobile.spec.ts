import { expect, test, type Page } from '@playwright/test'

/**
 * Phone-width layout guarantees for the court detail page.
 *
 * These are viewport questions — jsdom has no layout engine, so nothing here
 * can be asserted in a unit test. Each assertion is a measurement against real
 * computed geometry at a phone viewport.
 */

const COURT_PATH = '/courts/court-01'

/** The smallest comfortable touch target, per WCAG 2.2 target size (minimum). */
const MIN_TAP_TARGET_PX = 44

/** Sub-pixel rounding makes exact width comparisons flaky. */
const OVERFLOW_TOLERANCE_PX = 1

async function measurePageWidth(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

test.describe('court detail on a phone', () => {
  test('the page fits the viewport instead of scrolling sideways', async ({ page }) => {
    await page.goto(COURT_PATH)

    const { scrollWidth, clientWidth } = await measurePageWidth(page)

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + OVERFLOW_TOLERANCE_PX)
  })

  test('no element is pushed past the right edge of the viewport', async ({ page }) => {
    await page.goto(COURT_PATH)

    // The date strip is a deliberate horizontal scroller, so its own children
    // are allowed to sit outside the fold; everything else is not.
    const escaped = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth
      const scroller = document.querySelector('[data-scroll-strip]')

      return Array.from(document.querySelectorAll('body *'))
        .filter((element) => !scroller?.contains(element))
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return box.width > 0 && box.right > viewportWidth + 1
        })
        .map((element) => `${element.tagName}.${element.className}`)
        .slice(0, 10)
    })

    expect(escaped).toEqual([])
  })

  test('the page still fits on the narrowest phones', async ({ page }) => {
    // 320 CSS px is the narrowest viewport in common use (iPhone SE 1st gen).
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(COURT_PATH)

    const { scrollWidth, clientWidth } = await measurePageWidth(page)

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + OVERFLOW_TOLERANCE_PX)
  })

  test('the court name is not squeezed into a narrow column by the price', async ({ page }) => {
    await page.goto(COURT_PATH)

    const heading = page.getByRole('heading', { level: 1 })
    const box = await heading.boundingBox()
    const viewportWidth = page.viewportSize()?.width ?? 0

    expect(box).not.toBeNull()
    // A title sharing a row with the price on a phone leaves it under half the
    // screen; stacked, it gets the full content width.
    expect(box!.width).toBeGreaterThan(viewportWidth * 0.7)
  })

  test('the date and duration controls are comfortably tappable', async ({ page }) => {
    await page.goto(COURT_PATH)

    const controls = [
      page.getByRole('group', { name: 'Booking day' }).getByRole('button').first(),
      page.getByRole('group', { name: 'Session length' }).getByRole('button').first(),
    ]

    for (const control of controls) {
      const box = await control.boundingBox()

      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX)
    }
  })

  test('the confirm button is comfortably tappable before a time is picked', async ({ page }) => {
    await page.goto(COURT_PATH)

    const button = page.getByRole('button', { name: /pick a date and time|confirm booking/i })
    const box = await button.boundingBox()

    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX)
  })
})
