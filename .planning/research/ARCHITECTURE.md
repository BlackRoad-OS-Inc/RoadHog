# Architecture Patterns

**Domain:** Onboarding product selection — card-stack variant
**Researched:** 2026-03-20

---

## Existing Onboarding Flow Structure

The onboarding flow lives entirely in `frontend/src/scenes/onboarding/`. The
top-level entry is the `Onboarding` scene component (`Onboarding.tsx`), which
is the exported `scene` for `Scene.Onboarding`. Its logic counterpart,
`onboardingLogic` (kea), owns all step navigation, product state, and URL
routing.

### Top-level flow decision tree

```text
/onboarding (no productKey)
    │
    ├── ONBOARDING_AI_PRODUCT_RECOMMENDATIONS === 'chat'  →  <OnboardingMax /> (AI chat)
    └── else                                              →  <ProductSelection />
                                                                │
                                                                ├── ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION === 'test'
                                                                │       └── <SimplifiedProductSelection />
                                                                │
                                                                └── else (control)
                                                                        ├── step === 'choose_path'   → <ChoosePathStep />
                                                                        └── step === 'product_selection' → <ProductSelectionStep />

/onboarding/:productKey
    └── onboardingViews[productKey] → <*Onboarding /> wrapped in <OnboardingWrapper />
```

The `ProductSelection` component is the **only** place where the variant switch
is implemented. It reads the feature flag and delegates to the appropriate
component. The downstream `onboardingLogic` and `productSelectionLogic` are
shared by all variants — no logic needs to be duplicated.

---

## Component Boundaries

| Component                     | File                                                           | Responsibility                                                                  | Communicates With                                 |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `Onboarding`                  | `Onboarding.tsx`                                               | Scene root: reads `productKey`, routes to ProductSelection or per-product views | `onboardingLogic`, `featureFlagLogic`             |
| `ProductSelection`            | `productSelection/ProductSelection.tsx`                        | Feature flag switch — renders the correct variant                               | `featureFlagLogic`, `productSelectionLogic`       |
| `ChoosePathStep`              | inside `ProductSelection.tsx`                                  | Control step 1: use-case grid / AI description input                            | `productSelectionLogic`                           |
| `ProductSelectionStep`        | inside `ProductSelection.tsx`                                  | Control step 2: multi-select product grid                                       | `productSelectionLogic`                           |
| `SimplifiedProductSelection`  | `productSelection/SimplifiedProductSelection.tsx`              | Simplified variant: horizontal carousel, one product at a time                  | `productSelectionLogic`, `inviteLogic`            |
| `CardStackProductSelection`   | **to create** `productSelection/CardStackProductSelection.tsx` | Card-stack variant: swipeable stack, accept/reject decks                        | `productSelectionLogic`, `inviteLogic`            |
| `onboardingLogic`             | `onboardingLogic.tsx`                                          | Step navigation, URL sync, product state, onboarding completion                 | `billingLogic`, `teamLogic`, `featureFlagLogic`   |
| `productSelectionLogic`       | `productSelection/productSelectionLogic.ts`                    | Product selection state, recommendation engine, onboarding start                | `teamLogic`, `onboardingLogic`, `eventUsageLogic` |
| `availableOnboardingProducts` | `utils.tsx`                                                    | Source-of-truth product registry (name, icon, color, capabilities, socialProof) | consumed by all selection variants                |

### Boundaries that must not be crossed

- `CardStackProductSelection` must **not** define its own product data — it reads
  `availableOnboardingProducts` from `utils.tsx` exactly as the other variants
  do.
- `CardStackProductSelection` must **not** call `onboardingLogic` directly for
  product selection. It delegates to `productSelectionLogic`, specifically to
  `selectSingleProduct(productKey)` (same action used by `SimplifiedProductSelection`).
- `onboardingLogic` has no knowledge of which variant is active. Variant
  selection is entirely a `ProductSelection`-level concern.

---

## Current Feature Flag — How the Variant Switch Works

```typescript
// ProductSelection.tsx (simplified excerpt)
export function ProductSelection(): JSX.Element {
    const { featureFlags } = useValues(featureFlagLogic)
    const isSimplifiedOnboarding = featureFlags[FEATURE_FLAGS.ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION]

    if (isSimplifiedOnboarding === 'test') {
        return <SimplifiedProductSelection />
    }

    return (/* control: ChoosePathStep / ProductSelectionStep */)
}
```

The current flag `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` is a two-variant
flag (`control` / `test`). The constant lives at line 376 of
`frontend/src/lib/constants.tsx`:

```typescript
ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION: 'onboarding-simplified-product-selection',
// multivariate=control,test
```

The new flag `onboarding-product-selection-variant` must be **multi-variant**
(`control` / `simplified` / `card-stack`). The existing flag and its `'test'`
variant must be **retired** — both variants are migrated into the new flag.
This means:

1. Add `ONBOARDING_PRODUCT_SELECTION_VARIANT` to `FEATURE_FLAGS` in
   `frontend/src/lib/constants.tsx`.
2. Remove the `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` check from
   `ProductSelection.tsx`.
3. Replace with a three-way switch on the new flag value.

The switch in `ProductSelection` becomes:

```typescript
const variant = featureFlags[FEATURE_FLAGS.ONBOARDING_PRODUCT_SELECTION_VARIANT]

if (variant === 'simplified') return <SimplifiedProductSelection />
if (variant === 'card-stack') return <CardStackProductSelection />
return (/* control */)
```

---

## Where the New Component Lives

```text
frontend/src/scenes/onboarding/productSelection/
├── ProductSelection.tsx            ← add new variant branch here
├── productSelectionLogic.ts        ← shared, no changes needed for basic integration
├── SimplifiedProductSelection.tsx  ← preserved unchanged
├── SimplifiedProductSelection.scss ← preserved unchanged
├── CardStackProductSelection.tsx   ← NEW: card-stack component
└── CardStackProductSelection.scss  ← NEW: CSS animations for card transitions
```

No new logic file is needed for the first iteration. The card-stack component
uses `productSelectionLogic` actions `selectSingleProduct` and
`setFirstProductOnboarding` — the same path as `SimplifiedProductSelection`.

If the card-stack needs accept/reject deck state beyond what
`productSelectionLogic` tracks (which is likely — the deck of accepted/rejected
cards is local UI state, not selection state), that state lives in
`CardStackProductSelection` as `useState` or a lightweight kea logic. Prefer
`useState` for pure UI state (card positions, deck arrays, animation flags)
and reserve kea for anything that needs to survive navigation or be observed
by other logics.

---

## Data Flow

```text
availableOnboardingProducts (utils.tsx)
    │
    │  Object.keys() → ProductKey[]
    ▼
CardStackProductSelection
    │
    │  local state: stack[], acceptedDeck[], rejectedDeck[], activeCard
    │  interaction: swipe/drag → pointer events → spring physics
    │
    │  on "accept" card
    │  ├── push to acceptedDeck
    │  └── if stack empty → selectSingleProduct(acceptedDeck[0])
    │
    │  on "reject" card
    │  └── push to rejectedDeck
    │
    ▼
productSelectionLogic.selectSingleProduct(productKey)
    │
    │  setSelectedProducts([productKey])
    │  setFirstProductOnboarding(productKey)
    │  setRecommendationSource('simplified')  ← reuse 'simplified' or add 'card-stack'
    │  handleStartOnboarding()
    │
    ▼
onboardingLogic (via router.actions.push)
    │
    │  addProductIntent for each selected product
    │  push /onboarding/:productKey?step=install
    │
    ▼
Per-product onboarding flow (install, configure, etc.)
```

### Key data contract

`availableOnboardingProducts` is the single source of truth for card content:

| Field                    | Used for                                         |
| ------------------------ | ------------------------------------------------ |
| `name`                   | Card title                                       |
| `userCentricDescription` | Card headline (prefer over `description`)        |
| `capabilities`           | Bullet points on card face                       |
| `iconColor`              | Card accent color, border tint                   |
| `icon`                   | Icon rendered via `getProductIcon()`             |
| `socialProof`            | Footer text on card (e.g. "Used by 185K+ teams") |

The hedgehog-per-product mapping used in `SimplifiedProductSelection`
(`PRODUCT_HEDGEHOG`) should also be used by the card-stack variant for visual
continuity.

---

## Recommended Architecture for CardStackProductSelection

### Internal state (useState)

```typescript
type CardState = 'stack' | 'accepted' | 'rejected'

// Ordered list of product keys currently in the visible stack (top-first)
const [stackOrder, setStackOrder] = useState<ProductKey[]>([...allProducts])
const [acceptedDeck, setAcceptedDeck] = useState<ProductKey[]>([])
const [rejectedDeck, setRejectedDeck] = useState<ProductKey[]>([])
const [activeCardOffset, setActiveCardOffset] = useState({ x: 0, rotation: 0 })
const [isDragging, setIsDragging] = useState(false)
```

### Card rendering

