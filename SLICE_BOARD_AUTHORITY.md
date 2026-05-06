# Slice Board App Authority Statement

This repository is governed by this app authority statement for all Slice Board UI, asset, and implementation work.

## Product identity

The app is named Slice Board.

Slice Board is a calm, premium, mobile-first finance dashboard with a pizza-coded allocation system. It should feel like a serious money tool with warm personality, not a novelty pizza toy.

The visual target is the approved Slice Board mockup direction:

- dark premium finance dashboard
- warm amber/orange accents
- rounded cards
- readable mobile layout
- real raster pizza graphics
- proportional allocation logic

Do not reinterpret the product as a generic budgeting app, a cartoon pizza app, or a vector icon experiment.

## Source of truth hierarchy

For this repo, authority is:

1. This file
2. User-provided approved mockups and approved image assets
3. Existing working app behavior in `src/App.tsx` and the current running app entrypoint
4. Repo files as actually inspected
5. Assistant assumptions last, and only when explicitly labeled

Never assume a previous assistant landed the correct result merely because code changed.

Before modifying visuals or behavior, inspect the actual current repo files.

## Approved assets

The approved pizza logo must be used as a real PNG/raster image asset.

Expected logo path:

- `src/img/slice-board-logo.png`

Expected React usage:

```tsx
import logoPng from "./img/slice-board-logo.png";

<img src={logoPng} alt="Slice Board pizza logo" />
```

The approved logo must not be:

- converted to SVG
- redrawn in canvas
- approximated with CSS
- replaced by emoji
- simplified into a generic donut chart
- recreated from memory
- embedded as a base64 runtime hack

If `src/img/slice-board-logo.png` is missing, stop and report that the approved logo asset is missing. Do not substitute another logo.

PNG means PNG. Raster means raster.

## Pizza chart authority

The pizza chart must support both:

1. real pizza/raster visual quality
2. mathematically proportional slice sizes

The intended architecture is:

```text
math-driven wedge windows
+
aligned PNG pizza textures
=
proportional raster pizza chart
```

Geometry may be used for clipping, masking, and proportional wedge math.

Geometry must not be used to visibly redraw fake pizza art.

Visible pizza art should come from PNG/raster assets.

SVG/masks may be acceptable only as invisible geometry for clipping. They are not acceptable as the visible pizza art.

Canvas may be acceptable only if it composites real PNG assets. It must not draw fake pizza art.

## Pizza meaning system

Slice Board uses semantic pizza states:

- Unassigned = sauce only, no cheese
- Remaining = plain cheese
- Named assigned buckets = distinct toppings

Cheese is not a normal topping when it represents the default funded base.

Toppings should stay inside their assigned slice/window. Do not scatter toppings randomly across the chart.

## Forbidden visual patterns

Do not implement:

- floating red dots
- fake pepperoni clutter
- toppings outside the circle
- eyeball-looking chart textures
- generic SVG donut charts pretending to be pizza
- canvas-drawn pizza approximations
- random decorative toppings unrelated to the data
- angled device mockups as implementation references
- layouts that overflow mobile width
- runtime DOM hacks that swap fake visuals after render

## Existing behavior to preserve

Preserve existing app functionality unless a real bug is found.

Do not remove or silently break:

- current pie
- next pie
- hide/show next pie
- copy current to next
- clear next pie
- JSON export/import
- starter sections
- amount tool
- Change / Add / Subtract modes
- local storage key `slice-board-v1`
- legacy load key `joey-fidelity-pie-planner-v1`

Visual rebuilds must not become logic resets.

## Mobile-first requirement

The app must fit mobile width cleanly.

Required:

- no horizontal overflow
- no clipped cards
- readable bottom/navigation controls
- chart scales to container
- header and stat cards fit iPhone width
- layout remains usable without desktop assumptions

## Editing discipline

Use surgical patches whenever possible.

Before large changes:

1. inspect the current files
2. explain what is wrong
3. propose the patch direction
4. preserve working behavior
5. verify with a build or deployment status

Do not replace working application logic with a visual prototype. If visual work requires a temporary placeholder, isolate it and label it clearly.

Do not claim completion unless the running app actually reflects the approved visual and functional constraints.

## Definition of done

A change is done only when:

- the approved PNG logo is visibly used directly
- the app still says Slice Board
- the app fits mobile width
- the chart does not contain floating red dots or fake topping clutter
- existing app functions still work
- `npm run build` passes or deployment/build status is verified
- any remaining placeholder behavior is explicitly labeled as temporary

## One-line operating rule

Build the adult finance dashboard blessed by pizza, not a fake SVG pizza demo.
