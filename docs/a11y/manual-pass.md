# FlyLo-Air manual accessibility pass

Companion to the automated reports in this folder (`before.*`, `after.*`). These checks cover what axe-core cannot decide on its own.

## Keyboard-only pass: search → results → checkout

Chrome, 1280px and 390px, no mouse.

| Step | Before | After |
| --- | --- | --- |
| Tab from the top of any page | Skip link, logo, nav, then the form. Focus ring is amber `#f59e0b`, about 2.2:1 on white | Same order. Ring is `#c2410c` on light areas (5.2:1) and `#fcd34d` on the navy header, hero and page heads (6.4:1 or better) |
| Search fields (`select`, date) | `outline: none`, only a 25% blue glow (about 1.5:1) | 3px outline plus a blue border |
| Pick a popular route or a fare (client-side navigation) | Focus lost to `<body>`; the next Tab jumped past the header into the page | Focus moves to the new page's `h1`; the next Tab continues from there |
| Pay with empty fields | Focus moved to the alert, but its wrapper was an `aria-live` region around `role="alert"`, so it could be announced twice, and the alert did not say which fields to fix | Focus moves to the alert, which is announced once through `role="alert"`. It lists every problem as a link, and each link moves focus to its field |
| Pay while the request is in flight | The button became `disabled` and left the focus order mid-action | The button stays focusable (`aria-disabled`); "Processing your payment…" is announced via `role="status"` |
| Successful booking | Focus lost to `<body>` because the confirmation heading never received focus | The "You're booked" heading (now an `h2` under the page `h1`) receives focus |
| Sticky header | Focused fields could scroll under the header when tabbing backwards | `scroll-padding-top` keeps them in view |

There are no keyboard traps on `/`, `/results` or `/checkout`.

## Contrast on gradients (axe "needs review")

axe cannot resolve contrast over the hero and page-head gradients, so the worst cases were calculated by hand, blending each gradient stop and the radial glows at their opacity:

| Text | Worst background | Ratio |
| --- | --- | --- |
| Eyebrow `#fdba74` (small, bold) | Orange glow over navy, hero top right on mobile | 4.96:1 |
| Lead / page-head text `#dbeafe` | `#1e40af` gradient end | 8.0:1 |
| Lead text `#dbeafe` | Blue glow, hero bottom left | 6.6:1 |
| White `h1` | Orange glow | 8.3:1 |

## Reflow and motion

- No horizontal scrolling at 320px on `/`, `/results` or `/checkout`.
- `prefers-reduced-motion: reduce` already removed transitions and animations. Hover lift on route cards and button press offset are now off too.

## /support/: out of scope, not changed

axe reports no violations on `/support/`. Manual findings, left as they are on purpose:

- Ticket fields still use the global `input:focus { outline: none }` with a 25% glow, so the focus indicator is below 3:1 (WCAG 2.4.7 / 1.4.11).
- Field borders `#b6c2d3` (about 1.8:1) and the "filled from call" border `#86b7a4` (about 2.3:1) are below the 3:1 non-text contrast minimum (1.4.11).
- Name and email fields use `autocomplete="off"`, so they do not identify their input purpose (1.3.5).
- The "Press Esc to hang up" hint (`.action-note`) is hidden below 680px, so mobile users never see it.
