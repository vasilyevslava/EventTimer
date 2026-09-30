import { copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const size = 1024
const radius = Math.round(size * 0.26)
const source = resolve(root, 'resources/icon-source.jpg')
const icon = resolve(root, 'resources/icon.png')
const header = resolve(root, 'src/renderer/src/assets/app-icon.png')

const square = await sharp(source)
  .resize(size, size, { fit: 'cover', position: 'centre' })
  .png()
  .toBuffer()

const mask = Buffer.from(
  `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
)

await sharp(square)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toFile(icon)

await copyFile(icon, header)
console.log('Generated resources/icon.png')
