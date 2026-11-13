import { expect, test } from '@playwright/test'

async function pasteText(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((value) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', value)
    document.body.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    )
  }, text)
}

test('pasting text on the canvas creates one undoable card', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await pasteText(page, '剪贴板标题\n\n这是粘贴进来的正文。 #测试')

  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  const card = page
    .locator('[data-world-item]')
    .filter({ hasText: '剪贴板标题' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('这是粘贴进来的正文。')
  await expect(card.locator('h2')).toHaveCount(0)
  await expect(card.locator('[data-filter-tag="测试"]')).toBeVisible()

  const notice = page.getByRole('status').filter({ hasText: '已粘贴为卡片' })
  await notice.getByRole('button', { name: '撤销' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
})

test('pasting inside an editable field never creates a canvas card', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.getByRole('button', { name: '打开速记' }).click()
  const dialog = page.locator('[data-quick-capture]')
  const content = dialog.getByLabel('卡片正文')
  await expect(content).toBeFocused()

  await content.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', '输入框中的内容')
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    )
  })

  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
})

test('editing a titleless pasted card keeps the title empty', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await pasteText(page, '第一行仍是正文\n\n第二段内容')
  const card = page
    .locator('[data-world-item]')
    .filter({ hasText: '第一行仍是正文' })
  await expect(card).toBeVisible()
  await expect(card.locator('h2')).toHaveCount(0)

  await card.focus()
  await card.getByRole('button', { name: '编辑卡片' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('卡片标题')).toHaveValue('')
  await dialog
    .getByLabel('卡片正文')
    .fill('第一行仍是正文\n\n第二段内容\n\n补充内容')
  await page.keyboard.press('Control+Enter')

  await expect(card).toContainText('补充内容')
  await expect(card.locator('h2')).toHaveCount(0)
  await page.reload()
  await expect(
    page.locator('[data-world-item]').filter({ hasText: '补充内容' }),
  ).toBeVisible()
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ hasText: '补充内容' })
      .locator('h2'),
  ).toHaveCount(0)
})

test('pasting an image creates a card with an undoable attachment', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('[data-world-item]')).toHaveCount(3)

  await page.evaluate(async () => {
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
    transfer.items.add(
      new File([blob], 'canvas-paste.png', { type: 'image/png' }),
    )
    document.body.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    )
  })

  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  const card = page.locator('[data-world-item]').filter({
    has: page.locator('.atomic-image img'),
  })
  await expect(card).toBeVisible()
  await expect(card.locator('h2')).toHaveCount(0)
  await expect(card.locator('.atomic-image img')).toBeVisible()

  const notice = page
    .getByRole('status')
    .filter({ hasText: '图片已粘贴为卡片' })
  await notice.getByRole('button', { name: '撤销' }).click()
  await expect(page.locator('[data-world-item]')).toHaveCount(3)
  await expect(card).toHaveCount(0)

  await page.locator('header button[aria-label="重做"]').click()
  await expect(card).toHaveCount(1)
  await expect(card.locator('.atomic-image img')).toBeVisible()

  await page.reload()
  await expect(page.locator('[data-world-item]')).toHaveCount(4)
  await expect(
    page
      .locator('[data-world-item]')
      .filter({ has: page.locator('.atomic-image img') })
      .locator('.atomic-image img'),
  ).toBeVisible()
})
