/*
 * Browser entrypoint for Ms. Ghostman.
 *
 * Purpose: Starts the ECS runtime only when loaded in a browser document.
 * Public API: N/A (entry module).
 * Implementation notes:
 *   - Keeps bootstrap side effects out of main.ecs.js so tests can import runtime functions safely.
 *   - main.js is the designated entrypoint for index.html.
 *   - main.ecs.js contains the engine logic and bootstrap functions without triggering execution.
 */

import './security/trusted-types.js';
import { startBrowserApplication } from './main.ecs.js';

startBrowserApplication();
