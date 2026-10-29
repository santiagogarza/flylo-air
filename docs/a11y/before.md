# FlyLo-Air accessibility audit (before)

- Generated: 2026-10-29T04:13:24.903Z
- Engine: axe-core via @axe-core/playwright, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`
- Viewports: desktop 1280×800, mobile 390×844
- Search date: 2026-11-12 (today + 14 days)
- In-scope result: **1 failing rules, 30 failing nodes**

## Summary by page

Counts are unique failing axe rules per page across every state and viewport, grouped by impact. "Nodes" is the total number of failing elements across all runs.

| Page | Scope | Critical | Serious | Moderate | Minor | Nodes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Home (/) | In scope | 0 | 0 | 0 | 0 | 0 |
| Results (/results) | In scope | 0 | 1 | 0 | 0 | 30 |
| Checkout (/checkout) | In scope | 0 | 0 | 0 | 0 | 0 |
| Checkout, invalid flight | In scope | 0 | 0 | 0 | 0 | 0 |
| Support (/support/) | Out of scope, not changed | 0 | 0 | 0 | 0 | 0 |

## Runs

| Page | State | Viewport | Critical | Serious | Moderate | Minor |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Home (/) | default | desktop 1280px | 0 | 0 | 0 | 0 |
| Home (/) | default | mobile 390px | 0 | 0 | 0 | 0 |
| Results (/results) | SFO to JFK, 2 travelers | desktop 1280px | 0 | 1 | 0 | 0 |
| Results (/results) | SFO to JFK, 2 travelers | mobile 390px | 0 | 1 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · empty | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · empty | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · sample details filled | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · sample details filled | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · validation error | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 1 traveler · validation error | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · empty | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · empty | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · sample details filled | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · sample details filled | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · validation error | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout (/checkout) | 2 travelers · validation error | mobile 390px | 0 | 0 | 0 | 0 |
| Checkout, invalid flight | unknown flight | desktop 1280px | 0 | 0 | 0 | 0 |
| Checkout, invalid flight | unknown flight | mobile 390px | 0 | 0 | 0 | 0 |
| Support (/support/) | default | desktop 1280px | 0 | 0 | 0 | 0 |
| Support (/support/) | default | mobile 390px | 0 | 0 | 0 | 0 |

## Findings

### Home (/)

No violations.

### Results (/results)

- **label-content-name-mismatch** (serious, 30 nodes): Elements must have their visible text as part of their accessible name. [Rule docs](https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=playwright)
  - Seen in: SFO to JFK, 2 travelers · desktop; SFO to JFK, 2 travelers · mobile
  - Elements: `div[aria-label="Fares for FL 119"] > .fare-option:nth-child(1)`, `div[aria-label="Fares for FL 119"] > .fare-option:nth-child(2)`, `div[aria-label="Fares for FL 119"] > .fare-option:nth-child(3)`, `div[aria-label="Fares for FL 626"] > .fare-option:nth-child(1)`, `div[aria-label="Fares for FL 626"] > .fare-option:nth-child(2)`, `div[aria-label="Fares for FL 626"] > .fare-option:nth-child(3)`, `div[aria-label="Fares for FL 853"] > .fare-option:nth-child(1)`, `div[aria-label="Fares for FL 853"] > .fare-option:nth-child(2)`

### Checkout (/checkout)

No violations.

### Checkout, invalid flight

No violations.

### Support (/support/) (out of scope, not changed)

No violations.

