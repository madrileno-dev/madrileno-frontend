import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Logout is fire-and-forget; answer it like the backend so tests that log out stay quiet.
export const server = setupServer(
  http.post('*/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
)
