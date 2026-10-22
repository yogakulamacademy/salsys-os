# CRM Command Center resilience hotfix

Production `/crm` must not crash when one operational snapshot fails. The Command Center should render the available snapshot and safe empty states for unavailable sections while preserving authentication, tenant isolation, and existing source-of-truth boundaries.
