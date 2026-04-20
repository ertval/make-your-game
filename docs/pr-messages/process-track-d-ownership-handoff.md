# Ownership Handoff Request - Track D

## Summary
This process branch (owner Track A) temporarily included Track D-owned resource changes and cannot keep them under owner-scoped policy enforcement.

Please open a Track D branch and apply exactly the diffs below.

- Owner track: Track D
- Owner: medvall
- Files:
  - src/ecs/resources/game-status.js
  - src/ecs/resources/map-resource.js
- Source branch context ticket IDs: A-10, D-05 (informational only)

## Exact Diffs To Re-Apply

```diff
diff --git a/src/ecs/resources/game-status.js b/src/ecs/resources/game-status.js
index c4cfa1b..a547e5d 100644
--- a/src/ecs/resources/game-status.js
+++ b/src/ecs/resources/game-status.js
@@ -50,6 +50,8 @@ export const GAME_STATE = {
 export const VALID_TRANSITIONS = {
   [GAME_STATE.MENU]: [GAME_STATE.PLAYING],
   [GAME_STATE.PLAYING]: [
+    // Explicit PLAYING self-transition keeps restart semantics valid without a pause detour.
+    GAME_STATE.PLAYING,
     GAME_STATE.PAUSED,
     GAME_STATE.LEVEL_COMPLETE,
     GAME_STATE.GAME_OVER,
```

```diff
diff --git a/src/ecs/resources/map-resource.js b/src/ecs/resources/map-resource.js
index f8ac756..5508a62 100644
--- a/src/ecs/resources/map-resource.js
+++ b/src/ecs/resources/map-resource.js
@@ -20,6 +20,7 @@
  *
  * Public API:
  *   - createMapResource(rawMap) - factory that parses and validates a raw map
+ *   - assertValidMapResource(map) - runtime contract guard for trusted map resources
  *   - getCell(map, row, col) - O(1) cell type lookup
  *   - setCell(map, row, col, type) - mutate a cell (runtime destruction)
  *   - isWall(map, row, col) - convenience check for impassable cells
@@ -318,6 +319,64 @@ function countCellType(flatGrid, cellType) {
   return count;
 }
 
+function isSafeInteger(value) {
+  return Number.isInteger(value) && Number.isFinite(value);
+}
+
+function assertMapResource(condition, message) {
+  if (!condition) {
+    throw new Error(`Map resource validation failed: ${message}`);
+  }
+}
+
+/**
+ * Validate that an object satisfies the trusted runtime MapResource contract.
+ *
+ * This guard is used at load boundaries before world resource injection.
+ *
+ * @param {object} map - Candidate map resource object.
+ * @returns {boolean}
+ */
+export function assertValidMapResource(map) {
+  assertMapResource(Boolean(map) && typeof map === 'object', 'map must be an object');
+
+  assertMapResource(isSafeInteger(map.rows) && map.rows > 0, 'rows must be a positive integer');
+  assertMapResource(isSafeInteger(map.cols) && map.cols > 0, 'cols must be a positive integer');
+  assertMapResource(
+    map.grid instanceof Uint8Array,
+    'grid must be a Uint8Array for deterministic O(1) lookup',
+  );
+  assertMapResource(map.grid.length === map.rows * map.cols, 'grid size must equal rows * cols');
+  assertMapResource(Array.isArray(map.grid2D), 'grid2D must be an array of rows');
+  assertMapResource(map.grid2D.length === map.rows, 'grid2D row count must match rows');
+  assertMapResource(Array.isArray(map.activeGhostTypes), 'activeGhostTypes must be an array');
+
+  for (let rowIndex = 0; rowIndex < map.grid2D.length; rowIndex += 1) {
+    const row = map.grid2D[rowIndex];
+    assertMapResource(Array.isArray(row), `grid2D row ${rowIndex} must be an array`);
+    assertMapResource(
+      row.length === map.cols,
+      `grid2D row ${rowIndex} length must match declared columns`,
+    );
+  }
+
+  const coordinateKeys = [
+    'playerSpawnRow',
+    'playerSpawnCol',
+    'ghostHouseTopRow',
+    'ghostHouseBottomRow',
+    'ghostHouseLeftCol',
+    'ghostHouseRightCol',
+    'ghostSpawnRow',
+    'ghostSpawnCol',
+  ];
+
+  for (const key of coordinateKeys) {
+    assertMapResource(isSafeInteger(map[key]), `${key} must be an integer`);
+  }
+
+  return true;
+}
 // ---------------------------------------------------------------------------
 // Map resource factory
 // ---------------------------------------------------------------------------
```

## Validation Expected In Track D PR

- Run: npm run policy
- Run: npm run test:unit
- Run: npm run test:integration (if impacted)
- Confirm owner-scope checks pass on Track D branch
