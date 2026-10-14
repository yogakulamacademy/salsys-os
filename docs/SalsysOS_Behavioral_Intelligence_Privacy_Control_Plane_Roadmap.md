# SalsysOS Behavioral Intelligence + Privacy Control Plane Roadmap

Status: Adopted roadmap extension
Date: 2026-10-14

## Purpose

This document extends the existing SalsysOS roadmap without renaming or repurposing W1-W8, R0-R14, or Technical Phases 1-11.

The extension formalizes two platform capabilities:

1. Customer Journey / Behavioral Intelligence
2. Privacy & Compliance Control Plane

The CRM remains the team-facing operating interface. The event, identity, journey, scoring, privacy, attribution, revenue, and recommendation systems form the intelligence layer underneath it.

## A. Behavioral Intelligence Extension

The target person journey is:

Anonymous visitor -> repeat visitor -> content engagement -> lead -> sales engagement -> customer/lost lead -> post-lead engagement

Every meaningful interaction should be represented as an event and connected through a stable person/identity graph when legally and operationally permitted.

### BI-1 Pre-lead behavioral timeline

Capture and surface:
- first seen
- first source / medium / campaign
- sessions before lead creation
- pages and content viewed
- courses researched
- commercial pages viewed
- brochure/download/form interactions
- repeat-visit behavior
- anonymous-to-known identity transition where permitted

Maps primarily to Technical Phases 1-4 and R2-R4.

### BI-2 Post-lead behavioral timeline

Continue the same journey after lead creation and correlate website behavior with:
- calls
- WhatsApp
- email
- follow-ups
- stage changes
- pricing/payment page visits
- return sessions
- conversion or loss

Maps to Technical Phases 4-7 and R3-R7.

### BI-3 Intent scoring

Build a transparent scoring layer using:
- recency
- frequency
- engagement depth
- commercial intent
- product affinity
- behavioral acceleration

Initial scoring can be rules-based. Later scoring should be trained/calibrated using actual conversion outcomes.

Maps to Technical Phases 7 and 11 and R6/R10.

### BI-4 Lead reactivation

Detect previously inactive leads that become behaviorally active again and generate reactivation signals and recommended follow-up actions.

Maps to R6 and R10.

### BI-5 Behavioral segments

Support operational segments such as:
- high-intent course leads
- returning leads
- price-sensitive researchers
- accommodation researchers
- testimonial-heavy researchers
- curriculum researchers
- reactivated leads
- multi-course researchers
- highly engaged non-leads

Maps to R6-R8.

### BI-6 Revenue-aware content influence

Measure not only direct conversions but also assisted influence from:
- articles
- teacher pages
- testimonials
- accommodation pages
- curriculum pages
- FAQ pages
- landing pages

Connect content exposure to qualified leads, customers, and revenue.

Maps to Technical Phases 6, 9, 10 and R5/R8/R9.

### BI-7 Sales influence measurement

Measure whether sales actions change digital behavior and eventual conversion, including return rate and behavior after calls/messages.

Maps to R3, R5, R6 and R10.

### BI-8 Recommendation engine

Use journey, intent, attribution, product affinity, and revenue data to answer:

- What is this person likely to do next?
- Why?
- What should the team do now?

Recommendations remain explainable and human-reviewable by default.

Maps to Technical Phase 11 and R10.

## B. Privacy & Compliance Control Plane

Privacy is a first-class cross-cutting subsystem, not a separate afterthought or a single consent boolean.

The platform should provide configurable controls that support applicable privacy frameworks such as GDPR, India DPDP, CCPA/CPRA, and similar regimes. Product positioning must not claim universal legal compliance without deployment-specific legal review.

### PC-1 Jurisdiction engine

Determine applicable processing policy using organization configuration and available jurisdiction signals.

### PC-2 Consent ledger

Maintain purpose-specific consent and withdrawal history rather than one global consent flag.

