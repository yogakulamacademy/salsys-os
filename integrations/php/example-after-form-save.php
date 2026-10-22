<?php
require_once __DIR__ . '/yogakulam-crm.php';

// Example: your existing handler has already validated the form and inserted it into
// the Yogakulam website database. Use that row ID as the stable idempotency key.
$websiteEnquiryId = $insertedEnquiryId ?? null;

$crmResult = yogakulam_crm_capture_lead([
    'externalEventId' => $websiteEnquiryId ? 'academy-enquiry-' . $websiteEnquiryId : null,
    'site' => $_SERVER['HTTP_HOST'] ?? 'yogakulamacademy.com',
    'formName' => 'course-enquiry',
    'firstName' => $_POST['first_name'] ?? $_POST['name'] ?? null,
    'lastName' => $_POST['last_name'] ?? null,
    'email' => $_POST['email'] ?? null,
    'phone' => $_POST['phone'] ?? $_POST['mobile'] ?? null,
    'courseCode' => $_POST['course_code'] ?? null,
    'preferredLocation' => $_POST['location'] ?? null,
    'preferredMonth' => $_POST['preferred_month'] ?? null,
    'preferredMode' => $_POST['mode'] ?? null,
    'country' => $_POST['country'] ?? null,
    'timezone' => $_POST['timezone'] ?? null,
    'message' => $_POST['message'] ?? $_POST['query'] ?? null,

    // SAL is the preferred website compatibility prefix during the Salsys cutover.
    // The universal SDK still uses salsys_* canonically, and old yk_* values remain
    // readable so existing visitors/sessions do not lose continuity.
    'sal_visitor_id' => $_POST['sal_visitor_id'] ?? $_POST['salsys_visitor_id'] ?? $_POST['yk_visitor_id'] ?? null,
    'sal_session_id' => $_POST['sal_session_id'] ?? $_POST['salsys_session_id'] ?? $_POST['yk_session_id'] ?? null,
    'sal_first_touch' => $_POST['sal_first_touch'] ?? $_POST['salsys_first_touch'] ?? $_POST['yk_first_touch'] ?? null,
    'sal_session_touch' => $_POST['sal_session_touch'] ?? $_POST['salsys_session_touch'] ?? $_POST['yk_session_touch'] ?? null,

    'metadata' => [
        'website_enquiry_id' => $websiteEnquiryId,
        'page' => $_SERVER['HTTP_REFERER'] ?? null,
        'tracking_alias' => 'sal',
    ],
]);

// Do not fail the customer's form if CRM capture fails. Log it for retry/diagnosis.
if (empty($crmResult['ok'])) {
    error_log('Yogakulam CRM capture failed: ' . json_encode($crmResult));
}
