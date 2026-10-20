# SalsysOS UX System V1

**Status:** design direction locked for implementation branch `uiux/salsysos-experience-v1`.

## Product experience target

SalsysOS should feel like an operating system for sales + analysis, not a static CRM dashboard.

Reference pattern blend:

- Meta Business Suite: compact primary icon rail + contextual secondary navigation;
- Linear: restraint, speed, minimal chrome, strong hierarchy;
- Stripe: polished business metrics, drill-down data presentation, explainable detail;
- SalsysOS: persistent, context-aware intelligence and action layer.

Density target: balanced. Show the highest-value state first; reveal detail progressively.

## UX principles

1. Action before reporting.
2. Minimal text; use visual hierarchy, numbers, states, badges and charts.
3. Progressive disclosure rather than long pages.
4. Contextual secondary navigation instead of one long sidebar.
5. Intelligence should be embedded where decisions happen, not presented as AI essays.
6. Analytics must support interaction, comparison and drill-down.
7. Unknown / incomplete evidence must remain visibly unknown.
8. Human review remains required for consequential actions such as budget movement, mass messaging or material workflow changes.
9. Role-aware navigation: admissions users should not see admin-only product areas.
10. Desktop, tablet and mobile must share the same information architecture.

## Navigation model

### Primary icon rail

Persistent compact rail:

- Home
- CRM
- Inbox
- Growth
- Intelligence
- Automation
- Operations
- System

Each icon has a tooltip and a selected state. Selecting an area opens its contextual menu.

### Contextual secondary navigation

#### Home
- Today
- Activity

#### CRM
- Leads
- Pipeline
- Admissions
- Person 360 / Contact Intelligence
- Follow-ups
- Team Performance

#### Inbox
- Conversations
- WhatsApp
- Instagram
- Unified Inbox views where available

#### Growth
- Campaigns
- Paid Media Leads
- Re-engaged / Lead Activity
- SEO

#### Intelligence
- Commercial Intelligence
- Analytics
- Funnel
- Attribution
- Revenue
- Tracking
- Predictions / model readiness where permitted

#### Automation
- Automation
- Smart Triggers
- Broadcast / workflow operations where available

#### Operations
- Course Management
- Tasks / operational queues

#### System
- Integrations
- Team & Access
- Tracking Sources
- System Health
- Settings

Employee/admissions navigation uses the same model but only exposes allowed areas and routes.

## Shell behavior

Desktop:

`primary icon rail -> contextual menu -> workspace`

The secondary menu is collapsible. Content should expand when it is collapsed.

Tablet:

Primary rail remains compact; secondary menu becomes an overlay/drawer.

Mobile:

Use a reduced bottom/compact primary navigation plus contextual drawer. Avoid reproducing a desktop sidebar at narrow widths.

## Global command + intelligence layer

Persistent command surface available from the top bar and keyboard shortcut.

Working label: **Ask Salsys**.

It should support both navigation and intelligence:

- find a lead, course, campaign or conversation;
- show leads needing attention;
- explain a funnel drop;
- explain a CPL / CAC / ROAS movement from observed evidence;
- surface unpaid or pending enrollments;
- draft a reply from conversation context;
- create a follow-up with review;
- jump directly to filtered views.

AI output should prefer compact answer cards:

- answer / diagnosis;
- supporting evidence;
- confidence / evidence coverage where meaningful;
- one or two recommended actions;
- direct action buttons.

Avoid long narrative blocks unless the user explicitly opens "Explain more".

## Home / Today experience

Home is an action center, not a KPI wall.

First viewport should answer:

- what needs attention now?
- what changed?
- what can move revenue today?

Recommended structure:

1. compact greeting + date + Ask Salsys command;
2. action summary strip: new leads, replies due, high-intent opportunities, payment pending;
3. ranked "Needs attention" queue;
4. live activity stream;
5. one compact performance trend / business pulse;
6. contextual quick actions.

Cards should contain minimal copy. Supporting explanation belongs in drawers, tooltips or detail states.

## CRM interaction pattern

### Leads

Default view should be a fast operational table/list with:

- name + compact contact identity;
- stage;
- intent;
- last interaction;
- source;
- owner;
- next action;
- compact attention badges.

Row click opens a side detail panel when practical, instead of forcing full page navigation for every inspection.

### Pipeline

Use interactive stage columns / stage visualization with:

- stage totals;
- value;
- stale indicators;
- drag only where business rules safely permit it;
- click stage to cross-filter associated leads.

### Person 360

Prefer timeline + summary chips + tabs/drawers. Do not show all history and intelligence at once.

## Inbox pattern

Use a multi-panel workspace inspired by modern business inboxes:

- conversation list;
- active conversation;
- contextual customer / Person 360 panel.

Context panel should show only useful decision information: stage, intent, course interest, last touch, next task, attribution/source and payment state.

AI tools belong near the composer:

- Smart reply;
- Summarize;
- Tone adjustment;
- Follow-up suggestion;
- Extract commitment / next step.

## Interactive analytics system

Replace static charts with cross-filterable analysis surfaces.

Core interactions:

- hover tooltips with exact values + delta;
- date-range selector;
- compare against prior period;
- metric selector;
- channel/source/campaign/course/location filters;
- legend toggles;
- click a point/bar/stage to filter the supporting table/list;
- drill-down drawer instead of full navigation when practical;
- reset filter state visibly;
- saved views later if useful.

### Funnel

Interactive stage flow:

- select stage;
- inspect stage conversion;
- compare source/campaign/course segments;
- reveal biggest observed drop;
- jump to affected leads.

### Attribution

Interactive model switcher:

- First Touch;
- Lead Creation;
- Last Marketing Touch;
- Current Channel.

Switching models should update charts and tables together while keeping the models visibly distinct.

### Revenue

Interactive controls for:

- actual / outstanding / open pipeline / weighted pipeline;
- INR and USD separately;
- course/location/source filters;
- received vs refunded vs outstanding;
- timeline and source contribution;
- click-through to payment / lead evidence.

### Paid media

Show spend -> lead -> qualified -> enrolled -> revenue as an interactive business chain rather than disconnected cards.

Coverage warnings remain visible so weak attribution is not presented as strong ROI evidence.

## Visual design

Base:

- light neutral workspace;
- restrained borders;
- minimal shadows;
- compact radii;
- high-contrast typography;
- one product accent plus semantic status colors;
- no decorative gradients unless they communicate state or hierarchy.

Typography hierarchy should be clear enough that explanatory labels can be shortened substantially.

Use color for state, not decoration.

## Motion

Subtle, functional motion only:

- secondary nav opening;
- panel/drawer transitions;
- chart hover and filter transitions;
- list state changes;
- command palette opening.

Respect reduced-motion preferences.

## Implementation order

1. Shell + two-level navigation + product branding.
2. Global command / Ask Salsys surface.
3. Home / Today action center.
4. Leads + Pipeline + Person 360 interaction patterns.
5. Inbox three-panel workspace.
6. Analytics visualization system.
7. Funnel / Attribution / Revenue interactive redesign.
8. Integrations, automation, settings and system surfaces.
9. Responsive/mobile polish.
10. Accessibility + interaction regression pass.

## Non-goals

- Do not copy Meta or any reference product pixel-for-pixel.
- Do not hide business truth merely to make a screen look clean.
- Do not convert unknown evidence into inferred certainty.
- Do not add autonomous consequential actions without an explicit review boundary.
