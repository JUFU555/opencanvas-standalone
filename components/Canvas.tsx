'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, type Pixel } from '../lib/supabase'

const CANVAS_SIZE = 1000
const PIXEL_SIZE = 1
const MAX_ENERGY = 20
const ENERGY_REGEN_MS = 2000 // 2 seconds per energy point

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixels, setPixels] = useState<Map<string, Pixel>>(new Map())
  const [energy, setEnergy] = useState(MAX_ENERGY)
  const [selectedColor, setSelectedColor] = useState('#FF0000')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pendingPixel, setPendingPixel] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  
  // Energy regeneration
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy(prev => Math.min(prev + 1, MAX_ENERGY))
    }, ENERGY_REGEN_MS)
    
    return () => clearInterval(interval)
  }, [])

  // Load initial pixels
  useEffect(() => {
    loadPixels()
    subscribeToPixels()
  }, [])

  const loadPixels = async () => {
    const { data, error } = await supabase
      .from('pixels')
      .select('*')
      .limit(1000000)
    
    if (data && !error) {
      const pixelMap = new Map<string, Pixel>()
      data.forEach((pixel: Pixel) => {
        pixelMap.set(`${pixel.x},${pixel.y}`, pixel)
      })
      setPixels(pixelMap)
    }
  }

  const subscribeToPixels = () => {
    const channel = supabase
      .channel('pixels-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'pixels' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const pixel = payload.new as Pixel
            setPixels(prev => {
              const newMap = new Map(prev)
              newMap.set(`${pixel.x},${pixel.y}`, pixel)
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

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw all pixels
    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color
      ctx.fillRect(pixel.x, pixel.y, PIXEL_SIZE, PIXEL_SIZE)
    })
  }, [pixels])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / zoom)
    const y = Math.floor((e.clientY - rect.top) / zoom)

    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
      setPendingPixel({ x, y })
      setShowColorPicker(true)
    }
  }

  const placePixel = async () => {
    if (!pendingPixel || energy < 1) return

    const { x, y } = pendingPixel
    
    // Optimistic update
    setPixels(prev => {
      const newMap = new Map(prev)
      newMap.set(`${x},${y}`, {
        x,
        y,
        color: selectedColor,
        placed_at: new Date().toISOString()
      })
      return newMap
    })

    // Decrease energy
    setEnergy(prev => Math.max(0, prev - 1))

    // Save to database
    await supabase
      .from('pixels')
      .upsert({
        x,
        y,
        color: selectedColor,
        placed_at: new Date().toISOString()
      }, {
        onConflict: 'x,y'
      })

    setPendingPixel(null)
    setShowColorPicker(false)
  }

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      {/* Header with energy bar */}
      <div className="bg-gray-900 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">OpenCanvas</h1>
          
          {/* Energy bar */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm text-gray-400">Energy</span>
              <span className="text-lg font-bold text-white">{energy}/{MAX_ENERGY}</span>
            </div>
            <div className="w-64 h-8 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(energy / MAX_ENERGY) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Canvas container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleCanvasClick}
          className="border border-gray-700 cursor-crosshair"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            imageRendering: 'pixelated'
          }}
        />
      </div>

      {/* Color picker modal */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
            <h3 className="text-white text-lg mb-4">Choose Color</h3>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-64 h-32 cursor-pointer"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={placePixel}
                disabled={energy < 1}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                Place ({energy} energy)
              </button>
              <button
                onClick={() => {
                  setShowColorPicker(false)
                  setPendingPixel(null)
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info text */}
      <div className="absolute bottom-4 left-4 bg-gray-900/90 p-4 rounded border border-gray-700 text-white text-sm">
        <p>Click any pixel to paint</p>
        <p className="text-gray-400">Energy regenerates 1 point every 2 seconds</p>
      </div>
    </div>
  )
}
