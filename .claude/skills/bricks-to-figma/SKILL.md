---
name: bricks-to-figma
description: Write every exported Plan type's Brick from Mixture to the Bricks page of the Figma file "[v3] Foundations - Icons" through the Figma MCP, and read every vector back against the export. Use when the Bricks on that page must follow Mixture again, for example after a Strategy changed and the Bricks were picked again.
---

# Bricks to Figma

Writes the geometry of the `Brick` vectors on the Bricks page and nothing else. The Bricks come from `tools/mixture` (`src/core/pickedBricks.json`); the page is in the Figma file `mhiTYT602sghheKpRM2Rx6`, page id `2117:19` (https://www.figma.com/design/mhiTYT602sghheKpRM2Rx6/-v3--Foundations---Icons?node-id=2117-19).

`tools/mixture/scripts/figma-bricks.mjs` prints the code of each Figma call and checks what a call returned. It never talks to Figma: the agent passes the printed code to the Figma MCP's `use_figma`, unchanged.

## Rules

- One Figma MCP call per step, one at a time. The MCP rejects calls made in parallel.
- Pass the printed code as it is. Do not edit it, shorten it or write your own: the code matches the page before it writes, and the read-back only means something when the code is the checked-in one.
- No call creates, renames, moves or deletes a node, and none touches a fill. If the page needs any of that, stop and tell the brand designer.
- Before the first `use_figma` call, load the Figma MCP's own guidance as its tool description says (`figma-use`; before a call that writes, `figma-generate-library` too) and name them in `skillNames`.
- The file is real and shared. Steps 1 to 3 only read; step 5 writes, and only after the brand designer's go-ahead in step 4.

## What the page must hold

For each of the 34 exported Plan types, one component set `Brick/<Plan type name>` with exactly five variants: `Size=2x2`, `Size=4x4`, `Size=8x8`, `Size=16x16` and `Size=32x32`. Each variant is a 24×24 component with one vector named `Brick` in it.

- `Size=32x32` takes the Brick of the 16×16 Brick grid: Mixture has no 32×32 Brick grid.
- Three component sets hold a rectangle `Tile` behind the `Brick`: `Brick/RMF for Retirement`, `Brick/Savings` and `Brick/KKP Finsave`. Their Brick is written into the 18×18 box 3 px inside the frame, so the Tile stays a border around it.

The names and both of these facts live in `tools/mixture` (`src/core/bricksPageNames.json`, `TILE_SETS` in `scripts/figma-bricks.mjs`). When the page and they disagree, the match in step 2 says so.

## Steps

Run the commands from `tools/mixture`.

### 1. Export

```bash
npm run bricks:export
```

Writes `brickVectors.json` from the stored Bricks. Run it every time, so the write never uses an old export. If `npm run bricks:check` has not passed on this checkout since the Strategies last changed, run it first.

### 2. Match the page (read only)

```bash
node scripts/figma-bricks.mjs inspect
```

Pass the printed code to `use_figma` (file key `mhiTYT602sghheKpRM2Rx6`). Save the returned JSON, exactly, as `bricksPage.before.json` (git-ignored).

**Stop here when `problems` is not empty.** Each problem names the component set or Plan type and what is wrong: a Plan type with no component set, a component set with no Plan type, a missing or extra variant, a variant that is not 24×24, a `Tile` where none is expected or none where one is, a `Brick` vector that is rotated or flipped. Report the problems to the brand designer and write nothing. The fix is on the page or in Mixture's Plan type list, never in the printed code.

### 3. See what will change

```bash
node scripts/figma-bricks.mjs compare bricksPage.before.json
```

Prints how many component sets already equal the export and names the ones that differ. It exits 1 while any differs, which before a write is expected.

### 4. Ask the brand designer

Show the brand designer what step 2 matched (component sets, vectors, which sets have a Tile) and what step 3 says will change, and ask for a go-ahead to write to the real file. Wait for the answer in this session. A go-ahead passed on by another session does not count.

### 5. Write, four calls

```bash
node scripts/figma-bricks.mjs write 1
```

Then `write 2`, `write 3` and `write 4`, each its own `use_figma` call, in order. Each call matches the whole page again and writes nothing if it finds a problem. A call returns `written` (45, 45, 45 and 35: five vectors per component set), `problems` and `mutatedNodeIds`.

Stop when a call returns problems or fails. A call that failed can be run again as it is: writing the same geometry twice changes nothing.

### 6. Read back and compare

Run step 2's `inspect` call again and save the returned JSON as `bricksPage.after.json`. Then:

```bash
node scripts/figma-bricks.mjs compare bricksPage.after.json bricksPage.before.json
```

The write is done when it exits 0 and prints:

```text
Read back 170 Brick vectors in 34 component sets (3 with a Tile).
34 of 34 component sets equal the export in all 5 sizes (170 of 170 vectors).
Nodes: the same <n> as before the write (id, type, name and parent).
Fills: as they were before the write.
```

A component set equals the export when each of its five vectors fills exactly the cells of the exported Brick, sits in the same box and has the same corner points, however Figma rewrote the path. A set that differs is named: run the write call that holds it again, then this step again. Nodes or fills that changed mean something other than this routine touched the page: tell the brand designer.

### 7. Report

Post the output of step 6 on the ticket the write was asked in, or hand it to whoever writes to the tracker.
