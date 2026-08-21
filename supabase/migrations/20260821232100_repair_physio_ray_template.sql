-- Repair the disposable Physio Ray test tenant created before template-aware service defaults.
update public.businesses
set business_type = 'physiotherapy'
where business_slug = 'physio-ray';

update public.business_profile p
set business_type = 'physiotherapy',
    industry_template = 'physiotherapy',
    booking_label = 'Appointment',
    capacity_label = 'People',
    uses_capacity = false
from public.businesses b
where p.business_id = b.id and b.business_slug = 'physio-ray';

update public.services s
set name = 'Physiotherapy Appointment',
    slug = 'physiotherapy-appointment',
    description = 'Book a physiotherapy appointment.',
    duration_minutes = 60,
    capacity = 1
from public.businesses b
where s.business_id = b.id
  and b.business_slug = 'physio-ray'
  and s.booking_type = 'restaurant'
  and s.is_active = true;

update public.booking_custom_fields f
set field_options = E'1\n2\n3\n4\n5\n6\n7\n8\n9\n10'
from public.businesses b
where f.business_id = b.id
  and b.business_slug = 'physio-ray'
  and f.field_label = 'Pain level';
