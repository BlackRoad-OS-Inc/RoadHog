# Technology Stack

**Project:** Onboarding Card Stack Variant
**Researched:** 2026-03-20

## Recommended Stack

### Animation Engine

| Technology                  | Version                      | Purpose                                                            | Why                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motion` (Motion for React) | ^12.26.1 (already installed) | Card drag, spring animations, exit transitions, imperative fly-off | Already in PostHog's `package.json`. No new dependency. Provides `drag`, `onDragEnd`, `useMotionValue`, `useTransform`, `useSpring`, `useAnimate`, and `AnimatePresence` — every primitive needed for this feature. |

**Confidence: HIGH** — Confirmed via `frontend/package.json`. Motion v12 is the rebranded Framer Motion, fully released and production-grade. PostHog already uses it in `surveys/wizard` with `motion/react` imports.

### Gesture Handling

| Technology                  | Version                 | Purpose                                                    | Why                                                                                                                                                                                                                         |
| --------------------------- | ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion built-in `drag` prop | (bundled with `motion`) | Swipe threshold detection, velocity reading, drag momentum | Motion's `drag` prop on a `motion.div` provides `onDragEnd(event, info)` where `info.offset.x` and `info.velocity.x` supply everything needed to determine swipe direction and force. No additional gesture library needed. |

**Confidence: HIGH** — Motion's official drag docs confirm `info.offset` and `info.velocity` are available on `onDragEnd`. The pattern of checking `Math.abs(info.offset.x) > threshold || Math.abs(info.velocity.x) > velocityThreshold` to trigger a dismiss is the canonical Motion card-swipe pattern, with an official tutorial at `motion.dev/tutorials/react-swipe-actions`.

Do NOT add `@use-gesture/react`. Last published 2 years ago (v10.3.1, 2022). The `@use-gesture` package solves problems Motion already solves natively for this use case, and it adds a dead dependency.

### CSS / Layout

| Technology   | Version                   | Purpose                                               | Why                                                                                                                                                                    |
| ------------ | ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind CSS | 4.0.7 (already installed) | Card visual stack offsets, rotation, z-index layering | PostHog is on Tailwind v4. Stack depth is trivially expressed as `translate-y-2 rotate-1` etc. with inline `style` overrides for per-card offsets computed from index. |

**Confidence: HIGH** — PostHog's existing frontend uses Tailwind 4 exclusively. The `tailwind-merge` and `clsx` utilities are already present for conditional class composition.

### Supporting Hooks

| Hook              | Package        | Purpose                                                         | When to Use                                                                      |
| ----------------- | -------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `useMotionValue`  | `motion/react` | Track drag x-position as a reactive value                       | Wire to card x-position for real-time transform derivation                       |
| `useTransform`    | `motion/react` | Derive card rotation and opacity from drag offset               | Map `x: [-200, 0, 200]` to `rotate: [-20, 0, 20]` for tilt during drag           |
| `useSpring`       | `motion/react` | Spring-physics return-to-center on cancel                       | Wrap `useMotionValue` result in `useSpring` for bouncy snap-back                 |
| `useAnimate`      | `motion/react` | Imperative fly-to-deck animation when card is accepted/rejected | Required for "card flies to bottom accepted/rejected pile" transition post-swipe |
| `AnimatePresence` | `motion/react` | Mount/unmount animations for the card stack                     | Handles removing swiped cards from the DOM with exit animations                  |

**Confidence: HIGH** — All hooks are core Motion for React v12 APIs, confirmed in official docs.

## Alternatives Considered

| Category          | Recommended                         | Alternative                     | Why Not                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animation engine  | `motion` v12                        | `react-spring` v10              | Not installed; `motion` is already present and covers all required primitives equally well. Adding `react-spring` would be a ~40KB extra bundle with no benefit.                                                                        |
| Animation engine  | `motion` v12                        | GSAP                            | Not installed; overkill for a single UI component; licensing complexity for commercial products.                                                                                                                                        |
| Gesture handling  | Motion built-in `drag`              | `@use-gesture/react`            | Last released 2 years ago; unmaintained cadence; Motion's built-in drag API covers swipe threshold + velocity natively.                                                                                                                 |
| Gesture handling  | Motion built-in `drag`              | `react-tinder-card` npm package | Thin wrapper, adds dependency overhead, limited TypeScript types, low maintenance signal; building directly with Motion gives full control over the "trading card, not dating app" aesthetic.                                           |
| Card stack layout | CSS inline style offsets + Tailwind | Third-party card stack library  | No React web library specifically for card stacks has meaningful adoption or active maintenance. All community solutions wrap Motion or react-spring anyway. Building from primitives is the right call for a design-bespoke component. |

## Drag + Swipe Architecture (Pattern)

The canonical approach with Motion for the requirements in `PROJECT.md`:

**1. Per-card MotionValue tracking**

```tsx
const x = useMotionValue(0)
const rotate = useTransform(x, [-200, 0, 200], [-20, 0, 20])
const opacity = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5])
```

**2. Drag with threshold check on release**

```tsx
<motion.div
  drag="x"
  style={{ x, rotate }}
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={1}
  onDragEnd={(_, info) => {
    const swipePower = Math.abs(info.offset.x) * info.velocity.x
    if (swipePower > SWIPE_CONFIDENCE_THRESHOLD) {
      handleSwipe(info.offset.x > 0 ? 'right' : 'left')
    } else {
      // spring back to center
      animate(x, 0, { type: 'spring' })
    }
  }}
