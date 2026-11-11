# Aluminium

Finnomena dashboard design work and the tools that support it, starting with Mixture: a playground for how a Portfolio's asset allocation is drawn as a grid of colour.

## Language

**Plan**:
One investment plan the customer holds, with a value in baht. Its Plan type gives it its name, Plan colour and Brick.
_Avoid_: Fund, holding
_Avoid in code_: product

**Plan type**:
One kind of Plan a customer can hold, such as GMI or หุ้นไทย, with a name, a Plan colour and a Brick. Random draws pick only the Plan types that are in draws.
_Avoid_: Brick (the Plan type's drawing, not the Plan type), offering

**Portfolio**:
A named group of Plans, such as Investments, Retirement or Cash.
_Avoid_: group, bucket
_Avoid in code_: Port

**Brick**:
A Plan type's icon: a single-colour Pattern-Builder Pattern on the Brick grid, so it is one piece joined by edges or corners and has a Brick family and a Slope.
_Avoid_: Block (one rectangle inside a Pattern, in the Pattern Builder), pattern block, icon, pixel art

**Strategy**:
A Plan type's six values in the Pattern Guidelines: Content Type, Investment Style, Initial Cost, Monthly Cost, Risk and Expected Return. It sets the Plan type's Brick: Investment Style the Brick family and how the Blocks join, Risk the Slope, Initial Cost the shape of the largest Block.
_Avoid_: positioning, profile

**Investment Style**:
How money goes into a Plan type: One-time, Dollar Cost Average or Market Timing. One-time draws a rising or hanging Brick joined by edges, Dollar Cost Average a rising or hanging Brick joined at corners, Market Timing a mountain Brick.
_Avoid_: Connected (the Pattern Guidelines' word for joined by edges), Disconnected (its word for joined at corners)

**Initial Cost**:
The least a customer puts into a Plan type to start, on seven steps: 1, 5,000, 20,000, 50,000, 500,000, 2,000,000 and 10,000,000 baht. Up to 50,000 the largest Block is narrow and grows taller with each step; from 500,000 it is wide.
_Avoid_: minimum investment

**Risk**:
How much a Plan type's value can swing: low, medium or high, drawn as a Flat, Half or 75% Slope. A range takes its middle, rounded up, and a Market Timing Plan type stops at Half.
_Avoid_: risk level

**Collection**:
One of the eight sets a Plan type's Brick is filed under on the Bricks page in Figma, such as Guru Port or Cash. A Plan type is in exactly one.
_Avoid_: playlist (the plan picker's own sets, where a plan can sit in several), category

**Plan Cover**:
A Plan type's artwork on the plan picker (the Plan Select Figma file), read off its rectangles onto 16×16 cells. Of the Bricks a Plan type's Strategy allows, the one that overlaps its Plan Cover most is its Brick, with the Brick scaled up to 16×16.
_Avoid_: thumbnail, artwork (on its own)

**Brick grid**:
The cells every Brick is drawn on: 4×4 by default, or 8×8, 16×16 or a portrait grid (4×6, 8×12) to see how Bricks read at other sizes. One setting for all Bricks. A Plan type's Brick goes to the Bricks page in Figma on four: 2×2, 4×4, 8×8 and 16×16.
_Avoid_: Brick size
_Avoid in code_: canvas

**Slope**:
How steeply a Brick rises from bottom-left to top-right: Flat, Half or 75%. A mountain Brick has no 75%.
_Avoid_: angle, steepness

**Brick family**:
The shape a Brick's Pattern follows: rising, hanging or mountain. A Brick whose family is left unchosen (Auto) takes whichever one its seed picks.
_Avoid_: family (on its own), auto family

**Mix**:
A Portfolio's icon: a 4×4 grid filled with Plan colours, drawn as the Mix case nearest the Portfolio's values, the same way every time. It counts its Plan colours (up to 11; any smaller ones are left out), then picks the Mix case with as many colours whose pieces sit nearest their shares, keeping equal values as equal pieces where such a case exists. So a Mix is always one of the 32 kept Mix cases.
_Avoid_: Heatmap, treemap, allocation chart

**Side**:
One of the two halves, left and right, that a Mix case fills. When colours tie on value, the one listed first counts as the larger.
_Avoid_: half (Half is a Slope)
_Avoid in code_: column

**Mix case**:
One way a 4×4 Mix can be cut up when every Plan colour is a single 1×1, 2×1, 2×2, 2×3 or 2×4 piece (a Side's width by its rows), placed largest first in the left Side while it fits, then the right, each Side filled row by row from its top-left. Only the largest colour can be bigger, from 75% up: it takes the whole left Side and a 2×2 to 2×4 piece at the top of the right. Of the 52 with up to 11 Plan colours, 32 are kept, numbered 1 to 32, and only those are drawn or offered.
_Avoid_: scenario, permutation, Snake, Scatter

**Dominant Plan colour**:
In a Mix, a Plan colour with more than 50% but less than 75% of the Portfolio's value. It takes exactly the left Side, and the other colours split the right Side by value. From 75% up, a colour takes the nearest Mix case piece to its true share. Where no kept Mix case with as many colours gives it the whole left Side (two Plan colours, or ten or more), the Mix draws the nearest case without it.
_Avoid_: Majority, main colour

**Plan colour**:
The colour family and Tint a Plan type is drawn in. Different Plan types may share a Plan colour when they are alike, and the Mix then counts them as one colour.
_Avoid_: Theme colour

**Colour family**:
One of the nine neon hues a Plan colour comes from, such as Purple or Navy.
_Avoid_: family (on its own), hue

**Tint**:
One of the solid steps of a colour family: 100, 75, 50 or 25, and 150 for Green and Red. Plans mostly use 100, or 150 for Green and Red.
_Avoid_: Shade, opacity
