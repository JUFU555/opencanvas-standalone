'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, type Pixel } from '../lib/supabase'

const CANVAS_SIZE = 1000
const PIXEL_SIZE = 1
const MAX_ENERGY = 20
const ENERGY_REGEN_MS = 2000

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pixels, setPixels] = useState<Map<string, Pixel>>(new Map())
  const [energy, setEnergy] = useState(MAX_ENERGY)
  const [selectedColor, setSelectedColor] = useState('#FF0000')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pendingPixel, setPendingPixel] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(4)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  
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

    // White background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw grid
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 0.1
      for (let i = 0; i <= CANVAS_SIZE; i += 1) {
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

    // Draw all pixels
    pixels.forEach((pixel) => {
      ctx.fillStyle = pixel.color
      ctx.fillRect(pixel.x, pixel.y, PIXEL_SIZE, PIXEL_SIZE)
    })
  }, [pixels, showGrid, zoom])

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
    setZoom(prev => Math.max(1, Math.min(20, prev * delta)))
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
    <div className="relative w-full h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">OpenCanvas</h1>
            <p className="text-sm text-gray-500">Collaborative Pixel Art</p>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-6">
            {/* Zoom controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(prev => Math.max(1, prev - 1))}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
              >
                −
              </button>
              <span className="text-sm font-medium text-gray-700 w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(prev => Math.min(20, prev + 1))}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
              >
                +
              </button>
            </div>

            {/* Grid toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                showGrid ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Grid
            </button>

            {/* Energy bar */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-gray-500">Energy</div>
                <div className="text-sm font-bold text-gray-900">{energy}/{MAX_ENERGY}</div>
              </div>
              <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${(energy / MAX_ENERGY) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center cursor-move"
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
          className="border border-gray-300 shadow-lg cursor-crosshair"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            imageRendering: 'pixelated'
          }}
        />
      </div>

      {/* Color picker modal */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose Color</h3>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-full h-32 rounded cursor-pointer"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={placePixel}
                disabled={energy < 1}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Place Pixel ({energy})
              </button>
              <button
                onClick={() => {
                  setShowColorPicker(false)
                  setPendingPixel(null)
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-gray-200 text-sm">
        <p className="font-medium text-gray-900">🎨 Click to paint</p>
        <p className="text-gray-600">🖱️ Drag to pan • Scroll to zoom</p>
        <p className="text-gray-500 text-xs mt-1">Energy: +1 every 2 seconds</p>
      </div>
    </div>
  )
}
