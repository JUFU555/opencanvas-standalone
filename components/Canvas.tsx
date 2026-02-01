'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, type Pixel } from '../lib/supabase'
import UserProfileComponent, { useUserProfile } from './UserProfile'

const CANVAS_SIZE = 1000
const PIXEL_SIZE = 1
const MAX_ENERGY = 20
const ENERGY_REGEN_MS = 2000

const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#8B4513', '#FFB6C1', '#98FB98', '#87CEEB', '#DDA0DD'
]

const MAX_RECENT_COLORS = 10

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixels, setPixels] = useState<Map<string, Pixel>>(new Map())
  const [energy, setEnergy] = useState(MAX_ENERGY)
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [customColor, setCustomColor] = useState('#000000')
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [zoom, setZoom] = useState(10) // Lower default zoom for mobile
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [didDrag, setDidDrag] = useState(false)
  const [touchStartTime, setTouchStartTime] = useState(0)
  const [touchStartPos, setTouchStartPos] = useState({ x: 0, y: 0 })
  const [isTwoFingerPan, setIsTwoFingerPan] = useState(false)
  const lastTouchDistance = useRef(0)
  const [showGrid, setShowGrid] = useState(true)
  const [paintedThisStroke, setPaintedThisStroke] = useState<Set<string>>(new Set())
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null)
  
  const userProfile = useUserProfile()
  
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy(prev => Math.min(prev + 1, MAX_ENERGY))
    }, ENERGY_REGEN_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadPixels()
    subscribeToPixels()
    loadRecentColors()
  }, [])

  const loadRecentColors = () => {
    try {
      const stored = localStorage.getItem('recentColors')
      if (stored) {
        setRecentColors(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load recent colors:', e)
    }
  }

  const addRecentColor = (color: string) => {
    // Skip if it's already in preset colors or already first in recent
    if (PRESET_COLORS.includes(color.toUpperCase()) || recentColors[0] === color) {
      return
    }

    setRecentColors(prev => {
      // Remove if already exists, then add to front
      const filtered = prev.filter(c => c !== color)
      const updated = [color, ...filtered].slice(0, MAX_RECENT_COLORS)
      
      // Save to localStorage
      try {
        localStorage.setItem('recentColors', JSON.stringify(updated))
      } catch (e) {
        console.error('Failed to save recent colors:', e)
      }
      
      return updated
    })
  }

  const loadPixels = async () => {
    const { data } = await supabase
      .from('pixels')
      .select(`
        *,
        user_profiles (
          username,
          country,
          twitter,
          instagram,
          tiktok,
          website
        )
      `)
      .limit(1000000)
    
    if (data) {
      const pixelMap = new Map<string, Pixel>()
      data.forEach((pixel: any) => {
        // Flatten user profile data
        const pixelData: Pixel = {
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          placed_at: pixel.placed_at,
          user_id: pixel.user_id,
          username: pixel.user_profiles?.username,
          user_country: pixel.user_profiles?.country,
          user_socials: pixel.user_profiles ? {
            twitter: pixel.user_profiles.twitter,
            instagram: pixel.user_profiles.instagram,
            tiktok: pixel.user_profiles.tiktok,
            website: pixel.user_profiles.website
          } : undefined
        }
        pixelMap.set(`${pixel.x},${pixel.y}`, pixelData)
      })
      setPixels(pixelMap)
    }
  }

  const subscribeToPixels = () => {
    const channel = supabase
      .channel('pixels-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'pixels' },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const pixel = payload.new as any
            
            // Fetch user profile data if user_id exists
            let pixelData: Pixel = {
              x: pixel.x,
              y: pixel.y,
              color: pixel.color,
              placed_at: pixel.placed_at,
              user_id: pixel.user_id
            }
            
            if (pixel.user_id) {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('username, country, twitter, instagram, tiktok, website')
                .eq('id', pixel.user_id)
                .single()
              
              if (profile) {
                pixelData.username = profile.username
                pixelData.user_country = profile.country
                pixelData.user_socials = {
                  twitter: profile.twitter,
                  instagram: profile.instagram,
                  tiktok: profile.tiktok,
                  website: profile.website
                }
              }
            }
            
            setPixels(prev => {
              const newMap = new Map(prev)
              newMap.set(`${pixel.x},${pixel.y}`, pixelData)
              return newMap
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // Render canvas (pixels only, no grid)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw pixels
    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color
      ctx.fillRect(pixel.x, pixel.y, PIXEL_SIZE, PIXEL_SIZE)
    })
  }, [pixels])

  // Calculate grid spacing and stroke based on zoom
  const getGridSpacing = () => {
    if (zoom < 5) return 100
    if (zoom < 10) return 10
    if (zoom < 20) return 5
    return 1
  }

  const getGridStrokeWidth = () => {
    // Stroke needs to be inverse of zoom to maintain constant visual thickness
    // At very high zoom, make it slightly thicker to stay visible
    const baseWidth = 1 / zoom
    return Math.max(baseWidth, 0.02) // Minimum 0.02 to stay visible
  }

  const getGridColor = () => {
    // Darker grid at higher zoom levels for better visibility
    if (zoom > 30) return '#999999'
    if (zoom > 20) return '#AAAAAA'
    if (zoom > 10) return '#BBBBBB'
    return '#CCCCCC'
  }

  const getPixelCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_SIZE / rect.width
    const scaleY = CANVAS_SIZE / rect.height
    const x = Math.floor((e.clientX - rect.left) * scaleX)
    const y = Math.floor((e.clientY - rect.top) * scaleY)

    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
      return { x, y }
    }
    return null
  }

  const paintPixel = async (x: number, y: number) => {
    const key = `${x},${y}`
    
    // Skip if already painted this stroke or no energy
    if (paintedThisStroke.has(key) || energy < 1) return
    
    // Add to recent colors when actually used (not just selected)
    addRecentColor(selectedColor)
    
    const pixelData: Pixel = {
      x,
      y,
      color: selectedColor,
      placed_at: new Date().toISOString(),
      user_id: userProfile?.id,
      username: userProfile?.username,
      user_country: userProfile?.country,
      user_socials: userProfile ? {
        twitter: userProfile.twitter,
        instagram: userProfile.instagram,
        tiktok: userProfile.tiktok,
        website: userProfile.website
      } : undefined
    }
    
    // Optimistic update
    setPixels(prev => {
      const newMap = new Map(prev)
      newMap.set(key, pixelData)
      return newMap
    })

    setPaintedThisStroke(prev => new Set(prev).add(key))
    setEnergy(prev => Math.max(0, prev - 1))

    // Save to database
    await supabase
      .from('pixels')
      .upsert({
        x,
        y,
        color: selectedColor,
        placed_at: new Date().toISOString(),
        user_id: userProfile?.id
      }, {
        onConflict: 'x,y'
      })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setDidDrag(false)
    
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      // Right click or Ctrl/Cmd+click = pan mode
      setIsPanning(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (e.altKey) {
      // Alt+click = inspect pixel (non-destructive)
      const coords = getPixelCoords(e)
      if (coords) {
        const key = `${coords.x},${coords.y}`
        const pixel = pixels.get(key)
        setSelectedPixel(pixel || null)
      }
    } else {
      // Left click = draw mode (starts drawing)
      setIsDrawing(true)
      setPaintedThisStroke(new Set())
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setDidDrag(true)
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isDrawing) {
      setDidDrag(true)
      const coords = getPixelCoords(e)
      if (coords) paintPixel(coords.x, coords.y)
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
    setIsDrawing(false)
    setPaintedThisStroke(new Set())
    setDidDrag(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(1, Math.min(50, prev * delta)))
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartTime(Date.now())
    const touch = e.touches[0]
    setTouchStartPos({ x: touch.clientX, y: touch.clientY })
    setDidDrag(false)
    
    if (e.touches.length === 2) {
      // Two-finger pan mode
      e.preventDefault()
      setIsTwoFingerPan(true)
      setIsPanning(true)
      setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y })
      
      // Calculate initial distance for pinch-to-zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      lastTouchDistance.current = distance
    } else if (e.touches.length === 1) {
      // Single finger paint mode
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0
      }) as any
      handleMouseDown(mouseEvent)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Two-finger pan and pinch-to-zoom
      e.preventDefault()
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      
      // Pan
      const midX = (touch1.clientX + touch2.clientX) / 2
      const midY = (touch1.clientY + touch2.clientY) / 2
      setPan({
        x: midX - dragStart.x,
        y: midY - dragStart.y
      })
      
      // Pinch-to-zoom
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      if (lastTouchDistance.current > 0) {
        const delta = distance / lastTouchDistance.current
        setZoom(prev => Math.max(1, Math.min(50, prev * delta)))
      }
      lastTouchDistance.current = distance
      setDidDrag(true)
    } else if (e.touches.length === 1 && !isTwoFingerPan) {
      // Single finger paint
      const touch = e.touches[0]
      const distance = Math.hypot(
        touch.clientX - touchStartPos.x,
        touch.clientY - touchStartPos.y
      )
      if (distance > 5) {
        setDidDrag(true)
      }
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      }) as any
      handleMouseMove(mouseEvent)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchDuration = Date.now() - touchStartTime
    
    // Reset two-finger pan mode
    if (e.touches.length < 2) {
      setIsTwoFingerPan(false)
      lastTouchDistance.current = 0
    }
    
    // Quick tap (< 300ms) without significant drag = inspect pixel
    if (touchDuration < 300 && !didDrag && e.changedTouches.length === 1 && !isTwoFingerPan) {
      const touch = e.changedTouches[0]
      const coords = getPixelCoords({ clientX: touch.clientX, clientY: touch.clientY } as any)
      if (coords) {
        const key = `${coords.x},${coords.y}`
        const pixel = pixels.get(key)
        if (pixel) {
          setSelectedPixel(pixel)
        }
      }
    }
    
    handleMouseUp()
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50">
      {/* Sidebar - Below canvas on mobile, left side on desktop */}
      <div className="w-full md:w-80 bg-white border-t md:border-r md:border-t-0 border-gray-200 p-4 md:p-6 overflow-y-auto max-h-[45vh] md:max-h-none order-2 md:order-1">
        <div className="space-y-4 md:space-y-6">
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold text-gray-900">OpenCanvas</h1>
            <p className="text-sm text-gray-600">Collaborative Pixel Art</p>
          </div>

          {/* User Profile */}
          <UserProfileComponent />

          {/* Energy */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800">Energy</span>
              <span className="text-lg font-bold text-gray-900">{energy}/{MAX_ENERGY}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(energy / MAX_ENERGY) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">+1 every 2 seconds</p>
          </div>

          {/* Color Palette */}
          <div>
            <label className="text-sm font-semibold text-gray-800 block mb-3">Color Palette</label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                    selectedColor === color 
                      ? 'border-blue-500 ring-2 ring-blue-200' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Recent Colors */}
            {recentColors.length > 0 && (
              <div className="mt-4">
                <label className="text-sm font-semibold text-gray-800 block mb-2">Recent Colors</label>
                <div className="grid grid-cols-5 gap-2">
                  {recentColors.map((color, idx) => (
                    <button
                      key={`${color}-${idx}`}
                      onClick={() => setSelectedColor(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        selectedColor === color 
                          ? 'border-blue-500 ring-2 ring-blue-200' 
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Custom Color */}
            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-800 block mb-2">Custom Color</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value)
                      setSelectedColor(e.target.value)
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div 
                    className="w-full h-12 rounded-lg border-2 border-gray-300 cursor-pointer"
                    style={{ backgroundColor: customColor }}
                  />
                </div>
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value)
                    setSelectedColor(e.target.value)
                  }}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-gray-900"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Current Color */}
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded border-2 border-gray-300"
                  style={{ backgroundColor: selectedColor }}
                />
                <div>
                  <p className="text-xs font-semibold text-gray-700">Selected</p>
                  <p className="text-sm font-mono font-medium text-gray-900">{selectedColor}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Zoom */}
          <div>
            <label className="text-sm font-semibold text-gray-800 block mb-2">
              Zoom: {Math.round(zoom * 10)}%
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setZoom(prev => Math.max(1, prev - 2))}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold flex-1 transition-colors"
              >
                −
              </button>
              <button
                onClick={() => setZoom(prev => Math.min(50, prev + 2))}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold flex-1 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
              showGrid 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            {showGrid ? '✓ Grid On' : 'Grid Off'}
          </button>

          {/* Pixel Inspector */}
          {selectedPixel && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border-2 border-purple-300">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-purple-900">🔍 Pixel Info</h3>
                <button
                  onClick={() => setSelectedPixel(null)}
                  className="text-gray-500 hover:text-gray-700 font-bold text-lg"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-8 h-8 rounded border-2 border-gray-300"
                    style={{ backgroundColor: selectedPixel.color }}
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Color</p>
                    <p className="text-sm font-mono font-bold text-gray-900">{selectedPixel.color}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs font-semibold text-gray-700">Position</p>
                  <p className="text-sm font-mono text-gray-900">({selectedPixel.x}, {selectedPixel.y})</p>
                </div>
                
                <div>
                  <p className="text-xs font-semibold text-gray-700">Placed</p>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedPixel.placed_at).toLocaleString()}
                  </p>
                </div>

                {selectedPixel.username && (
                  <div className="pt-2 border-t border-purple-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">👤 Artist</p>
                    <p className="text-sm font-bold text-gray-900">{selectedPixel.username}</p>
                    {selectedPixel.user_country && (
                      <p className="text-sm text-gray-700">📍 {selectedPixel.user_country}</p>
                    )}
                    {selectedPixel.user_socials && (
                      <div className="mt-2 space-y-1">
                        {selectedPixel.user_socials.twitter && (
                          <p className="text-xs text-gray-700">🐦 {selectedPixel.user_socials.twitter}</p>
                        )}
                        {selectedPixel.user_socials.instagram && (
                          <p className="text-xs text-gray-700">📷 {selectedPixel.user_socials.instagram}</p>
                        )}
                        {selectedPixel.user_socials.tiktok && (
                          <p className="text-xs text-gray-700">🎵 {selectedPixel.user_socials.tiktok}</p>
                        )}
                        {selectedPixel.user_socials.website && (
                          <p className="text-xs text-gray-700 break-all">🌐 {selectedPixel.user_socials.website}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="text-sm text-gray-800 space-y-1 bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="font-semibold text-blue-900">🎨 <span className="hidden md:inline">Click &</span> Drag to paint</p>
            <p className="text-gray-700 hidden md:block">🔍 Alt/Option + click to inspect pixel</p>
            <p className="text-gray-700 md:hidden">🔍 Quick tap to inspect pixel</p>
            <p className="text-gray-700 hidden md:block">🖱️ Right-click + drag to pan</p>
            <p className="text-gray-700 md:hidden">✌️ Two-finger drag to pan</p>
            <p className="text-gray-700">📏 <span className="hidden md:inline">Scroll</span><span className="md:hidden">Pinch</span> to zoom</p>
          </div>
        </div>
      </div>

      {/* Canvas - Top on mobile, right side on desktop */}
      <div 
        className="flex-1 overflow-hidden flex items-start justify-center bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 pt-4 md:pt-16 order-1 md:order-2"
        style={{ cursor: isPanning ? 'move' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative" style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
        }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="shadow-2xl"
            style={{
              imageRendering: 'pixelated',
              display: 'block'
            }}
          />
          {showGrid && (
            <svg
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            >
              <defs>
                <pattern
                  id="grid"
                  width={getGridSpacing()}
                  height={getGridSpacing()}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${getGridSpacing()} 0 L 0 0 0 ${getGridSpacing()}`}
                    fill="none"
                    stroke={getGridColor()}
                    strokeWidth={getGridStrokeWidth()}
                  />
                </pattern>
              </defs>
              <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="url(#grid)" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
