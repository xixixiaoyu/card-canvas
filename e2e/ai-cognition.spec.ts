import { expect, test, type Page } from '@playwright/test'

const AI_CONFIG_KEY = 'card-canvas:deepseek-config'

async function seedAIConfig(page: Page) {
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          apiKey: 'test-deepseek-key',
          baseUrl: '/api/deepseek',
          model: 'deepseek-flash',
          enableWormhole: true,
          enableAutoTags: true,
        }),
      )
    },
    [AI_CONFIG_KEY],
  )
}

test('AI settings validate connectivity and persist the local configuration', async ({
  page,
}) => {
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '数据与备份' }).click()
  await page.getByRole('menuitem', { name: /AI 认知辅助/ }).click()

  const dialog = page.getByRole('dialog', { name: 'AI 认知辅助' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: '申请并充值' }),
  ).toHaveAttribute('href', 'https://platform.deepseek.com/api_keys')
  await expect(dialog.getByLabel('AI 模型')).toBeHidden()
  await dialog.locator('summary').click()
  await expect(dialog.getByLabel('AI 模型')).toHaveValue('deepseek-flash')
  await dialog.getByLabel('DeepSeek API Key').fill('test-ui-key')
  await expect(dialog.getByLabel('DeepSeek API Key')).toHaveAttribute(
    'type',
    'text',
  )
  await expect(dialog.getByLabel('DeepSeek API Key')).toHaveClass(/is-masked/)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '测试连接' }).click()
  await expect(dialog).toContainText('连接正常')

  await dialog.getByRole('button', { name: '保存设置' }).click()
  await expect(dialog).toBeHidden()

  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    AI_CONFIG_KEY,
  )
  expect(stored).toContain('test-ui-key')
})

test('wormhole probe creates a labelled connection that can be undone', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: '两者都通过节律调节恢复自主神经平衡',
            },
          },
        ],
      }),
    })
  })

  await page.goto('/')
  const cards = page.locator('[data-world-item]')
  await expect(cards).toHaveCount(3)

  await cards.nth(0).locator('h2').click()
  await cards
    .nth(1)
    .locator('h2')
    .click({ modifiers: ['Shift'] })
  await expect(page.locator('.selection-toolbar')).toContainText('2 SELECTED')

  await page.getByRole('button', { name: '寻找底层关联' }).click()
  const tray = page.locator('[data-wormhole]')
  await expect(tray).toBeVisible()
  await expect(tray.locator('[data-wormhole-result]')).toHaveText(
    '两者都通过节律调节恢复自主神经平衡',
  )

  await page.keyboard.press('Escape')
  await expect(tray).toBeHidden()
  await page.getByRole('button', { name: '寻找底层关联' }).click()
  await expect(tray.locator('[data-wormhole-result]')).toHaveText(
    '两者都通过节律调节恢复自主神经平衡',
  )
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-line]')).toHaveCount(1)
  await expect(page.locator('.connection-label-pill')).toHaveText(
    '两者都通过节律调节恢复自主神经平衡',
  )

  const undo = page.getByRole('button', { name: '撤销' })
  await expect(undo).toHaveAttribute('title', /建立连线/)
  await undo.click()
  await expect(page.locator('[data-line]')).toHaveCount(0)
})

test('background tag inference closes capture first and enriches labels later', async ({
  page,
}) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '认知科学/节律调节' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('卡片标题').fill('节律自检')
  await dialog.getByLabel('卡片正文').fill('观察呼吸与声音节律如何影响恢复。')
  await page.keyboard.press('Control+Enter')

  await expect(dialog).toBeHidden()
  const card = page.locator('[data-world-item]').filter({ hasText: '节律自检' })
  await expect(card).toBeVisible()
  await expect(
    card.locator('[data-filter-tag="认知科学/节律调节"]'),
  ).toBeVisible({ timeout: 8_000 })
})

test('capture can request tag suggestions before saving', async ({ page }) => {
  await seedAIConfig(page)
  await page.route('**/api/deepseek', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '声乐/共鸣' } }],
      }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  await dialog.getByLabel('卡片标题').fill('共鸣位置')
  await dialog.getByLabel('卡片正文').fill('观察软腭抬起后的高频泛音。')
  await dialog.getByRole('button', { name: 'AI 推荐标签' }).click()
  await expect(dialog).toContainText('#声乐/共鸣')

  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: '共鸣位置' })
      .locator('[data-filter-tag="声乐/共鸣"]'),
  ).toBeVisible()
})
