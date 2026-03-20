# Feature Landscape: Card Stack / Swipe Variant for Onboarding Product Selection

**Domain:** Swipeable card-deck UI for SaaS onboarding product selection
**Researched:** 2026-03-20
**Overall confidence:** HIGH (core gesture/animation patterns) / MEDIUM (specific PostHog-context tradeoffs)

---

## Context

This feature adds a third variant — `card-stack` — to the existing
`onboarding-product-selection-variant` multi-variant flag, sitting alongside:

- **control**: full grid of all products simultaneously
- **simplified**: single-focus horizontal carousel (already built — see
  `SimplifiedProductSelection.tsx`)

The card-stack variant is inspired by trading card game mechanics (not Tinder/dating).
Users swipe through a deck of PostHog product cards — right to accept, left to reject —
building two visible "played" piles at the bottom.
The goal: keep the one-at-a-time decision simplicity of the simplified variant while
adding engagement mechanics that prevent users from skipping without exploring.

The simplified variant already proves the following work in PostHog's codebase and
can be reused as reference: spring physics animation loop (requestAnimationFrame),
pointer event handling with dead-zone detection, keyboard navigation (arrow keys +
Enter), hedgehog mascots per product, product color accent bars, social proof labels,
and user-centric descriptions.

---

## Table Stakes

Features where their absence makes the interaction feel broken or confusing.

| Feature                                                  | Why Expected                                                                                     | Complexity | Notes                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| Swipe right = accept, swipe left = reject                | This is the universal mental model — any deviation confuses users instantly                      | Low        | The directional meaning is load-bearing; never swap it                                                |
| Rotation/tilt proportional to drag distance              | Without tilt, the card feels frozen and unresponsive to gesture input                            | Low        | CSS `rotate()` transform tied to drag x offset                                                        |
| Spring snap-back when drag released below threshold      | Cards that don't snap back feel broken; users assume it stalled                                  | Low        | Use spring physics already present in `SimplifiedProductSelection.tsx`                                |
| Distinct accept/reject threshold                         | Card must fly to deck only when dragged far enough; premature or missed triggers destroy trust   | Low        | Threshold ~25–35% of card width recommended; expose as constant                                       |
| Directional overlay label (accept/reject stamp)          | Without visible confirmation, users don't know which pile the card is heading toward             | Low        | Opacity scales with drag offset; green checkmark right, red X left — or PostHog-branded equivalents   |
| Card fly-out animation (card travels to deck on confirm) | Without the card visibly landing in a pile, the deck-building metaphor breaks                    | Medium     | CSS/JS animation; card translates from center position to deck position                               |
| Visible accepted and rejected piles at bottom            | The core feedback loop — users must see their selections accumulate                              | Medium     | Overlapping fanned cards; accepted pile and rejected pile clearly differentiated                      |
| Empty deck / end-of-deck state                           | Users need to know when they've reviewed every product; a missing end state leaves them guessing | Low        | Confirmation view showing accepted products; CTA to continue                                          |
| "Continue with selected" action                          | The actual outcome — must be reachable from the end-of-deck state                                | Low        | Maps to existing `handleStartOnboarding` logic                                                        |
| Keyboard support (arrow keys + Enter/Space)              | Desktop users must be able to use the flow without a mouse or touch screen                       | Low        | Arrow keys already handled in `SimplifiedProductSelection.tsx`; extend: Left = reject, Right = accept |
| Button-based accept/reject controls                      | WCAG 2.5.7 — any drag gesture must have a single-pointer alternative                             | Low        | Two visible buttons beneath the card (or explicit Accept / Skip buttons)                              |
| Touch/pointer event handling                             | Mobile users swipe; desktop users drag; both must work consistently                              | Low        | Pointer Events API already used in simplified variant — reuse the pattern                             |
| Card count / progress indicator                          | Users need to know how many cards remain; without it the deck feels infinite                     | Low        | "3 of 10" or a dot-strip indicator above the deck                                                     |

---

## Differentiators

Features that make the interaction feel polished, memorable, and brand-appropriate.
None of these are required for basic function, but they raise the quality ceiling.