Suggested consent dimensions:
- analytics
- personalization
- marketing
- advertising sharing
- profiling
- email marketing

Maintain evidence metadata such as notice version, timestamp, source, jurisdiction, purposes, withdrawal timestamp, and proof reference.

### PC-3 Purpose registry

Maintain canonical processing purposes with:
- purpose code
- description
- allowed data categories
- legal basis/configuration
- retention class
- allowed activation destinations
- profiling permission

### PC-4 Data classification

Classify fields/events into identity, contact, behavioral, commercial, sensitive, security, operational, and derived/predicted categories.

### PC-5 Identity-resolution policy controls

Identity stitching from anonymous activity to a known lead must be policy-aware. The platform must be able to allow, restrict, aggregate, or prevent linking depending on consent/purpose/jurisdiction policy.

### PC-6 Tracking policy engine

Before processing an event, evaluate whether the event may be:
- collected
- stored
- linked to identity
- scored
- personalized
- exported
- used for advertising
- retained
- used for model training

### PC-7 Identity vault / PII separation

Separate direct identity data from high-volume behavioral/event data wherever practical. Analytical systems should primarily use internal person identifiers rather than repeatedly carrying direct PII.

### PC-8 Retention engine

Automate retention and deletion/anonymization by data class and processing purpose.

### PC-9 Data subject rights engine

Support controlled workflows for:
- access
- correction
- deletion/erasure
- restriction where applicable
- consent withdrawal
- marketing opt-out

### PC-10 Deletion / privacy request orchestrator

Resolve the person and coordinate deletion/anonymization/suppression across CRM, event store, journeys, segments, scoring features, connected marketing systems, and downstream processors, while keeping the minimum audit evidence required by policy.

### PC-11 Vendor / processor registry

Track connected processors/subprocessors, their purposes, data categories, regions, and activation permissions.

### PC-12 Data residency / transfer controls

Provide organization-level controls for residency and cross-border-transfer policy where infrastructure and provider support permit it.

### PC-13 Audit trail

Maintain immutable or append-oriented evidence for consent changes, rights requests, administrative policy changes, export/activation events, and security-sensitive actions.

### PC-14 Age / child protection controls

Provide configurable safeguards for services that may process children/minors, including age-gating and restricted processing policies.

### PC-15 Profiling / automated-decision controls

Separate advisory lead scoring/recommendations from high-impact solely automated decisions. Record model/score provenance and expose reasoning to human operators.

### PC-16 Policy-aware data lineage

Track lineage from source data -> person/identity -> derived feature/score -> segment -> activation destination so policy changes and withdrawals can propagate downstream.

## C. Mapping to Existing SalsysOS Roadmap

No existing phase is renamed.

Technical Phase 1 Identity Resolution:
- privacy-aware identity stitching
- identity vault boundary
- person/anonymous identity states

Technical Phase 2 Raw Event Platform:
- event purpose metadata
- consent/jurisdiction/retention metadata
- collection policy checks

Technical Phase 3 Session & Touchpoint Processing:
- pre-lead behavior
- journey depth / frequency / recency features

Technical Phase 4 Customer Journey / Customer 360:
- complete pre-lead + post-lead timeline
- behavioral profile
- privacy-aware journey rendering

Technical Phase 5 CRM Journey Experience:
- behavioral timeline UI
- intent trend
- recommended action
- privacy state visibility

Technical Phase 6 Attribution & Revenue:
- content/revenue influence
- assisted conversion analysis

Technical Phase 7 Intent + Product Affinity + Sales Intelligence:
- intent score
- reactivation
- product affinity
- behavioral segments
- sales influence

Technical Phase 8 Conversion Feedback:
- scoring/segment feedback to supported external platforms subject to activation policy

Technical Phase 9 Content + SEO Intelligence:
- revenue-aware content influence
- conversion-assisting content

