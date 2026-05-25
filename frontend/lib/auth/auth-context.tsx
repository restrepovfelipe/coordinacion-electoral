'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  getIdToken,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useQueryClient } from '@tanstack/react-query'

type AuthContextType = {
  user: User | null
  role: string | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const token = await getIdToken(u)
          const res = await fetch(
            `${process.env['NEXT_PUBLIC_API_BASE'] ?? ''}/auth/me`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
          if (!res.ok) {
            setRole(null)
          } else {
            const data = await res.json() as { role?: string }
            setRole(data.role ?? null)
          }
        } catch {
          setRole(null)
        }
      } else {
        setRole(null)
      }
      setLoading(false)
    })
  }, [])

  async function signIn(username: string, password: string) {
    await signInWithEmailAndPassword(auth, `${username}@defensores.local`, password)
  }

  async function signOut() {
    setRole(null)
    await fetch('/api/auth/session', { method: 'DELETE' })
    await firebaseSignOut(auth)
    queryClient.clear()
  }

  return <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
