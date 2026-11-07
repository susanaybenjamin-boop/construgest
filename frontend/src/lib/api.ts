import axios from 'axios'
import { getToken, setToken, clearToken } from './tokenStorage'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: sliding token renewal + handle 401
api.interceptors.response.use(
  (response) => {
    // Sliding expiration: update token if the server renewed it
    const renewedToken = response.headers['x-renewed-token']
    if (renewedToken) {
      setToken(renewedToken)
    }
    return response
  },
  (error) => {
    const url: string = error.config?.url || ''
    // Un 401 de las rutas de /auth/ NO es "sesión caducada": es la respuesta
    // normal a una credencial incorrecta. Recargar /login aquí BORRABA el
    // mensaje de error antes de que se viera, y con PIN la recarga devolvía a la
    // pantalla del PIN → parecía que la app no hacía nada (bug del 2026-11-07).
    // Esos 401 los muestra quien hizo la llamada (authStore / PinGate).
    const isAuthCall = url.startsWith('/auth/')

    if (error.response?.status === 401 && !isAuthCall) {
      clearToken()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
