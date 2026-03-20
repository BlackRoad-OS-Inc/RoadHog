import './CardStackProductSelection.scss'

import clsx from 'clsx'
import { useActions } from 'kea'
import { motion, useMotionValue, useTransform, useAnimate, AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { IconArrowRight, IconCheck, IconX } from '@posthog/icons'
import { LemonButton, Link } from '@posthog/lemon-ui'

import { Logomark } from 'lib/brand/Logomark'
import {
    BuilderHog1,
    DetectiveHog,
    ExperimentsHog,
    ExplorerHog,
    FeatureFlagHog,
    FilmCameraHog,
    GraphsHog,
    MailHog,
    MicrophoneHog,
    RobotHog,
} from 'lib/components/hedgehogs'
import { getFeatureFlagPayload } from 'lib/logic/featureFlagLogic'
import { inviteLogic } from 'scenes/settings/organization/inviteLogic'

import { ProductKey } from '~/queries/schema/schema-general'

import { availableOnboardingProducts, getProductIcon, toSentenceCase } from '../utils'
import { productSelectionLogic } from './productSelectionLogic'

type AvailableOnboardingProductKey = keyof typeof availableOnboardingProducts

const PRODUCT_HEDGEHOG: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
    [ProductKey.PRODUCT_ANALYTICS]: GraphsHog,
    [ProductKey.WEB_ANALYTICS]: ExplorerHog,
    [ProductKey.SESSION_REPLAY]: FilmCameraHog,
    [ProductKey.LLM_ANALYTICS]: RobotHog,
    [ProductKey.DATA_WAREHOUSE]: BuilderHog1,
    [ProductKey.FEATURE_FLAGS]: FeatureFlagHog,
    [ProductKey.EXPERIMENTS]: ExperimentsHog,
    [ProductKey.ERROR_TRACKING]: DetectiveHog,
    [ProductKey.SURVEYS]: MicrophoneHog,
    [ProductKey.WORKFLOWS]: MailHog,
}

