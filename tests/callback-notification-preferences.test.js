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

test('callback preference authorization is narrow and covers insert/update paths', async () => {
  const migration = await read('../supabase/migrations/20260914100000_callback_notification_preferences.sql')
  assert.match(migration, /private\.has_business_role\(new\.business_id, array\['owner', 'admin'\]\)/)
  assert.match(migration, /before insert or update of callback_notifications/i)
  assert.match(migration, /new\.callback_notifications is not distinct from old\.callback_notifications/i)
  assert.match(migration, /current_user = 'service_role'/i)
  assert.match(migration, /using errcode = '42501'/i)
  assert.doesNotMatch(migration, /drop policy.*reservation_business_settings_manager_update/i)
})

