# Project Research Summary

**Project:** Onboarding Card Stack Variant
**Domain:** Swipeable card-deck UI — onboarding product selection experiment variant
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

This project adds a third variant (`card-stack`) to PostHog's onboarding product selection flow alongside the existing `control` (grid) and `simplified` (carousel) variants. The pattern is a swipeable card deck — right to accept a product, left to reject — inspired by trading card game mechanics rather than dating-app UX. The interaction is well-understood, the implementation primitives are already installed (`motion@^12.26.1`, Tailwind v4), and the codebase contains a directly reusable reference implementation in `SimplifiedProductSelection.tsx` covering spring physics, pointer events, keyboard navigation, and the product data model.

The recommended approach is to build `CardStackProductSelection` as a self-contained component that plugs into the existing `ProductSelection` variant switch. No new libraries are needed. The component reuses `productSelectionLogic` for selection state and `availableOnboardingProducts` for card content. The only non-trivial changes outside the new component are: adding a new multi-variant feature flag (`onboarding-product-selection-variant`) to replace the existing two-variant flag, and extending the `RecommendationSource` union type to add `'card-stack'` for experiment attribution.

The key risks are: (1) breaking mobile swipe due to scroll-swipe gesture conflicts — mitigated by applying `touch-action: none` on the drag surface from day one; (2) corrupting the A/B experiment through flag migration contamination — mitigated by running both flags in parallel during the transition period; and (3) accessibility violations if keyboard alternatives are omitted — mitigated by mirroring the arrow-key handler pattern already in `SimplifiedProductSelection`. Animation performance must use only `transform` and `opacity` (no `top`/`left`) to stay at 60fps on mid-range mobile.

## Key Findings

### Recommended Stack

No new dependencies are required. The `motion` package (v12.26.1, already installed) provides every primitive needed: `drag` prop for gesture handling, `useMotionValue` / `useTransform` for tilt-during-drag, `useSpring` for snap-back physics, `useAnimate` for imperative fly-to-deck animation, and `AnimatePresence` for mount/unmount transitions. Tailwind v4 handles card stack depth via inline style offsets (`translateY`, `scale`, `zIndex`) indexed by stack position.

**Core technologies:**

- `motion/react` v12 (Motion for React): animation engine, gesture handling, spring physics — already installed, already used in PostHog surveys wizard
- Tailwind CSS v4: card visual layout, stack depth offsets, responsive sizing — already installed codebase-wide
- Motion `drag` prop (built-in): swipe gesture detection with `info.offset.x` and `info.velocity.x` on `onDragEnd` — replaces any need for `@use-gesture/react` (unmaintained) or `react-tinder-card` (low maintenance)

**Do not add:** `react-spring` (+40KB, redundant), `@use-gesture/react` (last published 2022), `react-tinder-card` (thin wrapper, bad TypeScript support), GSAP (licensing complexity, overkill), CSS-only approaches (cannot do threshold/velocity detection without JS).

### Expected Features

**Must have (table stakes):**

- Swipe right = accept, swipe left = reject — the universal mental model; directional meaning is non-negotiable
- Rotation/tilt proportional to drag distance — card feels frozen without it
- Spring snap-back when drag released below threshold — missing this makes the UI feel broken
- Directional overlay label (accept/reject stamp) fading in during drag — visual confirmation of intent
- Card fly-out animation landing in a visible pile — the deck-building metaphor collapses without it
- Visible accepted and rejected piles at bottom of screen
- Progress indicator ("X of N remaining")
- End-of-deck state with "Continue with selected" CTA
- Button-based accept/reject controls — WCAG 2.5.7 requires a single-pointer alternative to all path-based gestures
- Keyboard support: ArrowLeft = reject, ArrowRight = accept, Enter = accept (mirrors `SimplifiedProductSelection` pattern)
- Stack depth illusion (2–3 cards visible behind the top card)
- Card content: hedgehog mascot, product color accent, `userCentricDescription`, `capabilities[]`, `socialProof`

**Should have (differentiators / polish):**

- Undo last swipe (single level) — reduces regret for accidental swipes
- Pile animation when a card lands (brief scale pulse)
- Entrance animation with staggered card deal-in on mount
- Haptic feedback on card commit (`navigator.vibrate(40)`)
- Keyboard hint bar (reuse from `SimplifiedProductSelection`)
- Ambient color wash from product accent color (already present in simplified variant)

**Defer to v2+:**

- Deck pre-filtering based on recommendation signals (observational data from Phase 1 needed first)
- Interactive rejected-deck (drag back from rejected pile)
- "Explore more" continuation after a core 5-card primary deck

