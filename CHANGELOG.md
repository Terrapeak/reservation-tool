===================================================
===========v0.1 – Core Booking System==============
===================================================
Customer booking form
Admin dashboard
Create reservations
Cancel reservations
Reservation reference generation
Supabase integration
Basic branding support

===================================================
==========v0.2 – Reservation Management================
===================================================
Reservation search by reference
Reservation status tracking
Confirmed
Completed
Cancelled
No Show
Archive reservations
Restore archived reservations
Permanent deletion with manager password
Dashboard summary cards

===================================================
===========v0.3 – Analytics Dashboard================
===================================================
Analytics page
Date range filtering
Total reservations
Completion rate
Cancellation rate
No-show rate
Archived reservation statistics
Busiest time calculation

===================================================
========v0.4 – Industry Flexibility==============
===================================================
Added business profile settings allowing terminology changes.

Examples:

Restaurant
Reservation
Customer
Guests
Physiotherapy
Appointment
Patient
Patients
Salon
Booking
Client
Guests

Features:

Custom booking label
Custom customer label
Custom capacity label
Dynamic terminology across:
Customer form
Dashboard
Analytics
Search
Cancel flows

===================================================
==========v0.5 – Capacity Tracking Improvements==============
===================================================
Introduced:

Allow Group Bookings

Behavior:

Enabled
Customer form shows:
Number of Guests
Number of Patients
Number of Clients
Capacity tracked in analytics
Capacity cards shown on dashboard
Capacity cards shown in analytics
Disabled
Capacity field hidden
Chatbot can ignore capacity
Capacity analytics hidden
Capacity dashboard cards hidden

===================================================
==========v0.6 – Custom Fields System=============
===================================================
Added custom booking fields:

Supported types:

Text
Number
Date
Time
Long Text
Checkbox
Dropdown

Additional features:

Required fields
Business-specific fields
Answers stored with reservation

===================================================
========v0.7 – Custom Field Management============
===================================================
Added:

Edit Field
Modify label
Modify type
Modify required status
Modify dropdown options
Delete Field
Remove field
Preserve existing reservation answers
Field Ordering
Move Up
Move Down

Custom fields now appear to customers in configured order.

===================================================
========v0.8 – Industry Templates==========
===================================================
Added one-click template generation.

Restaurant
Occasion
Allergies
Seating Preference
Salon
Service Type
Preferred Stylist
Hair Length
Physiotherapy
Main Concern
First Visit
Preferred Therapist
General
Empty template

===================================================
========v0.9 – Scale Dropdown Helper============
===================================================
Added:

Use 1-10 Scale

Automatically generates:

1 - Lowest
2
3
4
5
6
7
8
9
10 - Highest

Useful for:

Pain scales
Satisfaction ratings
Priority ratings
Urgency ratings

===================================================
========v1.0 – Multi-Business Platform============
===================================================
Major milestone.

Introduced:

Business Slugs

Examples:

/dim-sum-dragon
/move-better-physio
/glow-studio-salon

Admin routes:

/:businessSlug/admin
/:businessSlug/admin/settings
/:businessSlug/admin/analytics

Business-specific:

Branding
Settings
Reservations
Analytics
Custom fields

===================================================
======v1.1 – Business Switcher============
===================================================
Added business selector on:

Dashboard

Switch between:

Dim Sum Dragon
Move Better Physio
Glow Studio Salon
Analytics

Business switching support.

Settings

Business switching support.

===================================================
=========v1.2 – Custom Reference Prefixes===========
===================================================
Businesses can define:

DSD
MBP
SALON
SPA
AGR

Generated references:

DSD-20250827-001
MBP-20250827-001
AGR-20250827-001

instead of a hardcoded prefix.

===================================================
========v1.3 – Customer Privacy Notice=============
===================================================
Added customer consent notice:

By submitting this form,
you consent to your information
being stored for booking and
appointment management purposes.

Displayed below booking form.

===================================================
=========v1.4 – Dashboard Date Range Filtering==========
===================================================
Replaced single-day dashboard view.

Added:

Start Date
End Date

Managers can view:

Single day
Multiple days
Weekly view
Monthly view

===================================================
==========v1.5 – Dashboard Sorting============
===================================================
Added:

Earliest First
Latest First

Sorting affects:

Reservation date
Reservation time

===================================================
=======v1.6 – Planner View Improvements=============
===================================================
Reservations now grouped by day.

Example:

Thursday, June 4, 2026

09:00 John
11:00 Sarah
15:00 Michael

Friday, June 5, 2026

08:00 Peter
14:00 Anna

Features:

======Date headers=======
Time ordering inside each day
Works with date range filtering
Works with sort order

=========quick dashboard date presets=========

Today
Tomorrow
Next 7 Days
This Month

===================================================
========v1.7 – Test Environment & Vercel Improvements===========
===================================================
Added:

Vercel deployment support
Multi-route support
Slug-based routing fixes
Tester-friendly environment

Created separate test businesses:

Glow Studio Salon
General Appointment Demo
Agris Cafe

for external user testing.