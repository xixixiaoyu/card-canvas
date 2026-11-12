import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const required = [
  'dist/index.html',
  'dist/sw.js',
  'dist/manifest.webmanifest',
  'dist/icon-192.png',
  'dist/icon-512.png',
  'dist/icon-maskable-512.png',
]

await Promise.all(required.map((path) => access(resolve(root, path))))

const serviceWorker = await readFile(resolve(root, 'dist/sw.js'), 'utf8')
if (
  !serviceWorker.includes('index.html') ||
  !serviceWorker.includes('precache')
) {
  throw new Error(
    'Generated service worker does not contain an app-shell precache.',
  )
}

const manifest = JSON.parse(
  await readFile(resolve(root, 'dist/manifest.webmanifest'), 'utf8'),
)
if (!Array.isArray(manifest.icons) || manifest.icons.length < 4) {
  throw new Error('PWA manifest is missing installable icons.')
}
