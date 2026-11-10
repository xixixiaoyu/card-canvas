import { expect, test } from '@playwright/test'

test('? opens the shortcut map and Escape closes it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.keyboard.type('?')
  const dialog = page.getByRole('dialog', { name: '快捷键备忘录' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-shortcut-group]')).toHaveCount(4)
  await expect(dialog).toContainText('Capture')
  await expect(dialog).toContainText('Navigate')
  await expect(dialog).toContainText('Focus')
  await expect(dialog).toContainText('Compose')
  await expect(dialog).toContainText('v1.1.0')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('? inside an input never opens the shortcut map', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+k')
  const title = page.getByLabel('卡片标题')
  await expect(title).toBeVisible()
  await title.fill('')
  await page.keyboard.type('?')

  await expect(title).toHaveValue('?')
  await expect(page.getByRole('dialog', { name: '快捷键备忘录' })).toHaveCount(
    0,
  )

  await page.keyboard.press('Escape')
  await expect(title).toBeHidden()
})

test('HUD help opens the map and the backdrop closes it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '查看快捷键' }).click()
  const dialog = page.getByRole('dialog', { name: '快捷键备忘录' })
  await expect(dialog).toBeVisible()

  await page.locator('.shortcut-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(dialog).toBeHidden()
})

test('an empty board invites the first capture and fades away', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill('封版空板')
  await menu.getByRole('button', { name: '新建' }).click()

  await expect(page.locator('[data-world-item]')).toHaveCount(0)
  const empty = page.locator('[data-empty-state]')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('空白也是一块画布')
  await empty.getByRole('button', { name: '捕获第一张卡片' }).click()

  await expect(page.getByLabel('卡片标题')).toBeVisible()
  await page.getByLabel('卡片标题').fill('第一块灵感')
  await page.keyboard.press('Control+Enter')

  await expect(page.locator('[data-world-item]')).toHaveCount(1)
  await expect(empty).toBeHidden()
  await expect(page.locator('[data-world-item]')).toContainText('第一块灵感')
})

test('v1.1.0 metadata is present in the shell and document head', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.brand-subtitle')).toContainText('v1.1.0')
  await expect(
    page.locator('footer').filter({ hasText: 'Local-first' }),
  ).toContainText('v1.1.0')

  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    'content',
    'Card Canvas',
  )
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
})
