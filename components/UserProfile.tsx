'use client'

import { useEffect, useState } from 'react'
import { supabase, type UserProfile } from '../lib/supabase'

export default function UserProfileComponent() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [country, setCountry] = useState('')
  const [twitter, setTwitter] = useState('')
  const [instagram, setInstagram] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = () => {
    const stored = localStorage.getItem('user_profile')
    if (stored) {
      const parsed = JSON.parse(stored)
      setProfile(parsed)
      setUsername(parsed.username || '')
      setCountry(parsed.country || '')
      setTwitter(parsed.twitter || '')
      setInstagram(parsed.instagram || '')
      setTiktok(parsed.tiktok || '')
      setWebsite(parsed.website || '')
    }
  }

  const handleSave = async () => {
    if (!username.trim()) {
      setError('Username is required')
      return
    }

    setError('')

    try {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('username', username.trim())
        .single()

      let savedProfile: UserProfile

      if (existing && existing.id !== profile?.id) {
        setError('Username already taken')
        return
      }

      if (profile?.id) {
        // Update existing profile
        const { data, error: updateError } = await supabase
          .from('user_profiles')
          .update({
            username: username.trim(),
            country: country.trim() || null,
            twitter: twitter.trim() || null,
            instagram: instagram.trim() || null,
            tiktok: tiktok.trim() || null,
            website: website.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)
          .select()
          .single()

        if (updateError) throw updateError
        savedProfile = data
      } else {
        // Create new profile
        const { data, error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            username: username.trim(),
            country: country.trim() || null,
            twitter: twitter.trim() || null,
            instagram: instagram.trim() || null,
            tiktok: tiktok.trim() || null,
            website: website.trim() || null
          })
          .select()
          .single()

        if (insertError) throw insertError
        savedProfile = data
      }

      // Save to localStorage
      localStorage.setItem('user_profile', JSON.stringify(savedProfile))
      setProfile(savedProfile)
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save profile')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('user_profile')
    setProfile(null)
    setUsername('')
    setCountry('')
    setTwitter('')
    setInstagram('')
    setTiktok('')
    setWebsite('')
    setIsEditing(false)
  }

  if (!profile && !isEditing) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-300">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-green-900">👤 Artist Profile</h3>
        </div>
        <p className="text-sm text-gray-700 mb-3">
          Create a profile to claim your pixels!
        </p>
        <button
          onClick={() => setIsEditing(true)}
          className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
        >
          Create Profile
        </button>
      </div>
    )
  }

  if (isEditing || !profile) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-300">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-green-900">
            {profile ? '✏️ Edit Profile' : '👤 Create Profile'}
          </h3>
          {profile && (
            <button
              onClick={() => setIsEditing(false)}
              className="text-gray-500 hover:text-gray-700 font-bold text-lg"
            >
              ✕
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Username *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Country
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., USA, Brazil, Japan"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Twitter/X
            </label>
            <input
              type="text"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Instagram
            </label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              TikTok
            </label>
            <input
              type="text"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              placeholder="@username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Website
            </label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
          >
            {profile ? 'Save Changes' : 'Create Profile'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 p-4 rounded-lg border-2 border-green-300">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-green-900">👤 {profile.username}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="text-gray-600 hover:text-gray-800 text-sm"
          >
            ✏️
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-600 hover:text-gray-800 text-sm"
          >
            🚪
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        {profile.country && (
          <p className="text-gray-700">
            <span className="font-semibold">📍</span> {profile.country}
          </p>
        )}
        {profile.twitter && (
          <p className="text-gray-700">
            <span className="font-semibold">🐦</span> {profile.twitter}
          </p>
        )}
        {profile.instagram && (
          <p className="text-gray-700">
            <span className="font-semibold">📷</span> {profile.instagram}
          </p>
        )}
        {profile.tiktok && (
          <p className="text-gray-700">
            <span className="font-semibold">🎵</span> {profile.tiktok}
          </p>
        )}
        {profile.website && (
          <p className="text-gray-700">
            <span className="font-semibold">🌐</span> {profile.website}
          </p>
        )}
      </div>
    </div>
  )
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('user_profile')
    if (stored) {
      setProfile(JSON.parse(stored))
    }

    // Listen for storage changes
    const handleStorage = () => {
      const updated = localStorage.getItem('user_profile')
      setProfile(updated ? JSON.parse(updated) : null)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return profile
}
