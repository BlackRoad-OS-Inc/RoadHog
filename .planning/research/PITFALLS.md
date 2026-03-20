# Domain Pitfalls

**Domain:** Card-stack swipe UI / onboarding experiment variant
**Project:** Onboarding Product Selection — Card Stack Variant
**Researched:** 2026-03-20

---

## Critical Pitfalls

Mistakes that cause rewrites, broken experiments, or inaccessible UIs.

---

### Pitfall 1: Gesture-Scroll Conflict on Mobile (Touch Events)

**What goes wrong:**
The card-stack component sits inside a full-page onboarding layout
that scrolls vertically on short viewports or small phones. Horizontal
swipe gestures on the card compete with the browser's vertical scroll
responder. The result: horizontal swipes scroll the page instead of
moving the card, or vice versa. This is one of the most consistently
reported bugs in swipe-card implementations across React, React Native,
Flutter, and native iOS.

**Why it happens:**
Touch/pointer event handling is hierarchical. If the swipe gesture
handler does not resolve the axis of movement before the browser's
scroll responder claims the event, the browser wins. The key fix is
setting `touch-action: none` (or `touch-action: pan-y` for a
horizontal-only swipe) on the draggable container to prevent the
browser from intercepting horizontal pointer events. Without this, iOS
Safari and Android Chrome both cancel the pointermove sequence mid-drag.

The existing `SimplifiedProductSelection` already uses
`style={{ touchAction: 'none' }}` on its carousel container — that
pattern must be preserved on the card-stack drag surface.

**Consequences:**
Users on mobile cannot swipe cards. The feature is effectively broken
for the highest-volume new-user segment (many sign-ups happen on mobile
or tablets). The experiment shows falsely low card-interaction rates,
invalidating the A/B results.

**Prevention:**

- Apply `touch-action: none` to the exact element that handles
  drag/pointer events. Do not apply it to the whole page — that breaks
  native scroll for the rest of the layout.
- Test explicitly on iOS Safari 17+ and Chrome for Android before
  shipping. These are the two most common environments where the conflict
  manifests differently.
- If using Framer Motion's `drag` prop, set `dragConstraints` and
  verify that `drag="x"` does not interfere with any ancestor's vertical
  scroll. The Framer Motion issue tracker has a documented case
  (`#185`) where scroll and drag conflict even with `touch-action` set
  on the wrong ancestor.

**Detection:**

- "Swipe does not work on phone" reports after first deploy.
- Card interaction rate near zero on mobile in experiment data while
  desktop shows normal rates — this is the telltale sign.

**Phase:** Core card-stack implementation (Phase 1 / foundation).

---

### Pitfall 2: Feature Flag Variant Contamination from Replacing the Existing Flag

**What goes wrong:**
The project plan requires replacing the existing
`onboarding-simplified-product-selection` (multivariate: control/test)
with a new multi-variant flag (`onboarding-product-selection-variant`
with control/simplified/card-stack). If the old flag is simply deleted
and a new one created with overlapping rollout timing, users who were
mid-experiment in the old flag get reassigned or lost. Worse: the
`ProductSelection` component currently branches on
`featureFlags[FEATURE_FLAGS.ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION] === 'test'`
at line 352 of `ProductSelection.tsx`. If that read is removed before
all active users have resolved their variant, some users will see the
wrong variant or fallback silently to control without being recorded
correctly.

**Why it happens:**
PostHog assigns variants deterministically by user ID against the flag
key. Changing the flag key — even to the same rollout percentages —
creates a new hash space. Users previously in "test" of the old flag
do not automatically land in "simplified" of the new flag. Additionally,
historical experiment data lives under the old flag name; querying the
new flag for historical baseline comparisons will not find it.

**Consequences:**

- Experiment results for the new card-stack variant are compared against
  a broken or missing baseline.
- Users in the middle of onboarding get shuffled between variants,
  violating the independence assumption of the A/B test.
