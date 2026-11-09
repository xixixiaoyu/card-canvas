import { expect, test } from '@playwright/test'

test('capture and keyboard placement sync across tabs', async ({ context }) => {
  const pageA = await context.newPage()
  const pageB = await context.newPage()

  await pageA.goto('/')
  await pageB.goto('/')
  await expect(pageA.locator('[data-world-item]')).toHaveCount(3)
  await expect(pageB.locator('[data-world-item]')).toHaveCount(3)

  await pageA.keyboard.press('Control+k')
  await pageA.getByLabel('卡片标题').fill('跨标签页同步')
  await pageA.getByLabel('卡片正文').fill('A 页捕获，B 页抽屉应立即出现。')
  await pageA.keyboard.press('Control+Enter')

  const inboxB = pageB.locator('button[aria-label^="待整理池，"]')
  await expect(inboxB).toContainText('1')

  await inboxB.click()
  const card = pageB
    .locator('[data-inbox-card]')
    .filter({ hasText: '跨标签页同步' })
  await expect(card).toHaveCount(1)
  await card.focus()
  await pageB.keyboard.press('Enter')

  await expect(pageB.locator('[data-world-item]')).toHaveCount(4)
  await expect(pageB.locator('[data-inbox-card]')).toHaveCount(0)
  await expect(pageA.locator('[data-world-item]')).toHaveCount(4)

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