/>
```

**3. Exit animation — fly to deck**

Use `useAnimate` to imperatively animate the card to the bottom deck position (computed from layout) after swipe confirmation, then remove from stack.

**4. Visual stack depth**

Cards behind the top card get inline `style={{ y: index * 8, scale: 1 - index * 0.04, zIndex: cards.length - index }}` — no library needed.

**Confidence: MEDIUM** — Pattern is widely used and documented in official Motion tutorials, but exact numbers (`SWIPE_CONFIDENCE_THRESHOLD`, per-card stack offsets) will need tuning during implementation.

## Installation

No new packages required. Everything is available through the already-installed `motion@^12.26.1`.

```tsx
// All imports come from the already-installed 'motion' package
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useAnimate, animate } from 'motion/react'
```

This matches the import pattern already used in PostHog's codebase (`motion/react` in surveys wizard).

## What NOT to Use

- **`react-tinder-card`** — Adds a dependency to wrap a pattern Motion already handles. No TypeScript-first design. No active maintenance.
- **`@use-gesture/react`** — Last published 2022. Motion's built-in drag subsystem replaces it for this use case.
- **`react-spring`** — Not installed. Would add ~40KB. Motion's `useSpring` and `dragTransition` physics cover the same behavior.
- **`GSAP`** — Not installed. Commercial licensing ambiguity. Significant bundle cost for one component.
- **CSS-only keyframes** — Swipe detection requires JavaScript (threshold + velocity). Pure CSS is not viable.

## Sources

- Motion for React drag guide: https://motion.dev/docs/react-drag (HIGH confidence)
- Motion for React gestures: https://motion.dev/docs/react-gestures (HIGH confidence)
- Motion swipe actions tutorial: https://motion.dev/tutorials/react-swipe-actions (HIGH confidence)
- Motion card stack example: https://motion.dev/examples/react-card-stack (HIGH confidence)
- Motion useAnimate docs: https://motion.dev/docs/react-use-animate (HIGH confidence)
- `@use-gesture/react` npm status: https://www.npmjs.com/package/@use-gesture/react (last published 2 years ago — LOW maintenance signal)
- PostHog `frontend/package.json`: confirmed `motion@^12.26.1` installed, no gesture or spring libraries present
- PostHog `frontend/src/scenes/surveys/wizard/steps/QuestionsStep.tsx`: confirmed `motion/react` import pattern in use
