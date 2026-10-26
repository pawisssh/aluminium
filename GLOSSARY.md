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
A Plan's icon: a single-colour Pattern-Builder Pattern on a 4×4 grid, so it is one piece joined by edges or corners and has a family (rising, hanging, mountain) and a Slope.
_Avoid_: Block (one rectangle inside a Pattern, in the Pattern Builder), icon, pixel art

**Mix**:
A Portfolio's icon: a square grid (4×4 or 8×8) filled with Plan colours, where each colour takes a share of cells matching its share of the Portfolio's value.
_Avoid_: Heatmap, treemap, allocation chart

**Random layout**:
The Mix layout that grows each Plan colour, largest first, from a random cell into neighbouring cells, so each colour is one edge-joined piece. The Portfolio's seed picks the cells.
_Avoid_: Scatter

**Ordered layout**:
The Mix layout that places Plan colours largest first, filling the grid's left half before its right half, each half row by row from its top-left. A colour that runs out of the left half's lower rows into the right half ends up in two pieces.
_Avoid_: Snake

**Dominant Plan colour**:
In an Ordered layout, a Plan colour with more than 50% but less than 75% of the Portfolio's value. It takes exactly the left half, and the other colours split the right half by value. From 75% up, a colour takes its true share.
_Avoid_: Majority, main colour

**Plan colour**:
The colour family and Tint a Plan is drawn in. Different Plans may share a Plan colour when they are the same kind of plan.
_Avoid_: Theme colour

**Tint**:
One of the solid steps of a colour family: 100, 75, 50 or 25. Plans mostly use 100.
_Avoid_: Shade, opacity