| Feature                                                          | Value Proposition                                                                            | Complexity | Notes                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Card tilt tracks drag with natural rotation arc (±15–20 deg max) | Makes the card feel physically held — like picking up a real card                            | Low        | `rotate(${dragX / cardWidth * 20}deg)` is the common pattern                                 |
| Stack-depth illusion (2–3 cards visible behind top card)         | Communicates "there are more cards" without showing content; creates anticipation            | Low        | CSS translateY + scale on z-1/z-2 cards; update as deck shrinks                              |
| Directional overlay fades in progressively                       | Reinforces intent without committing — user can see what would happen before releasing       | Low        | Overlay opacity = `Math.min(Math.abs(dragX) / threshold, 1)`                                 |
| Deck bottom piles animate when card lands                        | Completion satisfaction — the pile twitches or fans briefly when a card arrives              | Medium     | Brief scale pulse or fan-spread on the pile container                                        |
| Accepted/rejected pile shows product icon thumbnails             | Visual proof of progress; users can scan what they chose                                     | Low        | Overlapping mini-card icons; product `iconColor` used as card tint                           |
| Hedgehog mascot per product (from simplified variant)            | Maintains PostHog brand voice; each product already has a mapped hedgehog                    | Low        | Reuse `PRODUCT_HEDGEHOG` map from `SimplifiedProductSelection.tsx`                           |
| Product color accent per card (top bar or border)                | Visual differentiation between products without relying on text alone                        | Low        | Already established pattern; reuse `spotlightProduct.iconColor`                              |
| Social proof text on each card                                   | Adds credibility and urgency ("Used by 185K+ teams")                                         | None       | Already in product data as `socialProof` field                                               |
| Capabilities bullet list on each card                            | Shows what the product actually does — reduces "what is this?" uncertainty                   | Low        | Already in product data as `capabilities[]` field                                            |
| Undo last swipe (single level)                                   | Prevents regret / accidental swipes — important for users who haven't used swipe UIs before  | Medium     | Store last action in state; "Undo" button visible briefly after swipe; reverses card fly-out |
| Keyboard hint bar (same as simplified variant)                   | Desktop discoverability — users don't know arrow keys work unless told                       | None       | Reuse the `<kbd>` hint strip from `SimplifiedProductSelection.tsx`                           |
| Haptic feedback on card commit (Web Vibration API)               | Adds tactile satisfaction on mobile; short 30–50ms pulse on swipe confirm                    | Low        | `navigator.vibrate(40)` — check `navigator.vibrate` exists first; degrade gracefully         |
| Ambient color wash (product accent on page background)           | Already present in simplified variant; maintains continuity between variants                 | None       | Reuse existing pattern                                                                       |
| Entrance animation (cards deal in on mount)                      | First impression — cards appearing with a staggered delay feel deliberate, not instantaneous | Low        | Staggered translateY + opacity transition with index-based delay, same as simplified variant |
| "You can always add more from Settings" footnote                 | Reduces decision anxiety — the choice isn't permanent                                        | None       | One line of text; already in simplified variant                                              |

---

## Anti-Features

Things to deliberately NOT build for this variant.

