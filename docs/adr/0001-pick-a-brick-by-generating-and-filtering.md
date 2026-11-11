# Pick a Plan type's Brick by generating many and filtering

A Plan type's Strategy asks for things the Pattern Builder generator has no setting for: the shape of the largest Block (Initial Cost) and whether the whole Brick holds together by edges alone (Investment Style). The generator's settings are Slope, Block count, corner-meet limit, guidance, Brick family and Reference set. We decided to leave the generator as it is and pick each Brick by drawing many Patterns across seeds, Block counts and guidance, keeping those the Strategy allows, and taking the one nearest the Initial Cost target, then one no earlier Plan type took, then the one that overlaps the Plan Cover most.

The generator is shared with the Pattern Builder (`finnomena/block`) and vendored here unedited, so a new setting would change every Pattern it draws for CI work, not only Bricks. Filtering keeps the Strategy rule a separate piece on top of it. The prototype (branch `prototype/initial-cost-largest-block`, commit `8dedeee`) showed it is enough: under the rule read off the Plan Covers, 30, 25 and 32 of 34 Plan types hit their target exactly on 4×4, 8×8 and 16×16.

## Considered Options

- **New generator settings** for the largest Block's shape and edge-only joins: exact every time and fast, but it changes the shared generator for a need only Bricks have.

## Consequences

- A Brick can be the nearest one found, not an exact match: on 2×2 only 18 of 34 were exact, and several Plan types share a Brick there.
- The search is slow on 16×16 (about 40 seconds for the prototype's pools), so Bricks are worked out ahead of time by a command and stored, not searched for in the browser.
- The result depends on which seeds are searched. The seed list is fixed so the same Strategy always gives the same Brick; widening it can change Bricks that were already sent to Figma.
