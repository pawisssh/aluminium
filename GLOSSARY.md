# Aluminium

Finnomena dashboard design work and the tools that support it, starting with Mixture: a playground for how a Portfolio's asset allocation is drawn as a grid of colour.

## Language

**Plan**:
One investment plan the customer holds, with a value in baht and a single colour.
_Avoid_: Fund, product, holding

**Portfolio**:
A named group of Plans, such as Investments, Retirement or Cash.
_Avoid_: Port, group, bucket

**Brick**:
A Plan's icon: a single-colour Pattern-Builder Pattern on a 4×4 grid, so it is one piece joined by edges or corners and has a Brick family and a Slope.
_Avoid_: Block (one rectangle inside a Pattern, in the Pattern Builder), icon, pixel art

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
_Avoid_: mode

**Random layout**:
The Mix layout that grows each Plan colour, largest first, from a random cell into neighbouring cells, so each colour is one edge-joined piece. The Mix's seed picks the cells.
_Avoid_: Scatter

**Ordered layout**:
The Mix layout that places Plan colours largest first, the same way every time, in two Sides. Every colour but the largest sits whole in one Side, so the largest is the only one that can span both, and each colour is one edge-joined piece.
_Avoid_: Snake

**Side**:
One of the two halves, left and right, that an Ordered layout fills. When colours tie on value, the one listed first counts as the larger.
_Avoid_: column, half (Half is a Slope)

**Dominant Plan colour**:
In an Ordered layout, a Plan colour with more than 50% but less than 75% of the Portfolio's value. It takes exactly the left Side, and the other colours split the right Side by value. From 75% up, a colour takes its true share.
_Avoid_: Majority, main colour

**Plan colour**:
The colour family and Tint a Plan is drawn in. Different Plans may share a Plan colour when they are the same kind of plan.
_Avoid_: Theme colour

**Colour family**:
One of the twelve neon hues a Plan colour comes from, such as Purple or Navy.
_Avoid_: family (on its own), hue

**Tint**:
One of the solid steps of a colour family: 100, 75, 50 or 25. Plans mostly use 100.
_Avoid_: Shade, opacity
