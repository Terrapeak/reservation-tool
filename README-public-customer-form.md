# Public Customer Form integration

The public booking page reads the saved active Customer Form through `get_public_booking_custom_fields`.
System fields map to canonical booking customer columns. Configurable fields are submitted in `bookings.custom_data`, keyed by Customer Form field id.
The Preview uses the same `/book/:businessSlug` public booking implementation, so Preview and shared booking links remain aligned.
