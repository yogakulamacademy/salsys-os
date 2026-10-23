# SalsysOS UI Design System V1

This document is the visual source of truth for product UI work.

## Product direction

SalsysOS should feel like a calm, high-trust operating system for sales and marketing teams: dense enough for professional workflows, but never visually noisy.

The visual language is **forest green + warm neutral surfaces**. Orange is a supporting accent only and should not compete with the primary product color.

## Typography

Use the shared sans stack from `app/design-system.css`.

- Page title: 30px / 650
- Section title: 16–20px / 650
- Card title: 14–16px / 650
- Body/UI copy: 14px / 400–500
- Labels: 12px / 600–650
- Eyebrow / table header: 10–11px / 700
- Avoid body text below 12px except extremely dense metadata.
- Avoid synthetic weights such as 750/800 for normal UI text.

## Color

Primary tokens:

- Strong text / brand dark: `#18362D`
- Primary action / active state: `#216551`
- App background: `#F6F8F7`
- Surface: `#FFFFFF`
- Soft surface: `#F8FAF9`
- Border: `#DCE4DF`
- Body text: `#273C34`
- Muted text: `#66786F`
- Subtle text: `#89988F`
- Accent: `#DF852C`

Use semantic CSS variables rather than adding new hard-coded colors.

Status colors may remain semantic:

- success: green
- warning: amber
- danger: red
- information: blue

Purple should not be used as a general product accent.

## Spacing

Default page padding:

- mobile: 16px
- tablet/desktop: 24px
- wide desktop: 28px

Common gaps:

- 4px: tightly related metadata
- 8px: compact control groups
- 12px: normal control groups
- 16px: card internal groups
- 20–24px: sections
- 28–32px: major page sections

## Components

### Buttons

- Standard height: 40px
- Standard radius: 10px
- Primary: green fill / white text
- Secondary: white surface / neutral border
- Do not use different primary button colors by page.

### Inputs

- Standard height: 40px
- Radius: 10px
- 14px text
- Neutral border
- Green focus ring

### Cards / panels

- Radius: 16px
- 1px neutral border
- Very restrained shadow
- Avoid hover lift on purely informational panels if it suggests clickability.

### Tables

- 13px row text
- 11px uppercase headers
- Consistent row density
- Use color primarily for status, not decoration.

## Page header pattern

Each standard application page should converge on:

1. optional 10px eyebrow
2. 25–30px page title
3. 14px muted description
4. actions aligned right on desktop and stacked on mobile

Reusable classes:

- `.ui-page`
- `.ui-page-header`
- `.ui-page-kicker`
- `.ui-page-title`
- `.ui-page-description`
- `.ui-panel`
- `.ui-panel-muted`

## Dark mode

Dark mode must use the same semantic tokens. Do not independently invent page-specific dark colors when an existing token can express the role.

## Migration rule

When touching an existing screen:

1. remove hard-coded general-purpose colors;
2. replace arbitrary micro font sizes with the shared type scale;
3. use shared button/input/panel treatments;
4. preserve status colors only when they carry meaning;
5. preserve behavior and information hierarchy;
6. validate mobile, tablet and desktop layouts.
