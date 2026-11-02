# Smart and dynamic Journey workspace

Continuation of draft PR #438 at `36dfd5e03abd0ad9921800b442596dbd9dba3518`. Master Context v1.2, current information architecture and Journey/growth-before-R13 remain the baseline.

## Implemented behavior

- A shared, deterministic **Next service step** explains an action using the selected enquiry's CRM stage, ownership and loaded commitments. It does not depend on website visits, inferred intent, a conversion probability or an LLM.
- Completed/closed stages do not receive acquisition follow-up reminders. Unknown stages require record review. Missing ownership is explicit. Overdue and scheduled commitments are distinguished; an unavailable task list does not mean no tasks. The existing Inspector task read remains capped at ten.
- Reminders require a successful CRM read no older than five minutes, a supported timestamp and a matching selected enquiry. A failed refresh suppresses old guidance while retaining saved evidence. This is an operational read-age limit, not a source-freshness guarantee.
- Record type, source, before/after phase, loaded-window/seven-day period, search and chronological order combine dynamically. Page rows drill down to supporting events. Page summaries preserve session and page-view units; visits never become intent, ad impressions or verified money.
- Filtered counts are view counts, not lifetime totals. Reset, empty-filter state, retained filters on refresh and private-path exclusion are supported. No-record modules do not gain a zero-stat strip.
- Read age updates locally while visible. Manual refresh uses the existing authorized Inspector or server-page refresh. No new background polling, collector, identity link, network service or database schema is introduced.
- Inspector reads use request generations and cancellation. Responses for an older selection, including A → B → A, cannot replace the current record. Follow-up completion feedback also stays with its initiating selection; submitted commands are never automatically retried by this change.
- Actions open existing profile/payment/follow-up destinations. Reviewing an existing commitment does not silently create a new task. No recommendation sends a message or changes a stage.

## Verification scope

New production-helper cases cover terminal/deferred stages, earliest commitments, invalid clocks, missing/unavailable tasks, stale and failed reads, enquiry mismatch, combined filters, page/session units, restricted history and out-of-order requests. Browser cases exercise page drill-down, filters, failed refresh, stage changes and lead switching. Execution results are recorded in the delivered verification report.

These checks do not establish live identity resolution, tenant database policy, payment/refund correctness, provider delivery or purpose consent. The full GT-01 ₹80,000 financial workflow and AIK-01–AIK-15 remain pending. The existing sales-intelligence Overview is not replaced or certified by this change.

## Critical next dependency

Keep `AI-KNOWLEDGE-AGENT-WORKFLOW.md` active: approved/current tenant knowledge, approved sales assets and a controlled shared WhatsApp/Instagram Conversation Agent. This workspace does not enable autonomy. Current Co-Pilot remains draft-only until the separate knowledge, action-policy, permission, dispatch and provider gates pass. R13 follows the user's chosen Journey/growth work.