- The "control" group no longer accurately represents the true control
  if it is populated with users reassigned from the old flag's "test".

**Prevention:**

- Keep the old flag active in read-only mode until it has zero active
  new-user traffic (i.e., after sufficient time has passed that all
  users who saw the old flag have completed or abandoned onboarding).
  Onboarding is a one-time flow, so the bleed period is short (days).
- Add the new multi-variant flag alongside the old one. During
  transition, the `ProductSelection` component checks the new flag first
  and falls through to the old flag only as a safety net.
- Record variant assignment as a person property (`$set_once`) so users
  who were already assigned retain their variant even if flag evaluation
  logic changes. PostHog's sticky flag tutorial describes exactly this
  pattern.
- Do not reuse the old flag key for the new experiment. Different
  variants, different key.

**Detection:**

- After launch, variant distribution in the new experiment shows
  unexpected spikes or skewed percentages on day 1 (due to reassignment
  from old flag).
- Control group users show simplified-variant behaviour in session
  replays.

**Phase:** Flag migration (should be addressed in Phase 1, before any
user traffic reaches the new flag).

---

### Pitfall 3: No Keyboard / Non-Gesture Alternative (WCAG 2.5.1 Violation)

**What goes wrong:**
The card-stack interaction is designed around drag-to-swipe. If the
only way to accept or reject a card is via a pointer gesture, the
component fails WCAG 2.5.1 (Pointer Gestures, Level A), which requires
single-pointer alternatives for all path-based gestures. It also fails
WCAG 2.1.1 (Keyboard, Level A) if keyboard navigation is not available.

The existing `SimplifiedProductSelection` does this correctly — it
attaches a `keydown` handler for ArrowLeft/ArrowRight/Enter and renders
visible chevron buttons. The card-stack variant must follow the same
pattern.

**Why it happens:**
Gesture-first design focuses on the "fun" interaction and treats
keyboard/button controls as an afterthought. In practice, the keyboard
handler is trivial to add but easy to forget when the interaction is
prototype-driven.

**Consequences:**

