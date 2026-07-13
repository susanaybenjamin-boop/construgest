import { create } from 'zustand'
import api from '@/lib/api'
import type { ProjectExpense } from '@/types'

interface ExpenseState {
  expenses: ProjectExpense[]
  loading: boolean
  error: string | null

  loadExpenses: (projectId: string) => Promise<void>
  createExpense: (projectId: string, data: Partial<ProjectExpense>) => Promise<void>
  updateExpense: (id: string, data: Partial<ProjectExpense>) => Promise<void>
  deleteExpense: (projectId: string, id: string) => Promise<void>
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loading: false,
  error: null,

  loadExpenses: async (projectId) => {
    set({ loading: true })
    try {
      const { data } = await api.get<ProjectExpense[]>(`/expenses/project/${projectId}`)
      set({ expenses: data, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  createExpense: async (projectId, expenseData) => {
    const { data } = await api.post<ProjectExpense>(`/expenses/project/${projectId}`, expenseData)
    set((s) => ({ expenses: [data, ...s.expenses] }))
  },

  updateExpense: async (id, expenseData) => {
    const { data } = await api.put<ProjectExpense>(`/expenses/${id}`, expenseData)
    set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? data : e)) }))
  },

  deleteExpense: async (projectId, id) => {
    await api.delete(`/expenses/${id}`)
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }))
  },
}))
