import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../src/app.js'

describe('CORS origins', () => {
  let server: ReturnType<typeof app.listen>
  let baseUrl = ''

  beforeAll(async () => {
    server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind a TCP port')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  })

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173'])(
    'allows the local frontend origin %s',
    async (origin) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
          Connection: 'close',
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    },
  )

  it('does not allow unrelated frontend origins', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
        Connection: 'close',
      },
    })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects malformed JSON request bodies with a client error', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: '{',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: 'Invalid JSON request body' })
  })
})