**Explicitly out of scope (anti-features):**

- Tinder visual language: no red/green overlays, no fire animations, no "It's a Match!"
- Swipe up/down actions, super-likes, score/compatibility framing
- Sound effects, gamification score, heavy 3D/holographic effects
- Skip-all button, deck reordering, swipe-sensitivity settings UI

### Architecture Approach

The new component slots cleanly into the existing variant-switch pattern in `ProductSelection.tsx`. The component tree already has the right seam: `ProductSelection` reads the feature flag and renders the appropriate variant; all variants share `productSelectionLogic` and `availableOnboardingProducts`. The only structural change to existing files is replacing the old two-variant flag check with a three-way switch on the new multi-variant flag. `CardStackProductSelection` itself is self-contained — its accept/reject deck state is pure `useState` (local UI state, no kea needed for first iteration).

**Major components:**

1. `CardStackProductSelection.tsx` (new) — swipeable card deck, drag physics, pile accumulation, end-of-deck state; communicates with `productSelectionLogic` and `inviteLogic` only
2. `CardStackProductSelection.scss` (new) — CSS keyframe animations for card fly-out transitions
3. `ProductSelection.tsx` (modified) — add `'card-stack'` branch to variant switch, retire old `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` guard after flag migration
4. `constants.tsx` (modified) — add `ONBOARDING_PRODUCT_SELECTION_VARIANT` multi-variant flag constant
5. `productSelectionLogic.ts` (minor extension) — add `'card-stack'` to `RecommendationSource` union type

**Boundaries to respect:**

- `CardStackProductSelection` must not define its own product data — read from `availableOnboardingProducts` only
- `CardStackProductSelection` must not call `onboardingLogic` directly — delegate to `productSelectionLogic.selectSingleProduct()`
- `onboardingLogic` is variant-agnostic; keep it that way

### Critical Pitfalls

1. **Mobile scroll-swipe conflict** — Apply `touch-action: none` to the drag surface element (not the page) from the first commit. Test on iOS Safari 17+ and Android Chrome before shipping. The existing `SimplifiedProductSelection` already uses this pattern — replicate it exactly.

2. **Feature flag migration contaminating the A/B experiment** — Run the old `onboarding-simplified-product-selection` flag in parallel with the new multi-variant flag during the transition period. `ProductSelection` checks the new flag first and falls through to the old flag as a safety net. Do not remove the old flag until all active onboarding sessions have resolved. Use `$set_once` person properties for sticky variant assignment.

3. **Accessibility violation (WCAG 2.5.1 / 2.1.1)** — Add arrow-key bindings and visible Accept/Reject buttons at the same time as the drag gesture, not as a follow-up. PostHog's primary users are developers who commonly navigate by keyboard. Screen reader users must receive `aria-label` on each card and live-region announcements on card dismissal.

4. **Animation jank from layout-triggering properties** — All card animations must use only `transform` (translate, rotate, scale) and `opacity`. Never animate `top`, `left`, `width`, `height`, `margin`. Use `will-change: transform` on the actively animating card only. Validate with Chrome DevTools Performance panel before the experiment rolls out.

5. **"Tinder feel" visual drift** — No green/red color overlays on the card during drag. Use PostHog-branded feedback: hedgehog art, product icon colors, checkmark/X from `@posthog/icons`. Accepted cards fly into a branded stack; rejected cards flip face-down. Review every drag-feedback design decision against this constraint.

## Implications for Roadmap

Based on the dependency graph from ARCHITECTURE.md and the phase-specific warnings from PITFALLS.md, a four-phase structure is recommended.

### Phase 1: Foundation and Flag Setup

**Rationale:** All implementation work is blocked until the feature flag constant exists and is readable locally. The flag migration must be designed before any user traffic reaches the new component to avoid experiment contamination (Pitfall 2). This phase has zero UI work and can be done in a single PR.

**Delivers:** New `ONBOARDING_PRODUCT_SELECTION_VARIANT` multi-variant constant in `constants.tsx`; updated `ProductSelection.tsx` with a three-way variant switch that falls through to the old flag for the `'simplified'` case during transition; `'card-stack'` added to `RecommendationSource` in `productSelectionLogic.ts`.

**Addresses:** Flag migration pitfall (Pitfall 2); unblocks local development of the card component against a real flag value.

**Avoids:** Experiment contamination; stale `recommendationSource` analytics attribution.

**Research flag:** Standard patterns — no additional research needed. The flag constant structure is identical to the existing pattern at `constants.tsx` lines 372–378.

### Phase 2: Core Card Interaction