function getSocialProof(productKey: string): string | undefined {
    const payload = getFeatureFlagPayload('onboarding-social-proof-info') as Record<string, string> | undefined
    return (
        payload?.[productKey] ??
        availableOnboardingProducts[productKey as keyof typeof availableOnboardingProducts]?.socialProof
    )
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 120
const SWIPE_VELOCITY_THRESHOLD = 500
const MAX_ROTATION = 18
const CARD_WIDTH = 340
const CARD_HEIGHT = 440

// ─── Types ──────────────────────────────────────────────────────────────────
interface SwipedCard {
    productKey: AvailableOnboardingProductKey
    pile: 'accepted' | 'rejected'
}

// ─── Pile Component ─────────────────────────────────────────────────────────
function CardPile({ cards, type }: { cards: SwipedCard[]; type: 'accepted' | 'rejected' }): JSX.Element {
    const pileCards = cards.filter((c) => c.pile === type)
    const [pulseKey, setPulseKey] = useState(0)
    const prevCountRef = useRef(pileCards.length)

    useEffect(() => {
        if (pileCards.length > prevCountRef.current) {
            setPulseKey((k) => k + 1)
        }
        prevCountRef.current = pileCards.length
    }, [pileCards.length])

    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 text-xs text-muted">
                {type === 'accepted' ? (
                    <IconCheck className="text-success w-3.5 h-3.5" />
                ) : (
                    <IconX className="text-muted-alt w-3.5 h-3.5" />
                )}
                <span>{pileCards.length}</span>
            </div>
            <div
                key={pulseKey}
                className={clsx(
                    'relative h-10 flex items-center',
                    pulseKey > 0 && 'CardStackProductSelection__pile-pulse'
                )}
                style={{ minWidth: Math.max(40, pileCards.length * 20 + 24) }}
            >
                {pileCards.length === 0 ? (
                    <div
                        className={clsx(
                            'w-10 h-10 rounded-lg border-2 border-dashed flex items-center justify-center',
                            type === 'accepted' ? 'border-success/30' : 'border-muted/30'
                        )}
                    >
                        {type === 'accepted' ? (
                            <IconCheck className="text-success/30 w-4 h-4" />
                        ) : (
                            <IconX className="text-muted/30 w-4 h-4" />
                        )}
                    </div>
                ) : (
                    pileCards.map((card, i) => {
                        const product = availableOnboardingProducts[card.productKey]
                        return (
                            <div
                                key={card.productKey}
                                className="absolute rounded-lg border bg-surface-primary shadow-sm flex items-center justify-center"
                                style={{
                                    width: 36,
                                    height: 40,
                                    left: i * 20,
                                    zIndex: i,
                                    borderColor: type === 'accepted' ? product.iconColor : undefined,
                                }}
                            >
                                {getProductIcon(product.icon, {
                                    iconColor: product.iconColor,
                                    className: 'text-base',
                                })}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}

// ─── Swipeable Card ─────────────────────────────────────────────────────────
function SwipeableCard({
    productKey,
    isTop,
    stackIndex,
    onSwipe,
}: {
    productKey: AvailableOnboardingProductKey
    isTop: boolean
    stackIndex: number
    onSwipe: (direction: 'left' | 'right') => void
}): JSX.Element {
    const product = availableOnboardingProducts[productKey]
    const HedgehogComponent = PRODUCT_HEDGEHOG[productKey]
    const socialProof = getSocialProof(productKey)
    const description = product.userCentricDescription || product.description

    const x = useMotionValue(0)
    const rotate = useTransform(x, [-CARD_WIDTH, 0, CARD_WIDTH], [-MAX_ROTATION, 0, MAX_ROTATION])
    const acceptOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1])
    const rejectOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0])

    const [scope, animate] = useAnimate()

    const handleDragEnd = useCallback(
        async (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
            const shouldSwipeRight = info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY_THRESHOLD
            const shouldSwipeLeft = info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY_THRESHOLD

            if (shouldSwipeRight) {
                await animate(scope.current, { x: window.innerWidth, opacity: 0 }, { duration: 0.3 })
                onSwipe('right')
            } else if (shouldSwipeLeft) {
                await animate(scope.current, { x: -window.innerWidth, opacity: 0 }, { duration: 0.3 })
                onSwipe('left')
            }
        },
        [animate, onSwipe, scope]
    )

    // Stack depth: cards behind the top card are slightly scaled down and offset
    const stackScale = isTop ? 1 : 1 - stackIndex * 0.04
    const stackY = isTop ? 0 : stackIndex * 6
    const stackOpacity = stackIndex <= 2 ? 1 - stackIndex * 0.15 : 0

    if (stackIndex > 2) {
        return <></>
    }

    return (
        <motion.div
            ref={scope}
            className="absolute"
            style={{
                x: isTop ? x : 0,
                rotate: isTop ? rotate : 0,
                scale: stackScale,
                y: stackY,
                opacity: stackOpacity,
                zIndex: 10 - stackIndex,
                width: CARD_WIDTH,
                willChange: isTop ? 'transform' : 'auto',
                touchAction: 'none',
            }}
            drag={isTop ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={isTop ? handleDragEnd : undefined}
            aria-label={`${toSentenceCase(product.name)}: ${description}`}
            role="article"
        >
            <div
                className="rounded-2xl border bg-surface-primary shadow-lg overflow-hidden select-none"
                style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                }}
            >
                {/* Color accent bar */}
                <div className="h-2" style={{ backgroundColor: product.iconColor }} />

                {/* Accept/Reject overlays */}
                {isTop && (
                    <>
                        <motion.div
                            className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10"
                            style={{
                                opacity: acceptOpacity,
                                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                            }}
                        >
                            <div className="border-4 border-success rounded-xl px-4 py-2 rotate-[-18deg]">
                                <IconCheck className="text-success w-12 h-12" />
                            </div>
                        </motion.div>
                        <motion.div
                            className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10"
                            style={{
                                opacity: rejectOpacity,
                                backgroundColor: 'rgba(220, 38, 38, 0.06)',
                            }}
                        >
                            <div className="border-4 border-danger rounded-xl px-4 py-2 rotate-[18deg]">
                                <IconX className="text-danger w-12 h-12" />
                            </div>
                        </motion.div>
                    </>
                )}

                {/* Card content */}
                <div className="flex flex-col h-[calc(100%-8px)] p-5">
                    {/* Header: icon + product name */}
                    <div className="flex items-center gap-2 mb-3">
                        {getProductIcon(product.icon, {
                            iconColor: product.iconColor,
                            className: 'text-xl',
                        })}
                        <span className="text-xs font-medium text-muted">{toSentenceCase(product.name)}</span>
                    </div>

                    {/* Hedgehog illustration */}
                    <div
                        className="relative w-full h-28 rounded-xl mb-4 flex items-end justify-center overflow-hidden"
                        style={{ backgroundColor: `${product.iconColor}15` }}
                    >
                        {HedgehogComponent && <HedgehogComponent className="relative z-10 w-24 h-24" />}
                    </div>

                    {/* User-centric description */}
                    <h2 className="text-lg font-bold mb-3 leading-snug">{description}</h2>

                    {/* Capabilities */}
                    {product.capabilities && (
                        <ul className="list-none p-0 m-0 flex flex-col gap-1.5 mb-3">
                            {product.capabilities.map((cap) => (
                                <li key={cap} className="text-sm text-muted flex items-center gap-2">
                                    <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: product.iconColor }}
                                    />
                                    {cap}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Social proof (pushed to bottom) */}
                    <div className="mt-auto">
                        {socialProof && <span className="text-xs text-muted">{socialProof}</span>}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ─── End of Deck ────────────────────────────────────────────────────────────
function EndOfDeck({
    acceptedCards,
    onContinue,
}: {
    acceptedCards: SwipedCard[]
    onContinue: () => void
}): JSX.Element {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center max-w-sm"
        >
            <h2 className="text-2xl font-bold">
                {acceptedCards.length > 0 ? "You're all set!" : 'No products selected'}
            </h2>
            {acceptedCards.length > 0 ? (
                <>
                    <p className="text-muted">
                        You picked {acceptedCards.length} product{acceptedCards.length !== 1 ? 's' : ''} to get started
                        with.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {acceptedCards.map((card) => {
                            const product = availableOnboardingProducts[card.productKey]
                            return (
                                <div
                                    key={card.productKey}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-surface-primary"
                                    style={{ borderColor: product.iconColor }}
                                >
                                    {getProductIcon(product.icon, {
                                        iconColor: product.iconColor,
                                        className: 'text-sm',
                                    })}
                                    <span className="text-sm font-medium">{toSentenceCase(product.name)}</span>
                                </div>
                            )
                        })}
                    </div>
                    <LemonButton
                        type="primary"
                        status="alt"
                        size="large"
                        onClick={onContinue}
                        sideIcon={<IconArrowRight />}
                        data-attr="onboarding-continue"
                    >
                        Get started
                    </LemonButton>
                </>
            ) : (
                <>
                    <p className="text-muted">
                        You didn't pick any products. You can always set them up later from Settings.
                    </p>
                    <LemonButton
                        type="primary"
                        status="alt"
                        size="large"
                        onClick={onContinue}
                        sideIcon={<IconArrowRight />}
                        data-attr="onboarding-continue"
                    >
                        Continue anyway
                    </LemonButton>
                </>
            )}
        </motion.div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function CardStackProductSelection(): JSX.Element {
    const { setSelectedProducts, setFirstProductOnboarding, setRecommendationSource, handleStartOnboarding } =
        useActions(productSelectionLogic)
    const { showInviteModal } = useActions(inviteLogic)

    const allProducts = useMemo(() => Object.keys(availableOnboardingProducts) as AvailableOnboardingProductKey[], [])

    const [currentIndex, setCurrentIndex] = useState(0)
    const [swipedCards, setSwipedCards] = useState<SwipedCard[]>([])
    const [isComplete, setIsComplete] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 50)
        return () => clearTimeout(timer)
    }, [])

    const remainingCards = allProducts.slice(currentIndex)
    const acceptedCards = swipedCards.filter((c) => c.pile === 'accepted')

    const handleSwipe = useCallback(
        (direction: 'left' | 'right') => {
            const productKey = allProducts[currentIndex]

            const newCard: SwipedCard = {
                productKey,
                pile: direction === 'right' ? 'accepted' : 'rejected',
            }

            setSwipedCards((prev) => [...prev, newCard])

            // Track the swipe
            window.posthog?.capture('onboarding_card_swiped', {
                product: productKey,
                direction,
                card_index: currentIndex,
                total_cards: allProducts.length,
            })

            if (currentIndex + 1 >= allProducts.length) {
                setIsComplete(true)
            } else {
                setCurrentIndex((prev) => prev + 1)
            }
        },
        [allProducts, currentIndex]
    )

    const handleContinue = useCallback(() => {
        const accepted = swipedCards.filter((c) => c.pile === 'accepted').map((c) => c.productKey as ProductKey)

        if (accepted.length > 0) {
            setSelectedProducts(accepted)
            setFirstProductOnboarding(accepted[0])
        } else {
            // If no products accepted, default to Product analytics
            setSelectedProducts([ProductKey.PRODUCT_ANALYTICS])
            setFirstProductOnboarding(ProductKey.PRODUCT_ANALYTICS)
        }

        setRecommendationSource('card-stack')
        handleStartOnboarding()
    }, [swipedCards, setSelectedProducts, setFirstProductOnboarding, setRecommendationSource, handleStartOnboarding])

    // Keyboard support
    useEffect(() => {
        if (isComplete) {
            return
        }

        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault()
                handleSwipe('right')
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                handleSwipe('left')
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [handleSwipe, isComplete])

    // Current spotlight product for background color wash
    const spotlightKey = remainingCards[0]
    const spotlightProduct = spotlightKey ? availableOnboardingProducts[spotlightKey] : null

    return (
        <div className="CardStackProductSelection flex flex-col flex-1 w-full min-h-full p-4 items-center justify-center bg-primary overflow-hidden">
            {/* Subtle product color wash */}
            {spotlightProduct && (
                <div
                    className="absolute inset-0 transition-colors duration-700 pointer-events-none"
                    style={{
                        backgroundColor: spotlightProduct.iconColor,
                        opacity: 0.04,
                    }}
                />
            )}

            <div className="relative flex flex-col items-center justify-center flex-grow w-full max-w-2xl">
                {/* Header */}
                <div className="flex justify-center mb-4">
                    <Logomark />
                </div>
                <h1 className="text-4xl font-bold text-center mb-1">Build your stack</h1>
                <p className="text-center text-muted mb-6">Swipe right to add a product, left to skip it.</p>

                {/* Card stack area */}
                <div
                    className="relative flex items-center justify-center mb-6"
                    style={{ width: CARD_WIDTH, height: CARD_HEIGHT + 20 }}
                >
                    <AnimatePresence>
                        {!isComplete &&
                            remainingCards
                                .slice(0, 3)
                                .map((productKey, i) => (
                                    <SwipeableCard
                                        key={productKey}
                                        productKey={productKey}
                                        isTop={i === 0}
                                        stackIndex={i}
                                        onSwipe={handleSwipe}
                                    />
                                ))}
                    </AnimatePresence>

                    {isComplete && <EndOfDeck acceptedCards={acceptedCards} onContinue={handleContinue} />}
                </div>

                {/* Accept / Reject buttons + progress */}
                {!isComplete && (
                    <div
                        className={clsx(
                            'flex flex-col items-center gap-4 transition-opacity duration-300',
                            mounted ? 'opacity-100' : 'opacity-0'
                        )}
                    >
                        {/* Buttons */}
                        <div className="flex items-center gap-6">
                            <button
                                onClick={() => handleSwipe('left')}
                                className="w-14 h-14 rounded-full border-2 border-danger/30 hover:border-danger hover:bg-danger/10 flex items-center justify-center transition-all cursor-pointer"
                                aria-label="Skip this product"
                            >
                                <IconX className="text-danger w-6 h-6" />
                            </button>

                            <span className="text-sm text-muted font-medium tabular-nums">
                                {currentIndex + 1} / {allProducts.length}
                            </span>

                            <button
                                onClick={() => handleSwipe('right')}
                                className="w-14 h-14 rounded-full border-2 border-success/30 hover:border-success hover:bg-success/10 flex items-center justify-center transition-all cursor-pointer"
                                aria-label="Add this product"
                            >
                                <IconCheck className="text-success w-6 h-6" />
                            </button>
                        </div>

                        {/* Piles */}
                        <div className="flex items-start gap-8">
                            <CardPile cards={swipedCards} type="rejected" />
                            <CardPile cards={swipedCards} type="accepted" />
                        </div>

                        {/* Keyboard hint */}
                        <div className="flex items-center gap-4 text-muted text-xs">
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 rounded border border-primary bg-surface-primary text-[10px] font-mono">
                                    &larr;
                                </kbd>
                                skip
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 rounded border border-primary bg-surface-primary text-[10px] font-mono">
                                    &rarr;
                                </kbd>
                                add
                            </span>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 flex flex-col items-center gap-2">
                    <p className="text-muted text-xs">You can always add more from Settings.</p>
                    <p className="text-muted text-sm">
                        Need help from a team member? <Link onClick={() => showInviteModal()}>Invite them</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
