import { expect, it } from 'vitest'
import { PUBLIC_CUSTOMER_FORM_VERSION } from './public-customer-form-version.js'
it('has a public Customer Form contract version', () => expect(PUBLIC_CUSTOMER_FORM_VERSION).toBe(1))
