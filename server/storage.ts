import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

export function read<T>(file: string): T[] {
  const filepath = path.join(DATA_DIR, `${file}.json`)
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

export function write<T>(file: string, data: T[]): void {
  const filepath = path.join(DATA_DIR, `${file}.json`)
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
}

export function findById<T extends { id: string }>(file: string, id: string): T | undefined {
  return read<T>(file).find(item => item.id === id)
}

export function upsert<T extends { id: string }>(file: string, item: T): T {
  const items = read<T>(file)
  const idx = items.findIndex(i => i.id === item.id)
  if (idx >= 0) {
    items[idx] = item
  } else {
    items.push(item)
  }
  write(file, items)
  return item
}

export function remove(file: string, id: string): boolean {
  const items = read<{ id: string }>(file)
  const filtered = items.filter(i => i.id !== id)
  if (filtered.length === items.length) return false
  write(file, filtered)
  return true
}
