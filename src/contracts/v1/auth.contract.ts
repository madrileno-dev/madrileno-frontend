import { z } from "zod";
import { oc } from "@orpc/contract";
import { errorSchema } from "../schemas";
import { authWithEmailRequestSchema, authWithFirebaseRequestSchema, authWithOidcRequestSchema, authWithRefreshTokenRequestSchema, authenticatedResponseSchema, sessionDtoSchema } from "./auth.schemas";

export const v1Auth = {
  dev: {
    post: oc
      .route({
        method: 'POST',
        path: '/v1/auth/dev',
        summary: 'Dev-only: authenticate with an email address (no password)',
        description: 'Dev-mode login: exchanges a bare email address for an internal JWT and refresh token, creating the user on first login. Gated by `DEV_AUTH_ENABLED` (`dev-auth.enabled`, off by default) — when disabled the endpoint answers 404. Never enable outside local/dev environments.',
        tags: ['Auth'],
        successStatus: 200,
        inputStructure: 'detailed'
      })
      .input(z.object({
        body: authWithEmailRequestSchema
      }))
      .output(authenticatedResponseSchema)
      .errors({
        'result:invalid-token': {
          status: 401,
          data: errorSchema.extend({type: z.enum(["result:invalid-token"]).describe("A URI reference identifying the problem type")})
        }
      })
  },
  firebase: {
    post: oc
      .route({
        method: 'POST',
        path: '/v1/auth/firebase',
        summary: 'Exchange Firebase token for internal JWT and refresh token',
        description: 'Authenticate with Firebase JWT token',
        tags: ['Auth'],
        successStatus: 200,
        inputStructure: 'detailed'
      })
      .input(z.object({
        body: authWithFirebaseRequestSchema
      }))
      .output(authenticatedResponseSchema)
      .errors({
        'result:invalid-token': {
          status: 401,
          data: errorSchema.extend({type: z.enum(["result:invalid-token"]).describe("A URI reference identifying the problem type")})
        },
        'result:user-blocked': {
          status: 423,
          data: errorSchema.extend({type: z.enum(["result:user-blocked"]).describe("A URI reference identifying the problem type")})
        }
      })
  },
  oidc: {
    byProvider: {
      post: oc
        .route({
          method: 'POST',
          path: '/v1/auth/oidc/{provider}',
          summary: 'Exchange an OIDC ID token for an internal JWT and refresh token',
          description: 'Authenticate with an OIDC ID token. The frontend completes the Authorization Code + PKCE flow against the provider; the backend verifies the resulting `id_token` against the provider\'s JWKS and issues an internal JWT + refresh token. The `{provider}` segment is the name configured under `oidc.providers` (or via `OIDC_PROVIDER_NAME`).',
          tags: ['Auth'],
          successStatus: 200,
          inputStructure: 'detailed'
        })
        .input(z.object({
          params: z.object({provider: z.string()}),
          body: authWithOidcRequestSchema
        }))
        .output(authenticatedResponseSchema)
        .errors({
          'result:invalid-token': {
            status: 401,
            data: errorSchema.extend({type: z.enum(["result:invalid-token"]).describe("A URI reference identifying the problem type")})
          },
          'result:unknown-provider': {
            status: 404,
            data: errorSchema.extend({type: z.enum(["result:unknown-provider"]).describe("A URI reference identifying the problem type")})
          }
        })
    }
  },
  refreshToken: {
    post: oc
      .route({
        method: 'POST',
        path: '/v1/auth/refresh-token',
        summary: 'Exchange refresh token for a new JWT and refresh token',
        description: 'Authenticate with a refresh token',
        tags: ['Auth'],
        successStatus: 200,
        inputStructure: 'detailed'
      })
      .input(z.object({
        body: authWithRefreshTokenRequestSchema
      }))
      .output(authenticatedResponseSchema)
      .errors({
        'result:invalid-token': {
          status: 401,
          data: errorSchema.extend({type: z.enum(["result:invalid-token"]).describe("A URI reference identifying the problem type")})
        }
      })
  },
  sessions: {
    delete: oc
      .route({
        method: 'DELETE',
        path: '/v1/auth/sessions',
        summary: 'Revoke all sessions for a given user agent',
        description: 'Revoke every session (refresh-token family) of the authenticated user whose live token carries the given user agent',
        tags: ['Auth'],
        successStatus: 204,
        inputStructure: 'detailed',
        spec: (current) => ({ ...current, security: [{ bearer: [] }] })
      })
      .input(z.object({
        query: z.object({"user-agent": z.string()})
      }))
      .output(z.void()),
    get: oc
      .route({
        method: 'GET',
        path: '/v1/auth/sessions',
        summary: 'Returns active sessions for the authenticated user',
        description: 'List active sessions. A session is a refresh-token family: one login and every rotation descended from it. `id` is the family id and stays stable across rotations; `createdAt` is the login time, `refreshedAt` the last rotation, `expiresAt` when the live token lapses if never refreshed.',
        tags: ['Auth'],
        successStatus: 200,
        inputStructure: 'detailed',
        spec: (current) => ({ ...current, security: [{ bearer: [] }] })
      })
      .output(z.array(sessionDtoSchema)),
    bySessionId: {
      delete: oc
        .route({
          method: 'DELETE',
          path: '/v1/auth/sessions/{sessionId}',
          summary: 'Revoke a session by its id',
          description: 'Revoke a specific session: the whole refresh-token family behind the given id, including any rotation that lands concurrently',
          tags: ['Auth'],
          successStatus: 204,
          inputStructure: 'detailed',
          spec: (current) => ({ ...current, security: [{ bearer: [] }] })
        })
        .input(z.object({
          params: z.object({sessionId: z.uuid()})
        }))
        .output(z.void())
    }
  }
};
