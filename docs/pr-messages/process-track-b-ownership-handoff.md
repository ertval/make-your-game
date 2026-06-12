# Ownership Handoff Request - Track B

## Summary
This process branch (owner Track A) temporarily included a Track B-owned change and cannot keep it under owner-scoped policy enforcement.

Please open a Track B branch and apply exactly the diff below.

- Owner track: Track B
- Owner: asmyrogl
- File: src/ecs/systems/input-system.js
- Source branch context ticket IDs: A-10, D-05 (informational only)

## Exact Diff To Re-Apply

```diff
diff --git a/src/ecs/systems/input-system.js b/src/ecs/systems/input-system.js
index 3e531ca..9e4f82c 100644
--- a/src/ecs/systems/input-system.js
+++ b/src/ecs/systems/input-system.js
@@ -41,6 +41,10 @@ export function createInputSystem(options = {}) {
   return {
     name: 'input-system',
     phase: 'input',
+    resourceCapabilities: {
+      read: [adapterResourceKey, inputStateResourceKey],
+      write: [],
+    },
     update(context) {
       const adapter = context.world.getResource(adapterResourceKey);
       const inputState = context.world.getResource(inputStateResourceKey);
```

## Validation Expected In Track B PR

- Run: npm run policy
- Run: npm run test:unit
- Run: npm run test:integration (if impacted)
- Confirm owner-scope checks pass on Track B branch
