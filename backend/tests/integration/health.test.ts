/**
 * P0-03 integration tests — exercise the wired-up app via supertest.
 * No real DB connection, no listen() — `createApp()` returns a bare Express
 * instance that supertest can drive directly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

import { createApp } from '../../src/app';
import { AppError } from '../../src/errors';

let app: Application;

beforeAll(() => {
  app = createApp();
});

describe('GET /health', () => {
  it('returns 200 with the standard success envelope', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(typeof res.body.data.version).toBe('string');
  });

  it('echoes the x-request-id header', async () => {
    const res = await request(app)
      .get('/health')
      .set('x-request-id', 'test-req-123');
    expect(res.headers['x-request-id']).toBe('test-req-123');
  });
});

describe('404 handler', () => {
  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('/this-route-does-not-exist'),
      },
    });
  });
});

describe('error handler — AppError passthrough', () => {
  it('serializes a thrown AppError with its httpStatus and code', async () => {
    const localApp = createApp({
      registerExtraRoutes: (a) => {
        a.get('/__throw_validation', () => {
          throw new (class extends AppError {
            constructor() {
              super({
                httpStatus: 400,
                code: 'VALIDATION_ERROR',
                message: 'bad input',
                details: { field: 'email' },
              });
            }
          })();
        });
      },
    });

    const res = await request(localApp).get('/__throw_validation');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'bad input',
        details: { field: 'email' },
      },
    });
  });

  it('hides internals for non-AppError exceptions', async () => {
    const localApp = createApp({
      registerExtraRoutes: (a) => {
        a.get('/__boom', () => {
          throw new Error('secret stack should not leak');
        });
      },
    });

    const res = await request(localApp).get('/__boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
});
