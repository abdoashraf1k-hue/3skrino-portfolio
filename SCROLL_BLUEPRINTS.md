# 3SKRINO — Scroll Blueprints

Reference document for the site's scroll behavior. NOT user-facing. Do not 
link from the site.

## Rules of thumb
- 1000px of scroll ≈ 1 second of watching
- Video scrub (5s video): 3000-5000px pinned
- Headline fade in + out: 1500-2000px
- Breather / transition: 500-1000px

## Vocabulary
- **Pin**: section sticks while scroll continues
- **Scrub**: animation progress tied to scroll position
- **Stagger**: elements animate in sequence with delay
- **Clip reveal**: element unveils from a direction
- **Split text**: each letter/word animates individually
- **Phase**: sub-step within a section's scroll range

---

## Hero
Total scroll: ~2000px (pinned stage on desktop)
Mood: cinematic
Asset strategy: 3D particles (React Three Fiber)

SECTION 1: Particle Name
├─ Pin: yes (1000px)
├─ Phase 1 (0-500px): Particles form "3SKRINO"
├─ Phase 2 (500-1000px): Particles scatter on scroll, "VIDEO / EDITOR" fades in
└─ Mobile: Static text, no particles

---

## Marquee
Total scroll: natural (in flow)
Mood: editorial rhythm break
Asset strategy: CSS animation, no scroll dependency

SECTION 1: Roles strip
├─ Pin: no
├─ Phase 1: Continuous horizontal scroll (CSS)
└─ Mobile: same, slightly slower

---

## Selected Work — Vertical
Total scroll: natural (masonry)
Mood: editorial
Asset strategy: 9:16 Cloudinary video thumbnails

SECTION 1: Masonry columns
├─ Pin: no
├─ Phase 1: Columns drift at different speeds (parallax: [0, -60, -30, -90] px)
└─ Mobile: single column, no parallax

---

## Selected Work — Horizontal
Total scroll: sticky stack
Mood: cinematic
Asset strategy: 16:9 video thumbnails

SECTION 1: Sticky stack
├─ Pin: yes (per card, sticky under nav)
├─ Phase 1: Each card pins as it enters, next card slides over
└─ Mobile: simple vertical list

---

## Categories — Fields
Total scroll: natural
Mood: grid reveal
Asset strategy: text-only cards

SECTION 1: Category grid
├─ Pin: no
├─ Phase 1: Cards stagger in (0.08s)
├─ Phase 2: Hover → accent border, index flips to italic accent
└─ Mobile: single column

---

## AI Showcase
Total scroll: natural
Mood: forward-looking
Asset strategy: 9:16 AI-generated thumbnails

SECTION 1: Split layout
├─ Pin: no
├─ Phase 1: Left text reveals, right thumbnails stagger in
└─ Mobile: stacked

---

## About
Total scroll: natural
Mood: editorial
Asset strategy: text + stats

SECTION 1: Two-column
├─ Pin: yes (left column, sticky at lg:top-32)
├─ Phase 1: Right paragraphs reveal as you scroll
├─ Phase 2: Stats row animates in
└─ Mobile: single column

---

## Contact
Total scroll: natural (90svh min)
Mood: closing statement
Asset strategy: text-only

SECTION 1: Let's Create
├─ Pin: no
├─ Phase 1: Headline "crystallizes" letter by letter (blur 8px → 0)
├─ Phase 2: Email link + socials stagger in
└─ Mobile: same, reduced letter stagger

---

## Page Transitions
Total duration: 350ms each way
Effect: 6-blade SVG iris closing, "LOADING" blinks in accent for 150ms, 
then opens on the new page
Mobile: simple fade