**Rationale:** The drag mechanic, spring physics, and swipe threshold detection are the load-bearing interaction. Everything else (pile visuals, end state, polish) depends on this working correctly. Building it in isolation, with Storybook coverage, before integration into `ProductSelection.tsx` allows fast iteration without touching the live flow.

**Delivers:** `CardStackProductSelection.tsx` with: Motion `drag` prop handling, `useMotionValue` / `useTransform` for tilt, spring snap-back on sub-threshold release, swipe threshold detection (configurable constant), card fly-out animation using `useAnimate`, accept/reject pile state (`useState`), progress indicator, keyboard arrow-key bindings, visible Accept/Reject buttons, `touch-action: none` on drag surface, `aria-label` on cards, and live-region announcements. Includes a Storybook story with the flag set to `'card-stack'`.

**Addresses:** Table stakes features 1–10 from FEATURES.md; Pitfalls 1 (scroll conflict), 3 (accessibility), 4 (animation performance), 10 (drag-click ambiguity), 11 (entrance animation CLS).

**Stack used:** Motion `drag`, `useMotionValue`, `useTransform`, `useSpring`, `useAnimate`, `AnimatePresence` from `motion/react`; Tailwind for stack depth offsets.

**Research flag:** Standard patterns — Motion card swipe is a well-documented canonical pattern with an official tutorial. The main implementation variable is threshold tuning (`SWIPE_CONFIDENCE_THRESHOLD`), which requires empirical testing not research.

### Phase 3: Visual Design and Card Content

**Rationale:** Visual design decisions (card content hierarchy, stack depth illusion, accepted/rejected pile presentation, product color accents, hedgehog art) are independent of the gesture logic and can be iterated without changing the interaction model. Separating this phase avoids blocking gesture work on design decisions.

**Delivers:** Card face with product color accent bar, hedgehog mascot from `PRODUCT_HEDGEHOG` map, `userCentricDescription`, `socialProof`, stack-depth illusion (2–3 cards), accepted/rejected pile with product icon thumbnails, end-of-deck confirmation view, `CardStackProductSelection.scss` for fly-out keyframes, `isolation: isolate` on card container to prevent z-index conflicts.

**Addresses:** Differentiator features from FEATURES.md; Pitfalls 7 (z-index stacking), 9 (content readability on small cards), 12 ("Tinder feel" drift). Design to a 360px mobile-first bounding box.

**Research flag:** Standard patterns — reuses `PRODUCT_HEDGEHOG`, `iconColor`, and product data already established by `SimplifiedProductSelection`. No new research needed; cross-check visual decisions against the "not Tinder" constraint documented in PITFALLS.md Pitfall 12.

### Phase 4: Integration, Analytics Verification, and Experiment Launch

**Rationale:** Integration into the live `ProductSelection.tsx` is a 3-line change once the component exists. This phase also includes experiment setup (primary/counter metrics defined before any traffic), analytics verification (confirming `recommendation_source: 'card-stack'` flows through `addProductIntent`), and the flag migration completion (retiring the old `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` guard).

**Delivers:** Live card-stack variant wired into `ProductSelection.tsx`; experiment metrics defined (primary: product selection completion rate; counter: time-to-complete; secondary: products selected per session); analytics event verification in test environment; old flag guard removed after traffic drains from the old flag; optional Phase 2 polish items (undo last swipe, pile animation on card land, haptic feedback, entrance animation).

**Addresses:** Pitfalls 2 (flag migration completion), 5 (accidental swipe — undo), 6 (deck length observation baseline), 8 (experiment metric definition before launch).

**Research flag:** Needs attention on experiment metric definition. The peeking problem (Pitfall 8) and deck-length tuning (Pitfall 6) require deliberate pre-launch decisions. Review PostHog's own A/B testing best practices doc before setting experiment runtime and minimum sample size.

### Phase Ordering Rationale

- Flag setup must precede component work to enable local testing without code workarounds.
- Core interaction must be complete and validated before visual polish is layered on — gesture bugs are invisible under visual complexity.
- Integration is last and trivial because the component is self-contained; the 3-line `ProductSelection` change carries no risk once the component is tested in Storybook.
- Analytics verification is co-located with integration, not Phase 2, because it requires a real flag assignment to confirm event properties flow end-to-end.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4:** Experiment metric definition and minimum runtime calculation — PostHog's sample size calculator and A/B testing best practices should be reviewed before launch. Deck length tuning (how many cards to show before "explore more") requires observational data from the first cohort.

Phases with standard patterns (skip research-phase):

