const defaultApiBase = import.meta.env.DEV
  ? `http://${window.location.hostname}:4000/api`
  : 'http://localhost:4000/api'
const apiBase = import.meta.env.VITE_API_URL ?? defaultApiBase

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new ApiError(body?.message ?? 'The request could not be completed', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include' })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new ApiError(body?.message ?? 'The report could not be downloaded', response.status)
  }

  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}