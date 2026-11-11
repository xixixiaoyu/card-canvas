import { expect, test } from '@playwright/test'

test('captures and board changes sync across tabs', async ({ context }) => {
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  await pageA.goto('/')
  await pageB.goto('/')
  await expect(pageA.locator('[data-world-item]')).toHaveCount(3)
  await expect(pageB.locator('[data-world-item]')).toHaveCount(3)

  await pageA.keyboard.press('Control+k')
  await pageA.getByLabel('卡片标题').fill('跨标签页同步')
  await pageA.getByLabel('卡片正文').fill('A 页捕获，B 页画布应立即出现。')
  await pageA.keyboard.press('Control+Enter')

  await expect(pageA.locator('[data-world-item]')).toHaveCount(4)
  await expect(pageB.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    pageB.locator('[data-world-item]').filter({ hasText: '跨标签页同步' }),
  ).toHaveCount(1)

  await pageA.reload()
  await expect(pageA.locator('[data-world-item]')).toHaveCount(4)

  await pageA.getByRole('button', { name: '切换白板' }).click()
  const menuA = pageA.getByRole('menu', { name: '白板列表' })
  await menuA.getByLabel('新白板名称').fill('同步板')
  await menuA.getByRole('button', { name: '新建' }).click()
  await expect(pageA.getByRole('button', { name: '切换白板' })).toContainText(
    '同步板',
  )

  await pageB.getByRole('button', { name: '切换白板' }).click()
  await expect(
    pageB
      .getByRole('menu', { name: '白板列表' })
      .getByRole('button', { name: '同步板' }),
  ).toHaveCount(1)
})

test('cross-tab changes invalidate stale undo history', async ({ context }) => {
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  await pageA.goto('/')
  await pageB.goto('/')
  await expect(pageA.locator('[data-world-item]')).toHaveCount(3)
  await expect(pageB.locator('[data-world-item]')).toHaveCount(3)

  await pageB.keyboard.press('Control+k')
  await pageB.getByLabel('卡片标题').fill('B 页本地历史')
  await pageB.keyboard.press('Control+Enter')
  await expect(pageB.locator('[data-world-item]')).toHaveCount(4)
  await expect(pageB.locator('button[aria-label="撤销"]')).toBeEnabled()

  await pageA.keyboard.press('Control+k')
  await pageA.getByLabel('卡片标题').fill('A 页远端变化')
  await pageA.keyboard.press('Control+Enter')
  await expect(pageA.locator('[data-world-item]')).toHaveCount(5)
  await expect(
    pageB.locator('[data-world-item]').filter({ hasText: 'A 页远端变化' }),
  ).toHaveCount(1)
  await expect(pageB.locator('button[aria-label="撤销"]')).toBeDisabled()
})
