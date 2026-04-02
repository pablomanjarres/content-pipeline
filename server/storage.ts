import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = process.env.CONTENT_PIPELINE_ROOT || path.join(__dirname, '..')
const DATA_ROOT = path.join(PROJECT_ROOT, 'data')
const CONFIG_PATH = path.join(DATA_ROOT, 'config.json')

function getDataDir(): string {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    const dir = path.join(DATA_ROOT, 'projects', config.activeProject)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  } catch {
    return DATA_ROOT
  }
}

export function read<T>(file: string): T[] {
  const filepath = path.join(getDataDir(), `${file}.json`)
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

export function write<T>(file: string, data: T[]): void {
  const filepath = path.join(getDataDir(), `${file}.json`)
  const tmpPath = filepath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, filepath)
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
