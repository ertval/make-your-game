-## ✅ Audit Source Of Truth

- Note: The canonical audit ID → test mapping is maintained in `tests/e2e/audit/audit-question-map.js` and `docs/implementation/audit-traceability-matrix.md`. Use those files as the canonical anchors when referencing audit IDs in automation or CI.

- This file is the **pass/fail acceptance source of truth** for project completion.
- Final integration/e2e validation MUST be based directly on the questions in this file.
- There MUST be explicit verification coverage for **every single question** below (functional + bonus) following the categories in `AGENTS.md` (Fully Automatable, Semi-Automatable, Manual-With-Evidence).
- The project is complete only when mapped automated checks pass and required manual evidence artifacts are attached.

#### Functional

##### Try playing the game

###### Does the game run without crashing?

###### Does animation run using `RequestAnimationFrame`?

###### Is the game single player?

###### Does the game avoid the use of `canvas`?

###### Does the game avoid the use of frameworks?

###### Is the game chosen from the pre-approved list?

##### Try pausing the game while it is running.

###### Does the game display the pause menu, with the options: continue and restart?

##### Try pausing the game while it is running and choose the continue option.

###### Does the game continue?

##### Try pausing the game while it is running and choose the restart option.

###### Does the game restart?

##### Use the Dev Tool/Performance to record and try pausing the game while it is running.

###### Can you confirm there aren't any dropped frames, and requestAnimationFrame is able to run at the same rate unaffected?

##### Try moving the player/element using the proper commands and keys to do so.

###### Does the player obey the commands?

##### Try moving the player/element using the proper commands and keys to do so.

###### Does the player move without spamming the key to do so?

##### Try playing the game.

###### Does the game work like it should (as one of the games from the pre-approved list)?

##### Try playing the game.

###### Does the countdown/timer clock seem to be working?

##### Try playing the game and score some points.

###### Does the score increase correctly on scoring actions, using deterministic scoring from collision intents (pellet `+10`, Power Pellet `+50`, power-up `+100`, normal ghost kills following `200 × 2^(n-1)` chain scoring, and stunned ghost kills awarding a fixed `400` bonus without participating in the chain)?

##### Try playing the game and try losing a life.

###### Does the player lives seem to work like it should, by decreasing the numbers of lives of the player?

##### Try using the Dev Tool/Performance.

###### Can you confirm that there are no frame drops?

##### Try using the Dev Tool/Performance.

###### Does the game run at/or around 60fps? (from 50 to 60 or more)

##### Try using the Dev Tool/performance and the option rendering with the paint ON, if possible.

###### Can you confirm that the paint is being used as little as possible?

##### Try using the Dev Tool/performance and the option rendering with the layer ON, if possible.

###### Can you confirm that the layers are being used as little as possible?

###### Is [layer creation being promoted](https://developers.google.com/web/fundamentals/performance/rendering/stick-to-compositor-only-properties-and-manage-layer-count) properly?

#### Bonus

###### +Does the project run quickly and effectively? (Favoring recursive, no unnecessary data requests, etc)

###### +Does the code obey the [good practices](../AGENTS.md#security-and-code-quality)?

###### +Does the program reuses memory to avoid jank?

###### +Does the game use [svg](https://developer.mozilla.org/en-US/docs/Web/SVG)?

###### +Is the code using asynchronicity to increase performance?

###### +Do you think in general this project is well done?