| Anti-Feature                                                                                            | Why Avoid                                                                                                                           | What to Do Instead                                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tinder-specific visual language (red heart / green X in Tinder style, fire animations, "It's a Match!") | PostHog is a B2B developer tool — dating-app connotations undermine trust and professionalism                                       | Use checkmark and X icons from `@posthog/icons`; or custom PostHog-branded stamps         |
| Swipe up / swipe down actions                                                                           | Adds cognitive complexity with no clear mapping to product selection semantics                                                      | Keep interaction strictly binary: right = yes, left = no                                  |
| Super-like / special swipe variants                                                                     | Gamification beyond the core loop adds confusion during a high-stakes first-run experience                                          | The goal is simple selection, not a game mechanic                                         |
| Score or "compatibility rating" framing                                                                 | Dating-app framing is explicitly prohibited by project direction                                                                    | Framing should be "set up your stack" not "find your match"                               |
| Infinite re-shuffle / re-swiping loop                                                                   | Wastes user time; the end-of-deck state must clearly terminate the selection phase                                                  | Show end state once all cards are dealt; provide undo for mistakes                        |
| Forced one-product-only outcome                                                                         | Card stack should allow multi-accept (like the control variant); rejecting all others is valid                                      | Users can accept any number of products; at end-of-deck, "selected" list may be 1–N items |
| Sound effects                                                                                           | Browser audio during onboarding is jarring and unexpected; most users have audio on from prior work                                 | Use haptics (optional) and visual feedback only                                           |
| Gamification score / leaderboard / points                                                               | This is an onboarding flow, not a game — metrics must be invisible to the user                                                      | Track events via PostHog analytics in the background only                                 |
| Heavy 3D perspective / holographic foil effects                                                         | Trading card aesthetic should inform visual tone (collectible, colorful, branded), not literally replicate Pokemon card CSS effects | Use product `iconColor` accents, hedgehog art, and PostHog bold typography                |
| Skip-all button                                                                                         | Defeats the purpose of the card-stack variant — the whole point is exploration before skipping                                      | Users can reject every card one at a time; end-of-deck state has an escape                |
| Reordering / sorting the deck                                                                           | Adds unnecessary complexity; cards should come in a fixed recommended order                                                         | Use same product order as `availableOnboardingProducts` in `utils.tsx`                    |
| Swipe sensitivity settings                                                                              | Over-engineering; calibrate a good threshold once and keep it                                                                       | Document threshold constant in code comments                                              |

---

## Feature Dependencies

```text
Spring snap-back animation
  → required by: Tilt during drag, Card fly-out animation, Deck building

Drag gesture (pointer events)
  → required by: Tilt during drag, Directional overlay, Swipe threshold detection
  → parallel alternative: Button-based accept/reject (independent of drag)

Swipe threshold detection
  → required by: Card fly-out animation, Pile accumulation

Card fly-out animation
  → required by: Pile accumulation (cards must land in pile visually)
  → optional extension: Undo last swipe (reverses fly-out)

Pile accumulation (accepted / rejected piles)
  → required by: Progress indicator (pile count = progress)
  → required by: End-of-deck state ("continue with selected")

End-of-deck state
  → required by: "Continue with selected" CTA

Keyboard support
  → depends on: Same accept/reject logic as swipe (shared action)
  → independent of: Drag gesture handling

Button-based controls
  → depends on: Same accept/reject logic as swipe (shared action)
  → independent of: Drag gesture handling (WCAG alternative)

Undo last swipe
  → depends on: Card fly-out animation (must reverse it)
  → depends on: Pile accumulation (must remove card from pile)

Product color / hedgehog per card
  → depends on: Existing product data (`availableOnboardingProducts`, `PRODUCT_HEDGEHOG`)
  → no new dependencies

Social proof / capabilities on card
  → depends on: Existing product data (`socialProof`, `capabilities[]`)
  → no new dependencies
```

---

## MVP Recommendation

### Phase 1 — Core interaction (ship this to validate the mechanic)

Prioritize all Table Stakes items plus the minimum viable polish:

1. Drag gesture with tilt and spring snap-back
2. Swipe threshold detection → card fly-out animation
3. Accepted and rejected piles at bottom (icons only)
4. Progress indicator ("X of N remaining")
5. End-of-deck state with "Continue" CTA
6. Button-based accept/reject controls (WCAG requirement; also mobile-friendly tap target)
7. Keyboard support (Left = reject, Right = accept, Enter = accept)
8. Directional overlay label (accept/reject stamp fades in during drag)
9. Stack depth illusion (2 cards behind top card)
10. Reuse product data: hedgehog, `iconColor`, `userCentricDescription`, `capabilities`, `socialProof`

### Defer to Phase 2 (polish)

- Undo last swipe (adds meaningful implementation complexity)
- Pile animation on card land (nice, but not blocking)
- Haptic feedback (easy but orthogonal to core validation)
- Entrance animation (worth doing, but can be added after basic flow works)

### Explicitly out of scope

Everything in the Anti-Features table.

---

## Card Content Model

Each card should display these fields (all available in existing `availableOnboardingProducts`):

