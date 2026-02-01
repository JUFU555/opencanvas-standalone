'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase, type Pixel } from '../lib/supabase'

const CANVAS_SIZE = 1000
const PIXEL_SIZE = 1
const MAX_ENERGY = 20
const ENERGY_REGEN_MS = 2000

const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#8B4513', '#FFB6C1', '#98FB98', '#87CEEB', '#DDA0DD'
]

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixels, setPixels] = useState<Map<string, Pixel>>(new Map())
  const [energy, setEnergy] = useState(MAX_ENERGY)
  const [selectedColor, setSelectedColor] = useState('#000000')
  const [customColor, setCustomColor] = useState('#000000')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pendingPixel, setPendingPixel] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(20)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setEnergy(prev => Math.min(prev + 1, MAX_ENERGY))
    }, ENERGY_REGEN_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadPixels()
    subscribeToPixels()
  }, [])

  const loadPixels = async () => {
    const { data } = await supabase
      .from('pixels')
      .select('*')
      .limit(1000000)
    
    if (data) {
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

  // Render canvas with proper grid alignment
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // White background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw grid - ALIGNED to pixel boundaries with VISIBLE lines
    if (showGrid) {
      // Fine grid - every pixel
      ctx.strokeStyle = '#DDDDDD'
      ctx.lineWidth = 0.5  // Thicker so it's actually visible
      
      for (let i = 0; i <= CANVAS_SIZE; i++) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, CANVAS_SIZE)
        ctx.stroke()
        
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(CANVAS_SIZE, i)
        ctx.stroke()
      }
      
      // Thicker lines every 10 pixels for reference
      ctx.strokeStyle = '#AAAAAA'
      ctx.lineWidth = 1.5
      for (let i = 0; i <= CANVAS_SIZE; i += 10) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, CANVAS_SIZE)
        ctx.stroke()
        
        ctx.beginPath()
        ctx.moveTo(0, i)
        ctx.lineTo(CANVAS_SIZE, i)
        ctx.stroke()
      }
    }

    // Draw pixels
    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color
      ctx.fillRect(pixel.x, pixel.y, PIXEL_SIZE, PIXEL_SIZE)
    })
  }, [pixels, showGrid])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_SIZE / rect.width
    const scaleY = CANVAS_SIZE / rect.height
    const x = Math.floor((e.clientX - rect.left) * scaleX)
    const y = Math.floor((e.clientY - rect.top) * scaleY)

    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
      setPendingPixel({ x, y })
      setShowColorPicker(true)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(1, Math.min(50, prev * delta)))
  }

  const placePixel = async () => {
    if (!pendingPixel || energy < 1) return

    const { x, y } = pendingPixel
    
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

    setEnergy(prev => Math.max(0, prev - 1))

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
    <div className="flex flex-col md:flex-row h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-white border-b md:border-r border-gray-200 p-6 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">OpenCanvas</h1>
            <p className="text-sm text-gray-500">Collaborative Pixel Art</p>
          </div>

          {/* Energy */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Energy</span>
              <span className="text-lg font-bold text-gray-900">{energy}/{MAX_ENERGY}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${(energy / MAX_ENERGY) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">+1 every 2 seconds</p>
          </div>

          {/* Color Palette */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-3">Color Palette</label>
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
            
            {/* Custom Color */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Custom Color</label>
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
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Current Color */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div 
                  className="w-8 h-8 rounded border-2 border-gray-300"
                  style={{ backgroundColor: selectedColor }}
                />
                <div>
                  <p className="text-xs text-gray-500">Selected</p>
                  <p className="text-sm font-mono font-medium">{selectedColor}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Zoom */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Zoom: {Math.round(zoom * 10)}%
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setZoom(prev => Math.max(1, prev - 2))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex-1 transition-colors"
              >
                −
              </button>
              <button
                onClick={() => setZoom(prev => Math.min(50, prev + 2))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium flex-1 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
              showGrid 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showGrid ? '✓ Grid On' : 'Grid Off'}
          </button>

          {/* Instructions */}
          <div className="text-sm text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
            <p>🎨 Click pixel to paint</p>
            <p>🖱️ Drag to pan</p>
            <p>🔍 Scroll to zoom</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div 
        className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleCanvasClick}
          className="shadow-2xl cursor-crosshair"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            imageRendering: 'pixelated'
          }}
        />
      </div>

      {/* Simplified modal - just confirm */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Place Pixel?</h3>
            <div className="mb-4">
              <div 
                className="w-full h-24 rounded-xl border-4 border-gray-200"
                style={{ backgroundColor: selectedColor }}
              />
              <p className="text-center mt-2 font-mono text-sm text-gray-600">{selectedColor}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={placePixel}
                disabled={energy < 1}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Place ({energy})
              </button>
              <button
                onClick={() => {
                  setShowColorPicker(false)
                  setPendingPixel(null)
                }}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
