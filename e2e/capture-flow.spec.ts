import { expect, test } from '@playwright/test'

test('capture lands directly on the canvas and survives reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('卡片正文')).toBeFocused()
  await page.getByLabel('卡片标题').fill('E2E 速记')
  await page.getByLabel('卡片正文').fill('捕获即上板，不再经过待整理池。')
  await page.getByLabel('添加标签').fill('E2E')
  await page.getByLabel('添加标签').press('Enter')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const placed = page
    .locator('[data-world-item]')
    .filter({ hasText: 'E2E 速记' })
  await expect(placed).toHaveCount(1)
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(placed).toHaveClass(/is-selected/)

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: 'E2E 速记' }),
  ).toHaveCount(1)
})

test('new captures land beside the selected card', async ({ page }) => {
  await page.setViewportSize({ width: 1764, height: 965 })
  await page.goto('/')

  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill('落位测试板')
  await menu.getByRole('button', { name: '新建' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  await page.waitForTimeout(350)

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('卡片标题').fill('第一张')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('[data-world-item]')).toHaveCount(1)
  await page.waitForTimeout(350)

  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('卡片标题')).toHaveValue('')
  await page.getByLabel('卡片标题').fill('第二张')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-world-item]')).toHaveCount(2)
  await page.waitForTimeout(600)

  const first = await page
    .locator('[data-world-item]')
    .filter({ hasText: '第一张' })
    .boundingBox()
  const second = await page
    .locator('[data-world-item]')
    .filter({ hasText: '第二张' })
    .boundingBox()

  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.x).toBeGreaterThan(first!.x + first!.width + 8)
  expect(second!.x - (first!.x + first!.width)).toBeLessThan(120)
})

test('slash commands insert list and task syntax', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.press('Control+k')
  const content = page.getByLabel('卡片正文')
  await expect(content).toBeVisible()

  await content.fill('/')
  const menu = page.locator('[data-slash-menu]')
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-slash-option]')).toHaveCount(3)

  await menu.getByRole('option', { name: /任务清单/ }).click()
  await expect(content).toHaveValue('- [ ] ')

  await content.fill('/ul')
  await page
    .locator('[data-slash-menu]')
    .getByRole('option', { name: /无序列表/ })
    .click()
  await expect(content).toHaveValue('- ')

  await content.fill('/ol')
  await page
    .locator('[data-slash-menu]')
    .getByRole('option', { name: /有序列表/ })
    .click()
  await expect(content).toHaveValue('1. ')

  await page.mouse.move(0, 0)
  await content.fill('/')
  const keyboardMenu = page.locator('[data-slash-menu]')
  await expect(
    keyboardMenu.getByRole('option', { name: /任务清单/ }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(
    keyboardMenu.getByRole('option', { name: /有序列表/ }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(content).toHaveValue('1. ')
})

test('Enter continues Markdown lists and Shift+Enter stays a plain newline', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.getByRole('button', { name: '打开速记' }).click()
  const content = page.getByLabel('卡片正文')
  await expect(content).toBeFocused()

  await content.fill('- 第一项')
  await content.press('Enter')
  await expect(content).toHaveValue('- 第一项\n- ')

  await content.fill('3. 第三项')
  await content.press('Enter')
  await expect(content).toHaveValue('3. 第三项\n4. ')

  await content.fill('- [x] 已完成')
  await content.press('Enter')
  await expect(content).toHaveValue('- [x] 已完成\n- [ ] ')

  await content.fill('前文\n- [ ] ')
  await content.press('Enter')
  await expect(content).toHaveValue('前文\n')

  await content.fill('- 不续写')
  await content.press('Shift+Enter')
  await expect(content).toHaveValue('- 不续写\n')
})

test('pasted images are compressed, saved with the card and survive reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.canvas-stage')).toHaveClass(/is-ready/)
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.getByRole('dialog')
  const content = dialog.getByLabel('卡片正文')
  await expect(content).toBeFocused()

  await content.evaluate(async (element) => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    const context = canvas.getContext('2d')!
    context.fillStyle = '#d97706'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('canvas'))),
        'image/png',
      )
    })
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'paste.png', { type: 'image/png' }))
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    )
  })

  await expect(dialog.locator('[data-capture-attachment]')).toHaveCount(1)
  await expect(content).toHaveValue(
    /!\[paste\.webp\]\(attachment:\/\/attachment-/,
  )
  await dialog.getByLabel('卡片标题').fill('图片卡片')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const card = page.locator('[data-world-item]').filter({ hasText: '图片卡片' })
  const image = card.locator('.atomic-image img')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/)

  await page.reload()
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: '图片卡片' })
      .locator('.atomic-image img'),
  ).toBeVisible()

  const reloadedCard = page
    .locator('[data-world-item]')
    .filter({ hasText: '图片卡片' })
  await reloadedCard.locator('h2').click()
  await reloadedCard.getByRole('button', { name: '编辑卡片' }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.getByRole('button', { name: /移除图片 paste\.webp/ }).click()
  await page.keyboard.press('Control+Enter')
  await expect(reloadedCard.locator('.atomic-image img')).toHaveCount(0)

  await page.locator('header button[aria-label="撤销"]').click()
  await expect(reloadedCard.locator('.atomic-image img')).toBeVisible()
})

test('clicking the capture backdrop never discards a non-empty draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await page.keyboard.press('Control+k')

  const dialog = page.locator('[data-quick-capture]')
  const panel = dialog.locator('.capture-panel')
  const title = page.getByLabel('卡片标题')
  const content = page.getByLabel('卡片正文')
  const panelBox = await panel.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(panelBox!.width).toBeGreaterThan(700)
  expect((await content.boundingBox())!.height).toBeGreaterThan(190)
  expect(Math.abs(panelBox!.y + panelBox!.height / 2 - 450)).toBeLessThan(24)

  await title.fill('不要丢掉我')
  await content.fill('正在整理的一段想法')

  await dialog.click({ position: { x: 8, y: 8 } })
  await expect(dialog).toBeVisible()
  await expect(title).toHaveValue('不要丢掉我')
  await expect(content).toHaveValue('正在整理的一段想法')
  await expect(content).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.keyboard.press('Control+k')
  await expect(title).toHaveValue('不要丢掉我')
  await expect(content).toHaveValue('正在整理的一段想法')
})