- Render top N cards of `stackOrder` (N = 3–4 for visible depth).
- Each card has z-index and a translate+scale offset to create stack depth.
- The frontmost card receives pointer event handlers.
- Swipe direction is determined by accumulated `x` offset:
  - `x > threshold` → accept (fly to right)
  - `x < -threshold` → reject (fly to left)
- Cards fly into their respective deck (bottom of screen) via CSS keyframe
  animation or `requestAnimationFrame` spring.

### When stack is empty

If `acceptedDeck.length > 0`, show a confirmation step summarising accepted
products and call `selectSingleProduct(acceptedDeck[0])` (or extend the logic
to support multi-select from accepted deck — depends on requirements).

If `acceptedDeck.length === 0`, show a "you rejected everything" recovery state
with a nudge to pick one.

### Animation strategy

Use the same `requestAnimationFrame` + spring physics pattern as
`SimplifiedProductSelection` for consistency. Do not introduce a new animation
library. The SCSS file handles buzz/shake keyframes; card fly-out can use
inline `transform` driven by `requestAnimationFrame`.

---

## Pitfall: Recommendation Source Tracking

`productSelectionLogic` records a `recommendationSource` that flows into
analytics. The simplified variant uses `'simplified'`. For the card-stack
variant, either:

- Reuse `'simplified'` (simpler, but loses experiment attribution)
- Add `'card-stack'` to the `RecommendationSource` union type

Adding `'card-stack'` is preferred so experiment results are attributable.
The type is defined in `productSelectionLogic.ts` line 26:

```typescript
export type RecommendationSource = 'use_case' | 'ai' | 'browsing_history' | 'manual' | 'simplified'
```

---

## Build Order (Implications for Roadmap)

Phase sequencing must follow this dependency graph:

```text
1. Feature flag setup
       ↓
2. CardStackProductSelection component (self-contained, reads existing data)
       ↓
3. ProductSelection.tsx integration (add variant branch, retire old flag check)
       ↓
4. productSelectionLogic minor extension (add 'card-stack' recommendation source)
       ↓
5. Analytics / tracking verification
```

**Phase 1 — Flag first.**
Add `ONBOARDING_PRODUCT_SELECTION_VARIANT` constant to `constants.tsx`. This
unblocks local testing (devs can set the flag value to `'card-stack'` locally).
The old `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` constant stays in place until
the new flag is shipping — do not remove it until the migration is complete.

**Phase 2 — Component second.**
Build `CardStackProductSelection` in isolation. It can be developed and
Storybook-tested without touching `ProductSelection.tsx` at all.

**Phase 3 — Integration third.**
Add the `'card-stack'` branch to `ProductSelection`. This is a 3-line change.
Remove the old `ONBOARDING_SIMPLIFIED_PRODUCT_SELECTION` guard only after the
`'simplified'` variant is re-mapped to the new flag.

**Phase 4 — Logic extension fourth.**
Add `'card-stack'` to `RecommendationSource`. This is a one-line type change
plus updating `selectSingleProduct` (or adding `selectCardStackProduct`).

**Phase 5 — Verification.**
Confirm that accepted products flow through `addProductIntent` correctly.
Confirm analytics capture `onboarding_products_confirmed` with the correct
`recommendation_source`.

---

## Scalability Considerations

| Concern                 | Current state                                                       | Card-stack impact                                     |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Product count           | 10 products in `availableOnboardingProducts`                        | Stack of 10 cards is manageable; no pagination needed |
| Animation performance   | SimplifiedProductSelection uses rAF + spring physics                | Same pattern scales fine at 10 cards                  |
| Feature flag evaluation | Client-side via `featureFlagLogic`                                  | No new infrastructure needed                          |
| Storybook coverage      | `ProductSelection.stories.tsx` has Base + WithAIFeatureFlag stories | Add `CardStack` story with flag set to `'card-stack'` |

---

## Sources

- `frontend/src/scenes/onboarding/productSelection/ProductSelection.tsx` — variant switch implementation
- `frontend/src/scenes/onboarding/productSelection/SimplifiedProductSelection.tsx` — carousel physics pattern to follow
- `frontend/src/scenes/onboarding/productSelection/productSelectionLogic.ts` — shared selection state and `selectSingleProduct` action
- `frontend/src/scenes/onboarding/onboardingLogic.tsx` — step navigation and onboarding completion
- `frontend/src/scenes/onboarding/utils.tsx` — `availableOnboardingProducts` registry
- `frontend/src/lib/constants.tsx` lines 372–378 — existing onboarding feature flag names and patterns
