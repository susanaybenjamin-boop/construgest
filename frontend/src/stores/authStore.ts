import { create } from 'zustand'
import api from '@/lib/api'
import { getToken, setToken, clearToken } from '@/lib/tokenStorage'
import { closeRealtime } from '@/lib/realtimeClient'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  organizationId: string | null
  token: string | null
  loading: boolean
  error: string | null
  isSuperAdmin: boolean

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organizationId: null,
  token: getToken(),
  loading: false,
  error: null,
  isSuperAdmin: false,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setToken(data.token)
      set({
        user: data.user,
        token: data.token,
        organizationId: data.organization_id,
        isSuperAdmin: data.is_super_admin || false,
        loading: false,
      })
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Error al iniciar sesión',
        loading: false,
      })
      throw err
    }
  },

  register: async (email, password, fullName) => {
    set({ loading: true, error: null })
    try {
      const { data } = await api.post('/auth/register', {
        email,
        password,
        full_name: fullName,
      })
      setToken(data.token)
      set({
        user: data.user,
        token: data.token,
        organizationId: data.organization_id,
        loading: false,
      })
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Error al registrarse',
        loading: false,
      })
      throw err
    }
  },

  clearError: () => set({ error: null }),

  logout: () => {
    clearToken()
    closeRealtime()
    set({ user: null, token: null, organizationId: null })
    window.location.href = '/login'
  },

  checkAuth: async () => {
    const token = getToken()
    if (!token) {
      set({ user: null, token: null })
      return
    }

    try {
      const { data } = await api.get('/auth/me')
      set({
        user: data.user,
        organizationId: data.organization_id,
        isSuperAdmin: data.is_super_admin || false,
        token,
        error: null,
      })
    } catch (err: any) {
      // Solo se destruye la sesión si el servidor dice que el token no vale (401).
      // Antes, CUALQUIER error (backend reiniciándose, 500, red) borraba el token
      // y echaba al usuario a /login justo después de haber entrado bien.
      if (err?.response?.status === 401) {
        clearToken()
        set({ user: null, token: null })
        return
      }
      // Fallo transitorio: se conserva la sesión y se reintenta una vez.
      try {
        await new Promise((r) => setTimeout(r, 2000))
        const { data } = await api.get('/auth/me')
        set({
          user: data.user,
          organizationId: data.organization_id,
          isSuperAdmin: data.is_super_admin || false,
          token,
          error: null,
        })
      } catch (err2: any) {
        if (err2?.response?.status === 401) {
          clearToken()
          set({ user: null, token: null })
        } else {
          set({ error: 'No se puede conectar con el servidor' })
        }
      }
    }
  },
}))
