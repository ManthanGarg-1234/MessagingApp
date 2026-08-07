/**
 * Example integration test outline (requires a running/mocked MongoDB, e.g. via
 * mongodb-memory-server in a full setup). Shown here to illustrate the pattern
 * requested for the CI plan — signup should reject duplicate usernames.
 */
import { jest } from "@jest/globals";

test("signup payload validation shape", () => {
  const validPayload = { username: "asha", password: "s3cret!" };
  expect(validPayload.username).toBeTruthy();
  expect(validPayload.password.length).toBeGreaterThan(0);
});

// TODO (full setup): spin up mongodb-memory-server, import the Express app,
// and use supertest to assert:
//  - POST /api/auth/signup twice with the same username -> second returns 409
//  - POST /api/auth/login with wrong password -> 401
//  - GET /api/auth/me without a token -> 401
