import { expect, test, type Page } from '@playwright/test'

async function marquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  shift = false,
) {
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 10,
      from.y + ((to.y - from.y) * step) / 10,
    )
  }
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(250)
}

async function connect(page: Page, fromIndex: number, toIndex: number) {
  const cards = page.locator('[data-world-item]')
  const source = cards.nth(fromIndex)
  await source.locator('h2').click()
  const handle = await source.locator('.link-handle').boundingBox()
  const target = await cards.nth(toIndex).boundingBox()
  const sx = handle!.x + handle!.width / 2
  const sy = handle!.y + handle!.height / 2
  const tx = target!.x + target!.width / 2
  const ty = target!.y + target!.height / 2

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(
      sx + ((tx - sx) * step) / 10,
      sy + ((ty - sy) * step) / 10,
    )
  }
  await page.mouse.up()
  await expect(page.locator('[data-line]')).toHaveCount(1)
}

async function cardBounds(page: Page) {
  const boxes = await page
    .locator('[data-world-item]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
        }
      }),
    )

  return {
    x: Math.min(...boxes.map((box) => box.x)),
    y: Math.min(...boxes.map((box) => box.y)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  }
}

test('marquee selects, unions, collapses and clears', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)

  const bounds = await cardBounds(page)
  const all = {
    x: Math.max(10, bounds.x - 28),
    y: Math.max(66, bounds.y - 22),
    right: Math.min(1270, bounds.right + 24),
    bottom: Math.min(650, bounds.bottom + 22),
  }
  await marquee(page, { x: all.x, y: all.y }, { x: all.right, y: all.bottom })

  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)
  await expect(page.locator('.selection-toolbar')).toContainText('3 SELECTED')
  await expect(page.locator('.selection-bounds')).toHaveCount(1)

  // Clicking one selected card without moving collapses to a single selection.
  await page.locator('[data-world-item]').nth(0).click()
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(1)

  // Shift-click adds a second card; the toolbar reflects it.
  await page
    .locator('[data-world-item]')
    .nth(1)
    .click({
      modifiers: ['Shift'],
    })
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(2)
  await expect(page.locator('.selection-toolbar')).toContainText('2 SELECTED')

  // Shift-marquee unions a new card into the existing selection.
  await page.mouse.click(900, 680)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)
  await page.locator('[data-world-item]').nth(0).click()
  const second = await page.locator('[data-world-item]').nth(1).boundingBox()
  await marquee(
    page,
    { x: Math.max(10, second!.x - 20), y: Math.max(66, second!.y - 18) },
    {
      x: Math.min(1270, second!.x + second!.width + 18),
      y: Math.min(650, second!.y + second!.height + 18),
    },
    true,
  )
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(2)

  // Clicking blank clears the selection.
  await page.mouse.click(900, 680)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)
  await expect(page.locator('.selection-toolbar')).toHaveCount(0)
})

test('single selected card exposes Markdown copy in its action row', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = page.locator('[data-world-item]').first()
  await card.locator('h2').click()
  await expect(card).toHaveClass(/is-selected/)
  await expect(page.locator('.selection-toolbar')).toHaveCount(0)

  const copy = card.getByRole('button', { name: '复制卡片为 Markdown' })
  await expect(copy).toBeVisible()
  await copy.click()

  await expect(page.getByText('已复制 1 张卡片大纲到剪贴板。')).toBeVisible()
  await expect(
    card.getByRole('button', { name: '已复制 Markdown' }),
  ).toBeVisible()
  const markdown = await page.evaluate(() => navigator.clipboard.readText())
  expect(markdown).toContain('### 声音的支点，与防御的回声')
})

test('marquee is scale-independent and yields to space/middle pan', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const zoomButton = page.locator('[aria-label^="当前缩放"]')
  const zoomOut = page.getByRole('button', { name: '缩小画布' })
  await zoomButton.click()
  await page.waitForTimeout(300)
  for (let step = 0; step < 4; step += 1) {
    await zoomOut.click()
    await page.waitForTimeout(100)
  }

  const bounds = await cardBounds(page)
  await marquee(
    page,
    { x: Math.max(10, bounds.x - 20), y: Math.max(66, bounds.y - 18) },
    {
      x: Math.min(1270, bounds.right + 18),
      y: Math.min(650, bounds.bottom + 18),
    },
  )
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)

  await page.mouse.click(900, 680)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)

  await page.keyboard.down('Space')
  await page.mouse.move(600, 600)
  await page.mouse.down()
  await page.mouse.move(700, 620, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect(page.locator('.marquee-box')).toHaveCount(0)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)

  await page.mouse.move(500, 580)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(420, 560, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
  await expect(page.locator('.marquee-box')).toHaveCount(0)
})

test('selection cluster copies a connected Markdown synthesis', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await connect(page, 0, 1)
  const bounds = await cardBounds(page)
  await marquee(
    page,
    { x: Math.max(10, bounds.x - 24), y: Math.max(66, bounds.y - 20) },
    {
      x: Math.min(1270, bounds.right + 20),
      y: Math.min(650, bounds.bottom + 20),
    },
  )

  await expect(page.locator('.selection-toolbar')).toContainText('3 SELECTED')
  const copy = page.getByRole('button', { name: '复制 Markdown' })
  await expect(copy).toBeVisible()
  await copy.click()

  await expect(page.getByText('已复制 3 张卡片大纲到剪贴板。')).toBeVisible()
  const markdown = await page.evaluate(() => navigator.clipboard.readText())
  expect(markdown).toContain('### 声音的支点，与防御的回声')
  expect(markdown).toContain('### 边界不是墙，是可移动的膜')
  expect(markdown).toContain('#心理学/防御机制')
  expect(markdown).toContain('> ↳ 关联 [边界不是墙，是可移动的膜]')
  expect(markdown).toContain('---')
})

test('multi-selection can remove every selected card from the current board as one action', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const bounds = await cardBounds(page)
  await marquee(
    page,
    { x: Math.max(10, bounds.x - 24), y: Math.max(66, bounds.y - 20) },
    {
      x: Math.min(1270, bounds.right + 20),
      y: Math.min(650, bounds.bottom + 20),
    },
  )
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(3)

  await page.getByRole('button', { name: '批量处理选中卡片' }).click()
  const dialog = page.locator('[data-batch-delete-dialog]')
  await expect(dialog).toContainText('处理 3 张卡片')
  await dialog.locator('[data-batch-remove]').click()

  await expect(page.getByText('已从当前白板移除 3 张卡片。')).toBeVisible()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)

  await page.locator('header button[aria-label="撤销"]').click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
})

test('multi-selection can move every selected card into trash and undo once', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const bounds = await cardBounds(page)
  await marquee(
    page,
    { x: Math.max(10, bounds.x - 24), y: Math.max(66, bounds.y - 20) },
    {
      x: Math.min(1270, bounds.right + 20),
      y: Math.min(650, bounds.bottom + 20),
    },
  )

  await page.getByRole('button', { name: '批量处理选中卡片' }).click()
  await page.locator('[data-batch-delete-all]').click()
  await expect(page.getByText('已将 3 张卡片移入回收站。')).toBeVisible()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)

  await page.getByRole('button', { name: '数据与备份' }).click()
  await page.getByRole('menuitem', { name: '回收站' }).click()
  const trash = page.locator('[data-trash-modal]')
  await expect(trash.locator('[data-trash-card]')).toHaveCount(3)
  await trash.getByRole('button', { name: '关闭回收站' }).click()

  await page.locator('header button[aria-label="撤销"]').click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
})
