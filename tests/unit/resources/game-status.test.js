/**
 * Unit tests for D-01 game-status resource.
 *
 * Verifies FSM state transitions, invalid transition rejection,
 * and predicate helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  GAME_STATE,
  VALID_TRANSITIONS,
  canTransition,
  createGameStatus,
  isMenu,
  isPaused,
  isPlaying,
  isTerminal,
  transitionTo,
} from '../../../src/ecs/resources/game-status.js';

describe('game-status', () => {
  it('creates with MENU as default state', () => {
    const status = createGameStatus();
    expect(status.currentState).toBe(GAME_STATE.MENU);
    expect(status.previousState).toBeNull();
  });

  it('allows MENU → PLAYING transition', () => {
    const status = createGameStatus();
    expect(canTransition(status, GAME_STATE.PLAYING)).toBe(true);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
    expect(status.previousState).toBe(GAME_STATE.MENU);
  });

  it('allows PLAYING ↔ PAUSED transitions', () => {
    const status = createGameStatus(GAME_STATE.PLAYING);
    transitionTo(status, GAME_STATE.PAUSED);
    expect(status.currentState).toBe(GAME_STATE.PAUSED);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('allows PLAYING → LEVEL_COMPLETE → PLAYING', () => {
    const status = createGameStatus(GAME_STATE.PLAYING);
    transitionTo(status, GAME_STATE.LEVEL_COMPLETE);
    expect(status.currentState).toBe(GAME_STATE.LEVEL_COMPLETE);
    transitionTo(status, GAME_STATE.PLAYING);
    expect(status.currentState).toBe(GAME_STATE.PLAYING);
  });

  it('allows LEVEL_COMPLETE → VICTORY when all levels done', () => {
    const status = createGameStatus(GAME_STATE.LEVEL_COMPLETE);
    transitionTo(status, GAME_STATE.VICTORY);
    expect(status.currentState).toBe(GAME_STATE.VICTORY);
  });

  it('allows VICTORY → MENU and GAME_OVER → MENU', () => {
    const victoryStatus = createGameStatus(GAME_STATE.VICTORY);
    transitionTo(victoryStatus, GAME_STATE.MENU);
    expect(victoryStatus.currentState).toBe(GAME_STATE.MENU);

    const gameOverStatus = createGameStatus(GAME_STATE.GAME_OVER);
    transitionTo(gameOverStatus, GAME_STATE.MENU);
    expect(gameOverStatus.currentState).toBe(GAME_STATE.MENU);
  });

  it('rejects invalid transitions', () => {
    const status = createGameStatus(GAME_STATE.MENU);
    expect(() => transitionTo(status, GAME_STATE.PAUSED)).toThrow();
    expect(() => transitionTo(status, GAME_STATE.GAME_OVER)).toThrow();
  });

  it('predicates return correct values', () => {
    const menuStatus = createGameStatus(GAME_STATE.MENU);
    expect(isMenu(menuStatus)).toBe(true);
    expect(isPlaying(menuStatus)).toBe(false);
    expect(isPaused(menuStatus)).toBe(false);
    expect(isTerminal(menuStatus)).toBe(false);

    const playingStatus = createGameStatus(GAME_STATE.PLAYING);
    expect(isPlaying(playingStatus)).toBe(true);

    const pausedStatus = createGameStatus(GAME_STATE.PAUSED);
    expect(isPaused(pausedStatus)).toBe(true);

    const victoryStatus = createGameStatus(GAME_STATE.VICTORY);
    expect(isTerminal(victoryStatus)).toBe(true);

    const gameOverStatus = createGameStatus(GAME_STATE.GAME_OVER);
    expect(isTerminal(gameOverStatus)).toBe(true);
  });

  it('defines all expected transitions in the map', () => {
    for (const state of Object.values(GAME_STATE)) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(VALID_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });
});