Technical Phase 10 AEO / GEO / AI Visibility:
- keep output policy-aware and revenue-connected

Technical Phase 11 Predictive Intelligence:
- learned conversion probability
- next-best-action recommendation
- explainability/provenance
- profiling safeguards

## D. Commercial Roadmap Mapping

R1 Foundation, Tenancy, Security & Production Baseline:
- privacy control-plane foundation
- auditability
- tenant policy isolation

R2 Lead Capture, Identity, Raw Events & Data Quality:
- consent ledger
- purpose metadata
- identity state
- tracking policy

R3 CRM Sales Execution:
- post-lead behavior and sales-activity correlation

R4 Customer Journey / Customer 360:
- complete behavioral timeline and customer graph

R5 Attribution, Funnel & Revenue Intelligence:
- revenue-aware content and journey influence

R6 Intent, Product Affinity & Sales Intelligence:
- intent scoring, reactivation, segmentation

R7 Integrations & Conversion Feedback:
- policy-aware activation and downstream suppression/removal

R8 Content + SEO Intelligence:
- content revenue contribution and assist value

R9 AEO / GEO / AI Visibility:
- privacy-aware use of observed and derived data

R10 Predictive Intelligence + Owner Command Center:
- learned scoring, predicted conversion, next-best action, explainability

R11-R14 Productization/verticals/commercial readiness:
- tenant-configurable privacy policies, compliance administration, documentation, onboarding presets, processor registry, and enterprise controls

## E. Execution Priority

The current execution sequence remains:

1. Finish pulled-forward W8 tenant isolation / security work
2. Resume W6 Marketing Workspace
3. Build W7 Finance + Reports
4. Finish remaining W8 production closeout

Behavioral intelligence continues to be built through existing R2-R10 work and is not postponed.

The Privacy & Compliance Control Plane is cross-cutting. Foundation items should be added before significantly expanding behavioral tracking, especially purpose metadata, consent ledger, retention classes, and identity-resolution policy controls.

Recommended implementation order for new privacy scope:

PC-F1 Data inventory + purpose registry
PC-F2 Consent ledger expansion
PC-F3 Event policy metadata / processing decision API
PC-F4 Identity-stitching policy controls
PC-F5 Retention classes + retention engine foundation
PC-F6 Rights-request registry + orchestration
PC-F7 Vendor/processor registry + activation policy
PC-F8 Policy-aware data lineage
PC-F9 Profiling/model governance
PC-F10 Compliance administration UI + jurisdiction presets

## F. Progress Reporting Standard

After every completed major phase/checkpoint, report all of the following separately:

- checkpoint/phase completed
- checkpoint percentage
- Workspace W1-W8 percentage
- R0-R14 North-Star progress
- Technical Phase 1-11 progress
- Behavioral Intelligence progress
- Privacy & Compliance Control Plane progress
- overall product build progress
- estimated commercial readiness
- remaining percentage
- blockers
- next checkpoint

Percentages must distinguish scope completion from deployment/validation. Adding approved new scope may reduce overall completion percentage; this is expected and should be reported explicitly rather than hiding scope growth.

## G. Current Baseline After Adoption

Existing SalsysOS foundations already cover meaningful portions of the new scope:

- first-party tracking exists
- raw event platform exists
- identity resolution foundation exists
- sessions/touchpoints exist
- Customer 360/journey foundations exist
- attribution and revenue facts exist
- lead sales intelligence foundation exists
- tracking consent ledger foundation exists
- conversion feedback foundation exists
- tenant isolation/security work is advanced

The largest new work areas are:

- complete behavioral timeline UX
- recency/frequency/depth/intent feature engine
- lead reactivation engine
- content-assist/revenue influence models
- purpose registry
- granular consent state
- policy decision engine
- identity stitching controls
- automated retention
- rights request orchestration
- data lineage
- vendor/processor registry
- profiling/model governance
- compliance administration UI and presets
