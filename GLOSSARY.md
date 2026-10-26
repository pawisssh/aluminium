# Aluminium

Finnomena dashboard design work and the tools that support it, starting with Mixture: a playground for how a Portfolio's asset allocation is drawn as a grid of colour.

## Language

**Plan**:
One investment plan the customer holds, with a value in baht. Its Plan type gives it its name, Plan colour and Brick.
_Avoid_: Fund, holding
_Avoid in code_: product

**Plan type**:
One kind of Plan a customer can hold, such as Global Multi-Income Strategy or หุ้นไทย, with a name, a Plan colour and a Brick. Random draws pick only the Plan types that are in draws.
_Avoid_: Brick (the Plan type's drawing, not the Plan type), offering

**Portfolio**:
A named group of Plans, such as Investments, Retirement or Cash.
_Avoid_: group, bucket
_Avoid in code_: Port

**Brick**:
A Plan type's icon: a single-colour Pattern-Builder Pattern on the Brick grid, so it is one piece joined by edges or corners and has a Brick family and a Slope.
_Avoid_: Block (one rectangle inside a Pattern, in the Pattern Builder), icon, pixel art

**Brick grid**:
The cells every Brick is drawn on: 4×4 by default, or 8×8, 16×16 or a portrait grid (4×6, 8×12) to see how Bricks read at other sizes. One setting for all Bricks.
_Avoid_: Brick size
_Avoid in code_: canvas

**Slope**:
How steeply a Brick rises from bottom-left to top-right: Flat, Half or 75%. A mountain Brick has no 75%.
_Avoid_: angle, steepness

**Brick family**:
The shape a Brick's Pattern follows: rising, hanging or mountain. A Brick whose family is left unchosen (Auto) takes whichever one its seed picks.
_Avoid_: family (on its own), auto family

**Mix**:
A Portfolio's icon: a square grid (4×4 or 8×8) filled with Plan colours, where each colour takes a share of cells matching its share of the Portfolio's value.
_Avoid_: Heatmap, treemap, allocation chart

**Mix layout**:
How a Mix places its Plan colours: a Random layout or an Ordered layout.
_Avoid in code_: mode

**Random layout**:
The Mix layout that grows each Plan colour, largest first, from a random cell into neighbouring cells, so each colour is one edge-joined piece. The Mix's seed picks the cells.
_Avoid_: Scatter

**Ordered layout**:
The Mix layout that places Plan colours largest first, the same way every time, in two Sides, each with a Turning fill. Every colour but the largest sits whole in one Side, so the largest is the only one that can span both, and each colour is one edge-joined piece. A 4×4 Ordered layout counts its Plan colours (up to 11; any smaller ones are left out), then draws the Mix case with as many colours that sits nearest their values, keeping equal values as equal pieces where such a case exists.
_Avoid_: Snake

**Side**:
One of the two halves, left and right, that an Ordered layout fills. When colours tie on value, the one listed first counts as the larger.
_Avoid_: half (Half is a Slope)
_Avoid in code_: column

**Mix case**:
One way a 4×4 Mix can be cut up when every Plan colour is a single 1×1, 2×1, 2×2, 2×3 or 2×4 piece (a Side's width by its rows), placed largest first in the left Side while it fits, then the right. Only the largest colour can be bigger, from 75% up: it takes the whole left Side and a 2×2 to 2×4 piece at the top of the right.
_Avoid_: scenario, permutation

**Turning fill**:
How an Ordered layout fills each Side: row by row from the top, each row running the opposite way to the one above, so a colour that reaches a row's end carries on into the row below.
_Avoid_: Snake, zigzag

**Dominant Plan colour**:
In an Ordered layout, a Plan colour with more than 50% but less than 75% of the Portfolio's value. It takes exactly the left Side, and the other colours split the right Side by value. From 75% up, a colour takes its true share (in a 4×4 Mix, the nearest Mix case piece). With ten or more Plan colours no Mix case has room for a whole left Side, so a 4×4 Mix draws the nearest case without it.
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
