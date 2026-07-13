import axios from 'axios'
import { getToken } from './tokenStorage'

const LOCAL_API_URL = 'http://localhost:5000/api'

const localApi = axios.create({
  baseURL: LOCAL_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 5000,
})

// Attach JWT token (same as cloud api)
localApi.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Check if local backend is available (cached with TTL)
let _localAvailable: boolean | null = null
let _lastCheck = 0
const CHECK_INTERVAL = 30000 // Re-check every 30 seconds

export async function isLocalBackendAvailable(): Promise<boolean> {
  const now = Date.now()
  if (_localAvailable !== null && now - _lastCheck < CHECK_INTERVAL) return _localAvailable

  try {
    await axios.get(`${LOCAL_API_URL}/health`, { timeout: 2000 })
    _localAvailable = true
  } catch {
    _localAvailable = false
  }
  _lastCheck = now
  return _localAvailable
}

export function resetLocalBackendCache() {
  _localAvailable = null
  _lastCheck = 0
}

export default localApi
