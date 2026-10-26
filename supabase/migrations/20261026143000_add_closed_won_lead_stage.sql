alter type public.lead_stage
add value if not exists 'closed_won' after 'payment_pending';
