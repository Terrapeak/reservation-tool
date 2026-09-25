import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "../supabase/migrations/20260925100000_public_customer_form_provenance_rpc.sql"),
  "utf8",
);

describe("public Customer Form provenance RPC contract", () => {
  it("returns provenance metadata after the existing Customer Form columns", () => {
    assert.match(migration, /returns table\([\s\S]*id bigint[\s\S]*field_label text[\s\S]*field_type text[\s\S]*field_options text[\s\S]*is_required boolean[\s\S]*display_order integer[\s\S]*system_key text[\s\S]*field_source text[\s\S]*template_key text[\s\S]*template_field_key text/);
    assert.match(migration, /f\.system_key, f\.field_source, f\.template_key,\s*f\.template_field_key/);
  });

  it("preserves the public read contract and security boundary", () => {
    assert.match(migration, /language sql/);
    assert.match(migration, /security definer/);
    assert.match(migration, /set search_path = ''/);
    assert.match(migration, /f\.is_active = true/);
    assert.match(migration, /lower\(b\.business_slug\) = lower\(nullif\(btrim\(p_business_slug\), ''\)\)/);
    assert.match(migration, /order by f\.display_order, f\.id/);
    assert.match(migration, /revoke all on function public\.get_public_booking_custom_fields\(text\) from public/);
    assert.match(migration, /grant execute on function public\.get_public_booking_custom_fields\(text\) to anon, authenticated/);
  });

  it("does not mutate Customer Form rows", () => {
    assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into\s+)?public\.booking_custom_fields\b/i);
    assert.doesNotMatch(migration, /backfill|field_label\s*=|is_active\s*=\s*false/i);
  });
});
