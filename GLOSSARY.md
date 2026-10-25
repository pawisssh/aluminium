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

**Plan colour**:
The colour family and Tint a Plan is drawn in. Different Plans may share a Plan colour when they are the same kind of plan.
_Avoid_: Theme colour

**Tint**:
One of the solid steps of a colour family: 100, 75, 50 or 25. Plans mostly use 100.
_Avoid_: Shade, opacity
