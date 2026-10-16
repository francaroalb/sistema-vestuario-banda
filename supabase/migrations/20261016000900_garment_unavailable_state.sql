-- Add a state for garments whose current availability cannot be confirmed.
-- Keep this in its own migration so PostgreSQL commits the enum value before use.
alter type public.garment_state add value 'NO_DISPONIBLE';