- **Phase 1:** Flag constant addition follows an established pattern; no research needed.
- **Phase 2:** Motion card-swipe pattern is documented with an official tutorial and a canonical example. The pattern is confirmed against PostHog's existing `motion/react` usage.
- **Phase 3:** All visual content sources (`PRODUCT_HEDGEHOG`, `iconColor`, `userCentricDescription`) are already established in the codebase.

## Confidence Assessment

| Area         | Confidence                       | Notes                                                                                                                                                   |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH                             | `motion@^12.26.1` confirmed installed; import pattern confirmed in existing PostHog code; all APIs verified against official Motion docs                |
| Features     | HIGH (core) / MEDIUM (tradeoffs) | Gesture/animation table stakes are well-established; PostHog-specific tradeoffs (deck length, undo UX) depend on user testing                           |
| Architecture | HIGH                             | Existing variant-switch pattern is fully understood; component boundaries and data flow are confirmed from codebase inspection                          |
| Pitfalls     | HIGH                             | Critical pitfalls (scroll conflict, flag migration, accessibility, animation performance) all have confirmed reproduction patterns and documented fixes |

**Overall confidence:** HIGH

### Gaps to Address

- **Swipe threshold value (`SWIPE_CONFIDENCE_THRESHOLD`):** Research identifies the pattern (`Math.abs(offset.x) * velocity.x > threshold`) but the exact threshold value requires manual calibration during implementation. Start with the value from Motion's official swipe tutorial and tune against physical testing on mobile.
- **Deck length (10 cards vs. filtered subset):** `availableOnboardingProducts` currently has 10 products. Whether to show all 10 or apply recommendation pre-filtering for a shorter "core" deck is an experiment design question, not a code question. Defer the decision to Phase 4 based on initial cohort drop-off data. For Phase 2 implementation, render all available products.
- **Multi-product acceptance flow:** The data flow diagram in ARCHITECTURE.md shows `selectSingleProduct(acceptedDeck[0])` — this handles only the first accepted product. If the card-stack variant is intended to support multi-product selection (like the control grid variant), `productSelectionLogic` needs a more significant extension. This should be clarified in requirements before Phase 2 implementation begins.
- **`RecommendationSource` type extension:** Adding `'card-stack'` is a one-line change but requires confirming whether any backend analytics consumers depend on the exhaustive list of values. Check `productSelectionLogic.ts` call sites before Phase 1 PR is merged.

## Sources

### Primary (HIGH confidence)

- Motion for React drag guide: https://motion.dev/docs/react-drag
- Motion for React gestures: https://motion.dev/docs/react-gestures
- Motion swipe actions tutorial: https://motion.dev/tutorials/react-swipe-actions
- Motion card stack example: https://motion.dev/examples/react-card-stack
- Motion useAnimate docs: https://motion.dev/docs/react-use-animate
- `frontend/src/scenes/onboarding/productSelection/SimplifiedProductSelection.tsx` — spring physics, pointer events, keyboard nav pattern
- `frontend/src/scenes/onboarding/productSelection/productSelectionLogic.ts` — `selectSingleProduct`, `RecommendationSource`
- `frontend/src/scenes/onboarding/productSelection/ProductSelection.tsx` — variant-switch pattern
- `frontend/src/scenes/onboarding/utils.tsx` — `availableOnboardingProducts` product registry
- `frontend/src/lib/constants.tsx` lines 372–378 — existing feature flag constant pattern
- `frontend/package.json` — confirmed `motion@^12.26.1` installed

### Secondary (MEDIUM confidence)

- WCAG 2.5.1 Pointer Gestures: https://www.accessitree.com/wcag-ultimate-guide/provide-single-pointer-alternatives-for-complex-gestures/
- Animation performance (GPU compositing): https://www.algolia.com/blog/engineering/60-fps-performant-web-animations-for-optimal-ux
- PostHog sticky feature flags: https://posthog.com/tutorials/sticky-feature-flags
- PostHog A/B testing mistakes: https://posthog.com/product-engineers/ab-testing-mistakes
- PostHog experiment best practices: https://posthog.com/docs/experiments/best-practices
- Framer Motion drag + scroll conflict issue #185: https://github.com/framer/motion/issues/185

### Tertiary (LOW confidence)

- Swipe threshold and card stack patterns: FlutterFlow SwipeableStack docs, gajus/swing library — general pattern confirmation only; exact threshold values need empirical calibration
- Decision fatigue and Hick's Law in onboarding: https://nudgenow.com/blogs/onboarding-ux-guide — informs deck-length concern; no PostHog-specific data

---

_Research completed: 2026-03-20_
_Ready for roadmap: yes_
