import { create } from 'zustand'
import api from '@/lib/api'

export interface PdfStyleSettings {
  pdf_color_primary: string
  pdf_color_accent: string
  pdf_color_dark: string
  pdf_color_text: string
  pdf_color_muted: string
  pdf_color_row_alt: string
  pdf_header_shadow: boolean
  pdf_row_striping: boolean
  pdf_logo_width: number
  pdf_logo_align: string
  pdf_font_family: string
  pdf_title_size: number
  pdf_subtitle_size: number
  pdf_table_header_size: number
  pdf_body_size: number
  pdf_top_bar_height: number
}

export const PDF_STYLES_DEFAULTS: PdfStyleSettings = {
  pdf_color_primary: '#1e40af',
  pdf_color_accent: '#3b82f6',
  pdf_color_dark: '#0f172a',
  pdf_color_text: '#1e293b',
  pdf_color_muted: '#64748b',
  pdf_color_row_alt: '#f1f5f9',
  pdf_header_shadow: true,
  pdf_row_striping: true,
  pdf_logo_width: 140,
  pdf_logo_align: 'left',
  pdf_font_family: 'Roboto',
  pdf_title_size: 36,
  pdf_subtitle_size: 18,
  pdf_table_header_size: 9,
  pdf_body_size: 9,
  pdf_top_bar_height: 8,
}

interface SettingsState {
  // Company settings
  company: {
    company_name: string
    company_cif: string
    company_address: string
    company_city: string
    company_province: string
    company_postal_code: string
    company_phone: string
    company_email: string
    company_web: string
    company_iban: string
    company_professional_number: string
    company_logo_url: string
  }
  // Default values
  defaults: {
    tax_rate: number
    overhead_pct: number
    profit_pct: number
    currency: string
    default_folder_path: string
  }
  // AI config
  ai: {
    anthropic_enabled: boolean
    groq_enabled: boolean
    gemini_enabled: boolean
    default_provider: string
    anthropic_api_key: string
    groq_api_key: string
    gemini_api_key: string
  }
  // Appearance
  appearance: {
    theme: string
    language: string
  }
  // Print settings
  print: {
    default_format: string
    default_orientation: string
    default_margin_top: number
    default_margin_bottom: number
    default_margin_left: number
    default_margin_right: number
  }
  // PDF styles
  pdf_styles: PdfStyleSettings
  loading: boolean
  dirty: boolean
}

interface SettingsActions {
  loadSettings: (orgId: string) => Promise<void>
  updateCompany: (key: string, value: string) => void
  updateDefaults: (key: string, value: number | string) => void
  updateAI: (key: string, value: boolean | string) => void
  updateAppearance: (key: string, value: string) => void
  updatePrint: (key: string, value: string | number) => void
  updatePdfStyles: (key: string, value: string | number | boolean) => void
  saveSettings: (orgId: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set, get) => ({
  company: {
    company_name: '',
    company_cif: '',
    company_address: '',
    company_city: '',
    company_province: '',
    company_postal_code: '',
    company_phone: '',
    company_email: '',
    company_web: '',
    company_iban: '',
    company_professional_number: '',
    company_logo_url: '',
  },
  defaults: {
    tax_rate: 21,
    overhead_pct: 13,
    profit_pct: 6,
    currency: 'EUR',
    default_folder_path: '',
  },
  ai: {
    anthropic_enabled: true,
    groq_enabled: true,
    gemini_enabled: true,
    default_provider: 'anthropic',
    anthropic_api_key: '',
    groq_api_key: '',
    gemini_api_key: '',
  },
  appearance: {
    theme: 'light',
    language: 'es',
  },
  print: {
    default_format: 'A4',
    default_orientation: 'portrait',
    default_margin_top: 15,
    default_margin_bottom: 15,
    default_margin_left: 15,
    default_margin_right: 15,
  },
  pdf_styles: { ...PDF_STYLES_DEFAULTS },
  loading: false,
  dirty: false,

  loadSettings: async (orgId: string) => {
    set({ loading: true })
    try {
      const { data } = await api.get(`/settings/organization/${orgId}`)
      if (data) {
        set({
          company: { ...get().company, ...data.company },
          defaults: { ...get().defaults, ...data.defaults },
          ai: { ...get().ai, ...data.ai },
          appearance: { ...get().appearance, ...data.appearance },
          print: { ...get().print, ...data.print },
          pdf_styles: { ...PDF_STYLES_DEFAULTS, ...data.pdf_styles },
        })
      }
    } catch {
      // Settings may not exist yet, use defaults
    } finally {
      set({ loading: false, dirty: false })
    }
  },

  updateCompany: (key, value) => {
    set((s) => ({ company: { ...s.company, [key]: value }, dirty: true }))
  },

  updateDefaults: (key, value) => {
    set((s) => ({ defaults: { ...s.defaults, [key]: value }, dirty: true }))
  },

  updateAI: (key, value) => {
    set((s) => ({ ai: { ...s.ai, [key]: value }, dirty: true }))
  },

  updateAppearance: (key, value) => {
    set((s) => ({ appearance: { ...s.appearance, [key]: value }, dirty: true }))
  },

  updatePrint: (key, value) => {
    set((s) => ({ print: { ...s.print, [key]: value }, dirty: true }))
  },

  updatePdfStyles: (key, value) => {
    set((s) => ({ pdf_styles: { ...s.pdf_styles, [key]: value }, dirty: true }))
  },

  saveSettings: async (orgId: string) => {
    set({ loading: true })
    try {
      const { company, defaults, ai, appearance, print, pdf_styles } = get()
      await api.put(`/settings/organization/${orgId}`, {
        company, defaults, ai, appearance, print, pdf_styles,
      })
      set({ dirty: false })
    } catch {
      // Handle error
    } finally {
      set({ loading: false })
    }
  },
}))
