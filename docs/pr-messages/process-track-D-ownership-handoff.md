# Ownership Handoff Request - Track D

## Summary
This process branch (owner Track A) temporarily included a Track D-owned change and cannot keep it under owner-scoped policy enforcement.

Please open a Track D branch and apply exactly the diff below.

- Owner track: Track D
- Owner: medvall
- File: src/ecs/resources/map-resource.js
- Source branch context ticket IDs: A-10 (informational only)

## Exact Diff To Re-Apply

```diff
diff --git a/src/ecs/resources/map-resource.js b/src/ecs/resources/map-resource.js
index f8ac756..8d31f75 100644
--- a/src/ecs/resources/map-resource.js
+++ b/src/ecs/resources/map-resource.js
@@ -29,6 +29,7 @@
  *   - isInGhostHouse(map, row, col) — check if coords are within ghost house
  *   - countPellets(map) — count remaining pellets on the map
  *   - countPowerPellets(map) — count remaining power pellets on the map
+ *   - assertValidMapResource(map) — runtime guard for loaded map resources
  *   - cloneMap(map) — deep clone for level restart determinism
  *   - validateMapSemantic(rawMap) — semantic validation without parsing
  *
@@ -515,6 +516,113 @@ export function countPowerPellets(map) {
   return countCellType(map.grid, CELL_TYPE.POWER_PELLET);
 }
 
+/**
+ * Assert that a runtime map resource satisfies the trusted contract shape.
+ *
+ * This guard protects the loader boundary when a pre-parsed map resource is
+ * injected at runtime (for example through sync preload adapters).
+ *
+ * @param {MapResource} map
+ * @throws {Error} If the map resource shape is malformed.
+ */
+export function assertValidMapResource(map) {
+  const errors = [];
+
+  if (!map || typeof map !== 'object') {
+    throw new Error('Map resource validation failed: map must be a non-null object');
+  }
+
+  if (!Number.isInteger(map.rows) || map.rows <= 0) {
+    errors.push('rows must be a positive integer');
+  }
+
+  if (!Number.isInteger(map.cols) || map.cols <= 0) {
+    errors.push('cols must be a positive integer');
+  }
+
+  if (!(map.grid instanceof Uint8Array)) {
+    errors.push('grid must be a Uint8Array');
+  }
+
+  if (!Array.isArray(map.grid2D)) {
+    errors.push('grid2D must be an array of rows');
+  }
+
+  if (!Array.isArray(map.activeGhostTypes)) {
+    errors.push('activeGhostTypes must be an array');
+  }
+
+  if (typeof map.name !== 'string') {
+    errors.push('name must be a string');
+  }
+
+  if (!Number.isFinite(map.timerSeconds)) {
+    errors.push('timerSeconds must be a finite number');
+  }
+
+  if (!Number.isFinite(map.maxGhosts)) {
+    errors.push('maxGhosts must be a finite number');
+  }
+
+  if (!Number.isFinite(map.ghostSpeed)) {
+    errors.push('ghostSpeed must be a finite number');
+  }
+
+  const coordinateFields = [
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
+  for (const field of coordinateFields) {
+    if (!Number.isInteger(map[field])) {
+      errors.push(`${field} must be an integer`);
+    }
+  }
+
+  if (!Number.isInteger(map.initialPelletCount) || map.initialPelletCount < 0) {
+    errors.push('initialPelletCount must be a non-negative integer');
+  }
+
+  if (!Number.isInteger(map.initialPowerPelletCount) || map.initialPowerPelletCount < 0) {
+    errors.push('initialPowerPelletCount must be a non-negative integer');
+  }
+
+  if (Number.isInteger(map.rows) && Number.isInteger(map.cols)) {
+    const expectedGridLength = map.rows * map.cols;
+    if (map.grid instanceof Uint8Array && map.grid.length !== expectedGridLength) {
+      errors.push(`grid length must equal rows * cols (${expectedGridLength})`);
+    }
+
+    if (Array.isArray(map.grid2D)) {
+      if (map.grid2D.length !== map.rows) {
+        errors.push(`grid2D row count must equal rows (${map.rows})`);
+      }
+
+      for (let rowIndex = 0; rowIndex < map.grid2D.length; rowIndex += 1) {
+        const row = map.grid2D[rowIndex];
+        if (!Array.isArray(row)) {
+          errors.push(`grid2D row ${rowIndex} must be an array`);
+          continue;
+        }
+
+        if (row.length !== map.cols) {
+          errors.push(`grid2D row ${rowIndex} length must equal cols (${map.cols})`);
+        }
+      }
+    }
+  }
+
+  if (errors.length > 0) {
+    throw new Error(`Map resource validation failed: ${errors.join('; ')}`);
+  }
+}
+
 /**
  * Deep clone a map resource for level restart determinism.
  * Clones the flat grid, 2D grid, and metadata arrays.
```

## Validation Expected In Track D PR

- Run: npm run policy
- Run: npm run test:unit
- Run: npm run test:integration (if impacted)
- Confirm owner-scope checks pass on Track D branch
