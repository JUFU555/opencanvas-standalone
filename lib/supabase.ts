import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Pixel = {
  x: number
  y: number
  color: string
  placed_at: string
  user_id?: string
  username?: string
  user_country?: string
  user_socials?: {
    twitter?: string
    instagram?: string
    tiktok?: string
    website?: string
  }
}

export type UserProfile = {
  id: string
  username: string
  country?: string
  twitter?: string
  instagram?: string
  tiktok?: string
  website?: string
  created_at: string
  updated_at: string
}
