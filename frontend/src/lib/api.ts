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
    if (error.response?.status === 401) {
      clearToken()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
