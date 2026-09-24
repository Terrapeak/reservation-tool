import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.join(here, "../supabase/migrations/20260924100000_customer_form_provenance.sql"),
  "utf8",
);

describe("Customer Form provenance migration contract", () => {
  it("adds nullable template identity and a legacy-compatible source default", () => {
    assert.match(migration, /add column if not exists field_source text not null default 'legacy'/);
    assert.match(migration, /add column if not exists template_key text/);
    assert.match(migration, /add column if not exists template_field_key text/);
  });

  it("classifies only system_key rows as system and all other existing rows as legacy", () => {
    assert.match(migration, /case when system_key is not null then 'system' else 'legacy' end/);
    assert.match(migration, /field_source = 'legacy' and system_key is not null/);
    assert.doesNotMatch(migration, /field_label/);
    assert.doesNotMatch(migration, /is_active\s*=\s*false/);
    assert.doesNotMatch(migration, /delete\s+from/i);
  });

  it("enforces provenance shape and stable template identity uniqueness", () => {
    assert.match(migration, /booking_custom_fields_provenance_shape_check/);
    assert.match(migration, /booking_custom_fields_business_template_identity_key/);
    assert.match(migration, /where field_source = 'template'/);
  });
});
