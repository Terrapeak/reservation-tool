import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/migrations/20260924120000_terrapeak_customer_form_reconciliation.sql', import.meta.url)

test('Terrapeak reconciliation is restricted to business 10 and the approved IDs', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /business_id\s*=\s*10/g)
  assert.match(sql, /array\[278,279,280,281,282,283,284,285,286,287,288,289,290\]/)
  assert.doesNotMatch(sql, /field_label|where\s+.*label/i)
})

test('reconciliation targets exactly the approved retirement IDs', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const targetMatch = sql.match(/target_ids\s+bigint\[\]\s*:=\s*array\[([^\]]+)\]/i)
  assert.ok(targetMatch)
  assert.deepEqual(
    targetMatch[1].split(',').map((value) => Number(value.trim())),
    [278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290],
  )
  assert.match(sql, /where\s+business_id\s*=\s*10\s+and\s+id\s*=\s*any\(target_ids\)/i)
})

test('retained active legacy IDs cannot enter the retirement target', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const targetMatch = sql.match(/target_ids\s+bigint\[\]\s*:=\s*array\[([^\]]+)\]/i)
  assert.ok(targetMatch)
  const targetIds = targetMatch[1].split(',').map((value) => Number(value.trim()))
  assert.deepEqual(targetIds.filter((id) => [218, 219, 273, 274, 275, 276, 277].includes(id)), [])
  assert.doesNotMatch(sql, /id\s*(?:in|=\s*any)\s*[^;]*(?:218|219|273|274|275|276|277)/i)
})

test('existing inactive legacy IDs cannot enter the retirement target', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const targetMatch = sql.match(/target_ids\s+bigint\[\]\s*:=\s*array\[([^\]]+)\]/i)
  assert.ok(targetMatch)
  const targetIds = targetMatch[1].split(',').map((value) => Number(value.trim()))
  assert.deepEqual(targetIds.filter((id) => [217, 220, 221, 222, 223, 262, 263, 264].includes(id)), [])
  assert.doesNotMatch(sql, /id\s*(?:in|=\s*any)\s*[^;]*(?:217|220|221|222|223|262|263|264)/i)
})

test('reconciliation requires the approved preconditions before updating', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /total_count\s*<>\s*31/)
  assert.match(sql, /active_count\s*<>\s*23/)
  assert.match(sql, /inactive_count\s*<>\s*8/)
  assert.match(sql, /matching_count\s*<>\s*13/)
  assert.match(sql, /field_source\s*=\s*'legacy'/)
  assert.match(sql, /is_active/)
})

test('reconciliation changes only active state for the explicit target rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /set\s+is_active\s*=\s*false/i)
  assert.doesNotMatch(sql, /set\s+field_source/i)
  assert.doesNotMatch(sql, /set\s+template_key/i)
  assert.doesNotMatch(sql, /set\s+template_field_key/i)
  assert.doesNotMatch(sql, /delete\s+from/i)
})

test('reconciliation has exact postconditions and expected counts', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /updated_count\s*<>\s*13/)
  assert.match(sql, /not\s+is_active\)\s*<>\s*13/)
  assert.match(sql, /active\)\s*<>\s*10/)
  assert.match(sql, /not\s+is_active\)\s*<>\s*21/)
})

test('reconciliation does not touch booking history or unrelated data', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.doesNotMatch(sql, /bookings|class_enrollments|custom_data/i)
  assert.doesNotMatch(sql, /services|providers|availability|reservation_business_settings/i)
  assert.doesNotMatch(sql, /insert\s+into|delete\s+from/i)
})

test('reconciliation is transactional through one guarded DO block', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /^\s*--[\s\S]*?do\s*\$\$/i)
  assert.match(sql, /raise\s+exception/gi)
  assert.match(sql, /get\s+diagnostics\s+updated_count\s*=\s*row_count/i)
})
