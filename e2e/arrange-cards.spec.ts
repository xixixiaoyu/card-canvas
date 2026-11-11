import { expect, test, type Page } from '@playwright/test'

function readWorldPositions(page: Page) {
  return page.locator('[data-world-item]').evaluateAll((elements) =>
    elements
      .map((element) => ({
        id: element.getAttribute('data-item-id') ?? '',
        x: Number.parseFloat((element as HTMLElement).style.left),
        y: Number.parseFloat((element as HTMLElement).style.top),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}

test('one-click arrange tidies card positions as one undoable action', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  const before = await readWorldPositions(page)

  await page.getByRole('button', { name: '一键整理当前白板' }).click()
  const undo = page.locator('header button[aria-label="撤销"]')
  await expect(undo).toHaveAttribute('title', /整理当前白板/)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)

  const after = await readWorldPositions(page)
  expect(after).not.toEqual(before)

  await undo.click()
  await expect.poll(() => readWorldPositions(page)).toEqual(before)
})