- Users navigating by keyboard (common for developers and engineers, who
  are PostHog's primary user segment) cannot complete the onboarding
  step.
- Screen reader users cannot use the component at all.
- Legal/compliance exposure under WCAG Level A (lowest bar of
  accessibility).

**Prevention:**

- Add left arrow / right arrow keyboard bindings from day one, mirroring
  `SimplifiedProductSelection`'s `keydown` listener pattern.
- Provide visible "Accept" and "Reject" buttons as non-gesture
  alternatives to swiping. These can be styled to match the card
  aesthetic (e.g., small thumbs-up / thumbs-down icons at card edges).
- Ensure focus is managed correctly: when a card is dismissed, focus
  should move to the next card or the accept/reject button, not to a
  random ancestor element.
- `aria-label` each card with the product name; aria-announce
  transitions ("Session replay card accepted, 3 cards remaining").

**Detection:**

- Tab through the onboarding page — if focus skips the card stack or
  lands inside it with no visible indicator, accessibility is broken.
- Run axe-core on the component before shipping.

**Phase:** Core card-stack implementation. Accessibility is not
retrofittable; it must be built in.

---

### Pitfall 4: Animation Performance — Animating Layout-Triggering Properties

**What goes wrong:**
Card entry/exit animations that animate `width`, `height`, `top`,
`left`, `margin`, or `padding` force browser reflows on every frame.
At 60fps, that is 16.67 ms per frame for both layout recalculation and
paint, which causes dropped frames on mid-range mobile devices.
Additionally, stacking 6–10 animated card elements all changing their
CSS simultaneously compounds the cost.

**Why it happens:**
Card "fly into deck" animations are intuitively modeled as cards moving
from their original position to a deck position in the corner. Developers
reach for absolute positioning + `left`/`top` changes, which are
layout-triggering.

**Consequences:**

- Janky card transitions on mid-range Android devices (the majority of
  mobile onboarding users globally).
- The 60fps requirement stated in the project constraints is violated
  from day one.

**Prevention:**

- Use only `transform: translate()` and `opacity` for all card
  animations. These are GPU-composited and do not trigger layout.
  `transform: translate(Xpx, Ypx) rotate(Ndeg) scale(S)` covers all
  required card motion.
- Use `will-change: transform` on the actively animating card element
  only — not on all cards in the stack simultaneously (that creates
  excessive compositor layers).
- The FLIP (First-Last-Invert-Play) technique is the standard pattern
  for animating elements from one DOM position to another without
  `left`/`top` changes. If cards need to fly to deck positions at
  different corners, FLIP avoids layout-triggering properties entirely.
- Limit simultaneous animated cards to 1–2. The top card animates out,
  the next card animates in; the rest of the stack shifts with a simpler
  `transform: translateY` nudge.

**Detection:**

- Chrome DevTools Performance panel: look for long "Layout" bars in the
  flame graph during card transitions.
- Enable "Paint flashing" in DevTools — card transitions should not
  flash green on the entire card area on every frame.

**Phase:** Core card-stack implementation. Performance must be validated
before the experiment rolls out to avoid skewing engagement metrics with
a laggy experience.

---

## Moderate Pitfalls

---

### Pitfall 5: Accidental Swipe with No Undo

**What goes wrong:**
Swipe thresholds that are too sensitive cause users to accidentally
reject cards they wanted to accept. Without an undo mechanism, rejected
products are gone from the main stack. Users notice the missing product
only at the final "Get started" screen. Frustration peaks when they
cannot figure out how to go back.

**Prevention:**

- Set a deliberate minimum swipe distance threshold (e.g., 30–40% of
  card width) before a swipe is committed. Short taps or accidental
  drags should snap the card back to center.
- Provide a visible "undo last swipe" affordance, or make the
  rejected-card deck at the bottom interactive so users can drag a card
  back into the main stack.
- Alternatively: do not treat a swipe as a permanent rejection during
  the initial stack pass. Show a summary screen after all cards are
  reviewed, where users can revise their choices before continuing.

**Phase:** Card interaction design (Phase 1). Undo behavior is easier
to design in than to add after user testing reveals frustration.

---

### Pitfall 6: Decision Fatigue from Too Many Cards

**What goes wrong:**
PostHog currently has 10+ products available in onboarding
(`availableOnboardingProducts` in `utils.tsx`). Showing all of them as
swipeable cards sequentially exhausts users before they reach the end
of the deck. The original problem with the simplified variant was that
users skipped early; showing 10 cards to swipe adds a different
problem — swipe fatigue causes users to reject everything after card 5.

**Prevention:**

- Apply the same recommendation logic the control variant uses
  (browsing history, AI recommendations) to pre-sort or pre-filter the
  card deck. Show recommended products first and surface secondary
  products only if the user finishes the main deck.
- Consider a "core" deck of 5–6 highest-relevance products, with an
  optional "explore more" continuation.
- Track per-card acceptance rate in the experiment. If acceptance rate
  drops sharply after card 4–5, it signals deck length is the problem.

**Phase:** Card content / ordering (Phase 2 / iteration). Deck length
can be tuned after initial launch based on observed drop-off per card
position.

---

### Pitfall 7: Z-Index Stacking Conflicts with Onboarding Layout

**What goes wrong:**
The card-stack requires layered cards with z-index ordering (top card
highest). The existing onboarding layout uses positioned elements for
the logomark, navigation buttons, and various overlays. CSS `transform`
on a parent element creates a new stacking context, which resets the
z-index coordinate space. A `transform` on the card container will
cause child card z-indexes to be evaluated relative to the container,
not the page — meaning a `z-index: 100` on a card tooltip will not
appear above a `z-index: 10` element outside the container.

**Prevention:**

- Use `isolation: isolate` on the card container rather than
  `position: relative` + arbitrary z-index values. This explicitly
  creates a stacking context without the transform side-effect.
- Assign z-index values to cards using a small, predictable range
  (e.g., 1–5 for the visible stack depth) scoped within the container.
- Test with dark-mode and light-mode simultaneously — PostHog's dark
  theme uses different surface colors that can expose z-index layering
  as visual artifacts (card shadows bleeding through).

**Phase:** CSS/layout implementation. Catch during component development,
not after.

---

### Pitfall 8: Measuring the Wrong Experiment Metric (Peeking Problem)

**What goes wrong:**
The natural temptation is to check experiment results daily once the
card-stack launches. Early data will show card-stack users having higher
engagement (they touch more products) but possibly lower immediate
conversion to "Get started" if the swiping takes longer. Stopping the
experiment early based on this intermediate signal produces a false
positive.

**Prevention:**

- Define primary and counter metrics before launch:
  - Primary: product selection completion rate (user reaches the first
    onboarding step after product selection)
  - Counter: time-to-complete product selection (ensure the card UX
    does not make onboarding significantly slower)
  - Secondary: number of products selected (card-stack hypothesis is
    that users explore more)
- Set a minimum experiment runtime based on PostHog's recommended sample
  size calculator before examining results.
- Distinguish "interaction events" (card swiped) from "conversion events"
  (onboarding step completed). High swipe counts with low conversion is
  a red flag, not a success signal.

**Phase:** Experiment setup (before launch). Metrics defined after
seeing early data are compromised.

---

### Pitfall 9: Content Readability on Small Cards

**What goes wrong:**
Trading card aesthetics favor rich visual design: artwork, color bands,
product icons, hedgehog characters, and capability lists. On a card
that fits on a mobile screen (roughly 320px–360px wide), all of this
content competes for space. The most common failure mode is truncated
descriptions, oversized icons pushing text off-card, or a card that
looks impressive at 1440px and illegible at 390px.

**Prevention:**

- Design card content to a mobile-first 360px × 500px bounding box.
  Scale up for desktop, not the reverse.
- Limit card content to: product icon, product name, one-sentence
  user-centric description (< 80 characters, matching the
  `userCentricDescription` pattern already in
  `availableOnboardingProducts`), and one visual element (hedgehog or
  icon). No capability lists on the card face.
- Test content overflow with the longest product name + description
  combination in the existing `availableOnboardingProducts` data.

**Phase:** Card visual design (Phase 1). Content hierarchy decisions
made after visual polish is applied are expensive to change.

---

## Minor Pitfalls

---

### Pitfall 10: Drag-Click Ambiguity

**What goes wrong:**
When a user taps a card intending a click (e.g., to read more about the
product), the slightest finger movement registers as a drag-start. The
card begins to move, the tap event is suppressed, and the user is
confused.

**Prevention:**
Use a drag dead-zone (the existing `SimplifiedProductSelection` already
implements `DRAG_DEAD_ZONE = 5` pixels). Only begin a drag gesture
after the pointer has moved more than the threshold. If the pointer
is released within the dead-zone, treat the interaction as a click.

**Phase:** Core implementation. The existing carousel pattern is
already correct — replicate it.

---

### Pitfall 11: Entrance Animation Causing Layout Shift

**What goes wrong:**
Cards that animate in on component mount (scale-up, fade-in) can cause
Cumulative Layout Shift (CLS) if the card container does not have a
fixed height declared before the animation begins. The rest of the
onboarding page reflowing around the card stack during mount is a
jarring experience.

**Prevention:**

- Reserve the full card-stack height in the DOM immediately (fixed
  height container) and use `opacity: 0` as the initial state for
  entrance animations, not `height: 0` or `scale: 0` on an
  unconstrained container.
- The existing `SimplifiedProductSelection` delays mounting with a 100ms
  `setTimeout` → `setMounted` pattern to avoid SSR/hydration mismatch.
  The card-stack should follow the same pattern.

**Phase:** Core implementation.

---

### Pitfall 12: "Trading Card" Aesthetic Drifting to "Dating App"

**What goes wrong:**
The visual direction is explicitly "trading card, not Tinder". The most
common drift path: adding left/right color overlays (green tint for
accept, red tint for reject) that appear during drag. This is the
signature Tinder interaction and will immediately make the UI feel like
a dating app, against brand direction.

**Prevention:**

- Use PostHog brand signals for accept/reject feedback: the existing
  hedgehog characters and product icon colors provide enough visual
  feedback without green/red overlays.
- For accept/reject states, lean into the "collecting a card" metaphor:
  accepted cards visually fly into a stack with the PostHog logomark,
  rejected cards flip face-down. No red/green color coding required.
- Review any swipe-feedback design against the explicit "not Tinder"
  requirement before implementing.

**Phase:** Visual design review (before or during Phase 1).

---

## Phase-Specific Warnings

| Phase Topic                                    | Likely Pitfall                                  | Mitigation                                                                    |
| ---------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Flag migration (replacing old simplified flag) | Variant contamination for in-progress users     | Keep old flag active during transition; use `$set_once` for sticky assignment |
| Card drag implementation                       | Mobile scroll-swipe conflict                    | Set `touch-action: none` on drag surface immediately                          |
| Card drag implementation                       | Drag-click ambiguity                            | Implement dead-zone (≥5px) from the start                                     |
| Card animations (fly-to-deck)                  | Layout-triggering properties causing jank       | Use only `transform` and `opacity`; validate with DevTools                    |
| Card visual design                             | "Tinder feel" creeping in                       | No green/red overlays; use hedgehog/brand visual feedback                     |
| Card content layout                            | Overflow at mobile widths                       | Design for 360px first; test longest product name                             |
| Keyboard / accessibility                       | Gesture-only interaction                        | Add arrow-key bindings and visible accept/reject buttons alongside gestures   |
| Experiment launch                              | Peeking at early results                        | Define primary + counter metrics and minimum runtime before launch            |
| Card deck length                               | Swipe fatigue at card 5+                        | Pre-sort by recommendation signal; consider 5-card primary deck               |
| Z-index layering                               | Stacking context conflicts with layout overlays | Use `isolation: isolate` on card container                                    |

---

## Sources

- WCAG 2.5.1 Pointer Gestures: https://www.accessitree.com/wcag-ultimate-guide/provide-single-pointer-alternatives-for-complex-gestures/
- WCAG 2.1.1 Keyboard Accessibility: https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html
- Animation performance (GPU compositing): https://www.algolia.com/blog/engineering/60-fps-performant-web-animations-for-optimal-ux
- Web Animation Performance Tier List (Motion): https://motion.dev/magazine/web-animation-performance-tier-list
- CSS stacking contexts and z-index: https://www.joshwcomeau.com/css/stacking-contexts/
- PostHog sticky feature flags: https://posthog.com/tutorials/sticky-feature-flags
- PostHog A/B testing mistakes: https://posthog.com/product-engineers/ab-testing-mistakes
- PostHog experiment best practices: https://posthog.com/docs/experiments/best-practices
- Material Design card guidelines (no swipeable content inside cards): https://m2.material.io/components/cards
- Swipe gesture accessibility (Access Guide): https://www.accessguide.io/guide/single-pointer-gestures
- Framer Motion drag + scroll conflict issue #185: https://github.com/framer/motion/issues/185
- react-native-gesture-handler scroll conflict issue #1691: https://github.com/software-mansion/react-native-gesture-handler/issues/1691
- Decision fatigue and Hick's Law in onboarding: https://nudgenow.com/blogs/onboarding-ux-guide
- Accessible card UI component patterns: https://dap.berkeley.edu/web-a11y-basics/accessible-card-ui-component-patterns
