'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { Building2, Loader2, Eye, EyeOff, ArrowLeft, Mail, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

type View = 'login' | 'forgot' | 'reset'

export default function LoginPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, loading, error } = useAuthStore()

  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSending, setForgotSending] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  // Reset password
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState('')

  // Check if there's a reset token in URL
  useEffect(() => {
    const token = searchParams.get('reset_token')
    if (token) {
      setResetToken(token)
      setView('reset')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
      router.push('/admin')
    } catch {}
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotSending(true)
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail })
      setForgotSent(true)
    } catch {
      setForgotSent(true) // Show success anyway to prevent email enumeration
    } finally {
      setForgotSending(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    if (newPassword.length < 6) { setResetError('La contraseña debe tener al menos 6 caracteres'); return }
    if (newPassword !== confirmPassword) { setResetError('Las contraseñas no coinciden'); return }
    setResetting(true)
    try {
      await api.post('/auth/reset-password', { token: resetToken, new_password: newPassword })
      setResetSuccess(true)
    } catch (err: any) {
      setResetError(err.response?.data?.error || 'Error al restablecer la contraseña')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">ConstruGest</h1>
          <p className="text-gray-500 mt-1">{t('appDescription')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">

          {/* ─── LOGIN VIEW ─── */}
          {view === 'login' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">{t('auth.login')}</h2>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('auth.email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    placeholder="tu@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full px-4 py-2.5 pr-11 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setView('forgot'); setForgotEmail(email); setForgotSent(false) }}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('auth.login')}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-500">
                {t('auth.noAccount')}{' '}
                <Link href="/register" className="text-blue-600 hover:underline font-medium">
                  {t('auth.register')}
                </Link>
              </div>

            </>
          )}

          {/* ─── FORGOT PASSWORD VIEW ─── */}
          {view === 'forgot' && (
            <>
              <button
                onClick={() => setView('login')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al login
              </button>

              <h2 className="text-xl font-semibold text-gray-900 mb-2">Recuperar contraseña</h2>
              <p className="text-sm text-gray-500 mb-6">Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>

              {forgotSent ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-sm text-gray-700 font-medium">Correo enviado</p>
                  <p className="text-sm text-gray-500 mt-1">Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.</p>
                  <button
                    onClick={() => setView('login')}
                    className="mt-4 text-sm text-blue-600 hover:underline font-medium"
                  >
                    Volver al login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="tu@email.com"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotSending}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {forgotSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Enviar enlace de recuperación
                  </button>
                </form>
              )}
            </>
          )}

          {/* ─── RESET PASSWORD VIEW ─── */}
          {view === 'reset' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Nueva contraseña</h2>
              <p className="text-sm text-gray-500 mb-6">Introduce tu nueva contraseña.</p>

              {resetError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  {resetError}
                </div>
              )}

              {resetSuccess ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <Lock className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-sm text-gray-700 font-medium">Contraseña restablecida</p>
                  <p className="text-sm text-gray-500 mt-1">Ya puedes iniciar sesión con tu nueva contraseña.</p>
                  <button
                    onClick={() => { setView('login'); setResetToken(''); router.replace('/login') }}
                    className="mt-4 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition text-sm"
                  >
                    Iniciar sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Mínimo 6 caracteres"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Repite la nueva contraseña"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetting}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Restablecer contraseña
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
