import { expect, test, type Page } from '@playwright/test'

async function createBoard(page: Page, name: string) {
  await page.getByRole('button', { name: '切换白板' }).click()
  const menu = page.getByRole('menu', { name: '白板列表' })
  await menu.getByLabel('新白板名称').fill(name)
  await menu.getByRole('button', { name: '新建' }).click()
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    name,
  )
}

async function switchBoard(page: Page, name: string) {
  await page.getByRole('button', { name: '切换白板' }).click()
  await page
    .getByRole('menu', { name: '白板列表' })
    .getByRole('button', { name })
    .click()
  await expect(page.getByRole('button', { name: '切换白板' })).toContainText(
    name,
  )
}

async function capture(page: Page, title: string, content: string) {
  await page.keyboard.press('Control+k')
  await page.getByLabel('卡片标题').fill(title)
  await page.getByLabel('卡片正文').fill(content)
  await page.keyboard.press('Control+Enter')
  await expect(page.getByLabel('卡片标题')).toBeHidden()
}

test('same-titled cards stay isolated across boards, edits and reloads', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await createBoard(page, '隔离 B')
  await capture(page, '同名卡片', 'B 内容')
  await expect(page.locator('[data-world-item]')).toHaveCount(1)

  await createBoard(page, '隔离 C')
  await capture(page, '同名卡片', 'C 内容')
  await expect(page.locator('[data-world-item]')).toHaveCount(1)

  await switchBoard(page, '我的白板')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '同名卡片' }),
  ).toHaveCount(0)

  await switchBoard(page, '隔离 B')
  const bCard = page
    .locator('[data-world-item]')
    .filter({ hasText: '同名卡片' })
  await expect(bCard).toContainText('B 内容')
  await expect(bCard).not.toContainText('C 内容')
  await bCard.locator('h2').click()
  await bCard.getByRole('button', { name: '编辑卡片' }).click()
  await page.getByLabel('卡片正文').fill('B 更新')
  await page.keyboard.press('Control+Enter')
  await expect(bCard).toContainText('B 更新')

  await switchBoard(page, '隔离 C')
  const cCard = page
    .locator('[data-world-item]')
    .filter({ hasText: '同名卡片' })
  await expect(cCard).toContainText('C 内容')
  await expect(cCard).not.toContainText('B 更新')

  await page.reload()
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '同名卡片' }),
  ).toContainText('C 内容')

  await switchBoard(page, '隔离 B')
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '同名卡片' }),
  ).toContainText('B 更新')
})
