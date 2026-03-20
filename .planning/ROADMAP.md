# Roadmap: Onboarding Card Stack Variant

## Overview

Build and ship a `card-stack` variant for PostHog's onboarding product selection screen.
Starting from flag infrastructure (Phase 1), through a fully functional swipeable card deck
(Phase 2), to trading-card visual polish and experiment launch (Phase 3).
All 26 v1 requirements map across these three phases; the existing `control` and `simplified`
variants are never touched.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Flag Foundation** - Add the multi-variant feature flag and wire the three-way variant switch
- [ ] **Phase 2: Core Card Interaction** - Build the functional swipeable card deck with drag physics, accessibility, and pile state
- [ ] **Phase 3: Visual Polish and Launch** - Apply trading-card design, card content, and wire the live experiment

## Phase Details

### Phase 1: Flag Foundation

**Goal**: The new multi-variant flag exists, the variant router uses it, and analytics attribution is correct — unblocking all component work without touching user traffic
**Depends on**: Nothing (first phase)
**Requirements**: FLAG-01, FLAG-02, FLAG-03, FLAG-04
**Success Criteria** (what must be TRUE):

1. `ONBOARDING_PRODUCT_SELECTION_VARIANT` flag constant exists in `constants.tsx` with variants `control`, `simplified`, and `card-stack`
2. `ProductSelection` renders the correct variant (control, simplified, or card-stack placeholder) based on the new flag value
3. The old `onboarding-simplified-product-selection` flag remains as a fallback — existing simplified users are not disrupted
4. `RecommendationSource` type includes `'card-stack'` so analytics attribution compiles without errors
   **Plans**: TBD

### Phase 2: Core Card Interaction

**Goal**: Users can swipe through all product cards, accepting or rejecting each, and reach the end-of-deck state — the full interaction loop works correctly on both mobile and desktop
**Depends on**: Phase 1
**Requirements**: CARD-01, CARD-02, CARD-03, CARD-04, CARD-05, CARD-06, CARD-07, CARD-08, STACK-01, STACK-02, PILE-01, PILE-02, END-01, END-02, END-03, VIS-03
**Success Criteria** (what must be TRUE):

1. User can drag a card right or left; the card tilts proportionally, shows an accept/reject overlay, and flies into the correct pile when the swipe threshold is crossed
2. User can accept or reject a card using the on-screen buttons or ArrowRight/ArrowLeft keys — no drag required
3. Accepted cards accumulate in a bottom-right pile and rejected cards in a bottom-left pile, both visible throughout the interaction
4. A progress indicator updates as cards are swiped, and an end-of-deck view displays the accepted products with a "Continue" CTA when all cards are done
5. On a touch device, horizontal card swipes do not trigger page scroll — drag and snap-back feel smooth at 60fps
   **Plans**: TBD

### Phase 3: Visual Polish and Launch

**Goal**: The card-stack variant looks like a PostHog trading card collectible, carries full product content, and is live in the experiment for real users
**Depends on**: Phase 2
**Requirements**: STACK-03, PILE-03, PILE-04, VIS-01, VIS-02, VIS-04
**Success Criteria** (what must be TRUE):

1. Each card displays the product color accent, hedgehog mascot, product name, user-centric description, capabilities list, and social proof
2. Accepted and rejected piles show product icon thumbnails in a fanned/horizontally-overlapping layout
3. Accept/reject feedback uses PostHog-branded icons (checkmark/X from `@posthog/icons`) — no hearts, fire, or dating-app visual language appears
4. The card design and layout work on a 360px-wide mobile screen without horizontal overflow or readability issues
5. The `card-stack` variant is reachable by real users via the live multi-variant flag — the old simplified flag guard is removed after traffic drains
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase                       | Plans Complete | Status      | Completed |
| --------------------------- | -------------- | ----------- | --------- |
| 1. Flag Foundation          | 0/TBD          | Not started | -         |
| 2. Core Card Interaction    | 0/TBD          | Not started | -         |
| 3. Visual Polish and Launch | 0/TBD          | Not started | -         |
