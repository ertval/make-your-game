/*
 * Browser entrypoint for Ms. Ghostman.
 *
 * Purpose: Starts the ECS runtime only when loaded in a browser document.
 * Public API: N/A (entry module).
 * Implementation notes: Keeps bootstrap side effects out of main.ecs.js so tests can import runtime functions safely.
 */

import { startBrowserApplication } from './main.ecs.js';

startBrowserApplication();