| Zone                          | Content                 | Source                         |
| ----------------------------- | ----------------------- | ------------------------------ |
| Top accent bar                | Product color strip     | `iconColor`                    |
| Hero illustration             | Hedgehog mascot         | `PRODUCT_HEDGEHOG[productKey]` |
| Product name                  | Small label             | `product.name`                 |
| Headline                      | User-centric one-liner  | `userCentricDescription`       |
| Capabilities                  | 3-bullet feature list   | `capabilities[]`               |
| Social proof                  | "Used by Xk+ teams"     | `socialProof`                  |
| Accept indicator (right drag) | Checkmark stamp overlay | Opacity scaled to drag offset  |
| Reject indicator (left drag)  | X stamp overlay         | Opacity scaled to drag offset  |

---

## Interaction State Machine

```text
IDLE
  → onPointerDown / onClick accept button / Right arrow key → DRAGGING or ACCEPTING
  → onClick reject button / Left arrow key → REJECTING

DRAGGING
  → drag < threshold + onPointerUp → SNAP_BACK → IDLE
  → drag ≥ threshold (right) + onPointerUp → ACCEPTING
  → drag ≥ threshold (left) + onPointerUp → REJECTING

ACCEPTING
  → card fly-out to accepted pile
  → pile updates, progress updates
  → remaining cards > 0 → IDLE (next card)
  → remaining cards = 0 → END_OF_DECK

REJECTING
  → card fly-out to rejected pile
  → pile updates, progress updates
  → remaining cards > 0 → IDLE (next card)
  → remaining cards = 0 → END_OF_DECK

END_OF_DECK
  → accepted products list shown
  → "Continue" CTA → exits to onboarding flow
  → "Undo" (if built) → IDLE (last card returns)
```

---

## Sources

- Gesture feedback and spring physics principles: [Codebridge](https://www.codebridge.tech/articles/the-impact-of-gestures-on-mobile-user-experience), [Android Spring Animation docs](https://developer.android.com/develop/ui/views/animations/spring-animation)
- Swipe threshold and card stack patterns: [FlutterFlow SwipeableStack docs](https://docs.flutterflow.io/resources/ui/widgets/built-in-widgets/swipeable-stack/), [gajus/swing library](https://github.com/gajus/swing)
- Tinder swipe UX analysis: [Built In — What Makes Swipe Right a Compelling UX Feature](https://builtin.com/articles/tinder-swipe-design)
- Accessibility alternatives to drag (WCAG 2.5.7): [sparkbox WCAG 2.5.7](https://sparkbox.com/foundry/understanding_implementing_wcag_dragging_movements_accessibility), [AccessiTree WCAG 2.5.1](https://www.accessitree.com/wcag-ultimate-guide/provide-single-pointer-alternatives-for-complex-gestures/)
- Directional overlay pattern: [Hacking with Swift — coloring views while swiping](https://www.hackingwithswift.com/books/ios-swiftui/coloring-views-as-we-swipe), [Shuffle iOS library](https://github.com/mac-gallagher/Shuffle)
- Progress indicators in onboarding: [Mobbin — Progress Indicator UI Design](https://mobbin.com/glossary/progress-indicator), [Userpilot — Progress Bar in SaaS](https://userpilot.com/blog/progress-bar-ui-ux-saas/)
- Empty/end-of-deck state patterns: [Eleken — Empty State UX](https://www.eleken.co/blog-posts/empty-state-ux)
- Undo pattern: [NN/G — User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/), [ui-patterns.com — Undo](https://ui-patterns.com/patterns/undo)
- Haptic feedback on web: [MDN — Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- React animation library for gesture-driven UIs: [Motion (formerly Framer Motion)](https://motion.dev/), [GeeksforGeeks — Tinder swipe with framer-motion](https://www.geeksforgeeks.org/reactjs/how-to-create-tinder-card-swipe-gesture-using-react-and-framer-motion/)
- Trading card visual design reference: [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) (inspiration only — PostHog should not use literal holographic effects)
- Existing PostHog simplified variant (direct codebase reference): `frontend/src/scenes/onboarding/productSelection/SimplifiedProductSelection.tsx`
- Existing PostHog product data: `frontend/src/scenes/onboarding/utils.tsx`
