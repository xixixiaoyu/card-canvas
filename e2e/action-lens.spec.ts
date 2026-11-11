import { expect, test, type Page } from '@playwright/test'

async function editContent(page: Page, index: number, content: string) {
  const card = page.locator('[data-world-item]').nth(index)
  await card.hover()
  await card.getByRole('button', { name: '编辑卡片' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.getByLabel('卡片正文').fill(content)
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()
  return card
}

test('renders atomic Markdown and toggles tasks with persistence and undo', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  const card = await editContent(
    page,
    0,
    '**重要** 与 `api()`\n# 标题保持纯文本\n1. 有序第一步\n2. 有序第二步\n- [ ] 第一项\n- [x] 已完成',
  )
  const markdown = card.locator('.atomic-markdown')

  await expect(markdown.locator('strong')).toHaveText('重要')
  await expect(markdown.locator('code')).toHaveText('api()')
  await expect(markdown.locator('h1, h2, h3, h4, h5, h6')).toHaveCount(0)
  await expect(markdown).toContainText('# 标题保持纯文本')
  await expect(markdown.locator('ol.is-ordered .atomic-number')).toHaveText([
    '1',
    '2',
  ])

  await page.mouse.click(900, 680)
  await expect(page.locator('[data-world-item].is-selected')).toHaveCount(0)

  const task = card.getByRole('button', { name: '完成待办：第一项' })
  await task.click()
  await expect(card).not.toHaveClass(/is-selected/)
  await expect(
    card.getByRole('button', { name: '取消完成：第一项' }),
  ).toBeVisible()
  await expect(
    card.locator('.atomic-list-copy').filter({ hasText: '第一项' }),
  ).toHaveCSS('text-decoration-line', 'line-through')

  const undoButton = page.getByRole('button', { name: '撤销' })
  await expect(undoButton).toHaveAttribute('title', /完成待办/)
  await page.keyboard.press('Control+z')
  await expect(
    card.getByRole('button', { name: '完成待办：第一项' }),
  ).toBeVisible()

  await card.getByRole('button', { name: '完成待办：第一项' }).click()
  await expect(undoButton).toHaveAttribute('title', /完成待办/)

  await page.reload()
  await expect(
    page
      .locator('[data-world-item]')
      .first()
      .getByRole('button', { name: '取消完成：第一项' }),
  ).toBeVisible()
})

test('action lens collects pending tasks and flies to their cards', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await editContent(page, 0, '- [ ] 第一项行动')
  await editContent(page, 1, '- [ ] 第二项行动')
  await editContent(page, 2, '- [ ] 第三项行动')

  const lensButton = page.getByRole('button', {
    name: '行动透镜，3 个待办',
  })
  await expect(lensButton).toBeVisible()
  await lensButton.click()

  const lens = page.locator('[data-action-lens]')
  await expect(lens).toBeVisible()
  await expect(lens.locator('[data-action-task]')).toHaveCount(3)

  await lens.locator('[data-action-task]').first().click()
  await expect(lens).toBeHidden()
  await expect(page.locator('[data-card-pulse]')).toHaveCount(1)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '第一项行动' }),
  ).toHaveClass(/is-selected/)
  const viewport = page.viewportSize()
  const box = await page
    .locator('[data-world-item]')
    .filter({ hasText: '第一项行动' })
    .boundingBox()
  expect(viewport).not.toBeNull()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThan(
    5,
  )
  expect(
    Math.abs(box!.y + box!.height / 2 - viewport!.height / 2),
  ).toBeLessThan(5)

  await page.getByRole('button', { name: '行动透镜，3 个待办' }).click()
  await page.locator('[data-action-task-toggle]').first().click()
  await expect(
    page.getByRole('button', { name: '行动透镜，2 个待办' }),
  ).toBeVisible()
  await expect(
    page
      .locator('[data-world-item]')
      .first()
      .getByRole('button', { name: '取消完成：第一项行动' }),
  ).toBeVisible()
})

test('hover shows a lightweight preview while click opens the full lens', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await editContent(page, 0, '- [ ] 第一项行动\n- [ ] 第二项行动')
  await editContent(page, 1, '- [ ] 第三项行动')
  await editContent(page, 2, '- [ ] 第四项行动')

  const lensButton = page.getByRole('button', {
    name: '行动透镜，4 个待办',
  })
  const preview = page.locator('[data-action-preview]')

  await lensButton.hover()
  await page.waitForTimeout(220)
  await expect(preview).toHaveCount(0)
  await expect(preview).toBeVisible()
  await expect(preview.locator('[data-action-preview-task]')).toHaveCount(3)
  await expect(preview).toContainText('还有 1 条待办')

  await lensButton.click()
  await expect(preview).toBeHidden()
  const lens = page.locator('[data-action-lens]')
  await expect(lens).toBeVisible()
  await expect(lens.locator('[data-action-task]')).toHaveCount(4)
})

test('hover does not open an empty action preview', async ({ page }) => {
  await page.goto('/')
  const lensButton = page.getByRole('button', {
    name: '行动透镜，无待办',
  })

  await lensButton.hover()
  await page.waitForTimeout(550)
  await expect(page.locator('[data-action-preview]')).toHaveCount(0)
})
