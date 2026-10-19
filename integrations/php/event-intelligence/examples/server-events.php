<?php
require_once dirname(__DIR__) . '/event-intelligence.php';

/*
 * Use a stable event_id derived from the website's own database record whenever
 * possible. Replaying the same event_id is idempotent end to end.
 *
 * The examples intentionally use operational IDs rather than fabricated
 * outcomes. Emit payment.completed / enrollment.completed only after the
 * website/payment backend has authoritative confirmation.
 */

// Enquiry/lead captured after the website has successfully persisted it.
$leadEvent = salsys_event_emit_server(
    'lead.submitted',
    array(
        'identity' => array(
            'email' => 'student@example.com',
            'phone' => '+910000000000',
        ),
        'lead' => array(
            'display_name' => 'Example Student',
            'course' => '200 Hour YTT',
            'location' => 'Mysore',
        ),
        'attribution' => array(),
    ),
    array(
        'event_id' => 'website-enquiry-12345',
        'anonymous_visitor_id' => isset($_POST['salsys_visitor_id']) ? $_POST['salsys_visitor_id'] : null,
        'session_key' => isset($_POST['salsys_session_id']) ? $_POST['salsys_session_id'] : null,
        'site' => 'www.example.com',
        'metadata' => array('website_enquiry_id' => 12345),
    )
);

// Reservation created by the website backend.
$bookingEvent = salsys_event_emit_server(
    'booking.completed',
    array(
        'booking_reference' => 'YGK-2026-0001',
        'course' => '200 Hour YTT',
        'batch' => '2026-11-11',
        'room' => 'Twin Sharing',
    ),
    array(
        'event_id' => 'booking-YGK-2026-0001-created',
        'site' => 'www.example.com',
    )
);

// Payment success must come from a trusted payment callback/database state.
$paymentEvent = salsys_event_emit_server(
    'payment.completed',
    array(
        'booking_reference' => 'YGK-2026-0001',
        'payment_reference' => 'gateway-transaction-id',
        'amount' => 10000,
        'currency' => 'INR',
        'payment_method' => 'upi',
    ),
    array(
        'event_id' => 'payment-gateway-transaction-id-completed',
        'site' => 'www.example.com',
    )
);

// Enrollment is separate from payment and should be emitted only when the
// operational enrollment record is actually confirmed.
$enrollmentEvent = salsys_event_emit_server(
    'enrollment.completed',
    array(
        'booking_reference' => 'YGK-2026-0001',
        'enrollment_reference' => 'ENR-0001',
        'course' => '200 Hour YTT',
        'batch' => '2026-11-11',
    ),
    array(
        'event_id' => 'enrollment-ENR-0001-completed',
        'site' => 'www.example.com',
    )
);
