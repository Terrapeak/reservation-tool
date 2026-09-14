import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('canonical callback notification preference is tenant-scoped with safe defaults', async () => {
  const migration = await read('../supabase/migrations/20260914100000_callback_notification_preferences.sql')
  assert.match(migration, /reservation_business_settings/)
  assert.match(migration, /callback_notifications jsonb not null/i)
  assert.match(migration, /enabled.*true/i)
  assert.match(migration, /recipient_mode.*owner_admin/i)
  assert.doesNotMatch(migration, /recipient_user_ids|email_addresses/i)
})

test('settings UI uses the existing authenticated reservation settings write path', async () => {
  const source = await read('../src/restaurant-settings.js')
  assert.match(source, /callbackNotificationsForm/)
  assert.match(source, /callback_notifications/)
  assert.match(source, /recipient_mode:'owner_admin'/)
  assert.match(source, /active company owners and administrators/)
  assert.doesNotMatch(source, /selected company members|recipientUserIds|email input/i)
})

