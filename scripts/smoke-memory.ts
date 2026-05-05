// Smoke test for the memory module. Runs in-process so we can verify the
// read/write API works against the live vault without booting the HTTP server.
//
//   npx tsx scripts/smoke-memory.ts

import * as memory from '../server/memory.js'

console.log('--- stats ---')
console.log(JSON.stringify(memory.getMemoryStats(), null, 2))
console.log()

const sampleHandle = '@4a4556494c'
console.log(`--- profile for ${sampleHandle} ---`)
const profile = memory.getLeadProfile(sampleHandle)
console.log(profile ? `OK: status=${profile.status} interactions=${profile.interactions.length} marsNotes=${profile.marsNoteIds.length}` : 'NOT FOUND')
console.log()

console.log(`--- formatted context for ${sampleHandle} ---`)
const ctx = memory.getMemoryContext({
  handle: sampleHandle,
  platform: 'x',
  originalPostText: 'Cursor keeps hallucinating function names that do not exist in my repo',
})
console.log(memory.formatContextForPrompt(ctx))
