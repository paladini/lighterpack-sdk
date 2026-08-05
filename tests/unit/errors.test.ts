import { describe, expect, it } from 'vitest';
import { ApiError, LighterPackAuthError, NotFoundError, SyncConflictError, ValidationError } from '../../src/errors.js';

describe('error classes', () => {
  it('LighterPackAuthError has a sensible default message and name', () => {
    const err = new LighterPackAuthError();
    expect(err.name).toBe('LighterPackAuthError');
    expect(err.message).toMatch(/invalid/i);
    expect(err).toBeInstanceOf(Error);
  });

  it('LighterPackAuthError accepts a custom message', () => {
    const err = new LighterPackAuthError('custom');
    expect(err.message).toBe('custom');
  });

  it('SyncConflictError has a sensible default message and name', () => {
    const err = new SyncConflictError();
    expect(err.name).toBe('SyncConflictError');
    expect(err.message).toMatch(/changed elsewhere/i);
  });

  it('ValidationError carries the given message and name', () => {
    const err = new ValidationError('bad input');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('bad input');
  });

  it('NotFoundError formats entity and id into the message', () => {
    const err = new NotFoundError('Item', 42);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('Item 42 was not found.');
  });

  it('ApiError carries status and body', () => {
    const err = new ApiError('boom', 500, { detail: 'x' });
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(500);
    expect(err.body).toEqual({ detail: 'x' });
  });

  it('all error classes are real Error instances distinguishable by name', () => {
    const errors = [
      new LighterPackAuthError(),
      new SyncConflictError(),
      new ValidationError('x'),
      new NotFoundError('X', 1),
      new ApiError('x', 400),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
    }
    expect(new Set(errors.map((e) => e.name)).size).toBe(errors.length);
  });
});
