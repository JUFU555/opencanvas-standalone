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
  const [zoom, setZoom] = useState(20)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  const [paintedThisStroke, setPaintedThisStroke] = useState<Set<string>>(new Set())
  
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

  // Render with THICK visible grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Visible grid - thin lines that don't obscure pixels
    if (showGrid) {
      // 1x1 pixel grid - thin gray lines
      ctx.strokeStyle = '#E0E0E0'
      ctx.lineWidth = 0.15
      
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
      
      // Slightly thicker every 10 pixels for reference
      ctx.strokeStyle = '#BBBBBB'
      ctx.lineWidth = 0.4
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
    
    // Optimistic update
    setPixels(prev => {
      const newMap = new Map(prev)
      newMap.set(key, {
        x,
        y,
        color: selectedColor,
        placed_at: new Date().toISOString()
      })
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
        placed_at: new Date().toISOString()
      }, {
        onConflict: 'x,y'
      })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      // Right click or Ctrl/Cmd+click = pan mode
      setIsPanning(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else {
      // Left click = draw mode
      setIsDrawing(true)
      setPaintedThisStroke(new Set())
      const coords = getPixelCoords(e)
      if (coords) paintPixel(coords.x, coords.y)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isDrawing) {
      const coords = getPixelCoords(e)
      if (coords) paintPixel(coords.x, coords.y)
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
    setIsDrawing(false)
    setPaintedThisStroke(new Set())
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(1, Math.min(50, prev * delta)))
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-white border-b md:border-r border-gray-200 p-6 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">OpenCanvas</h1>
            <p className="text-sm text-gray-600">Collaborative Pixel Art</p>
          </div>

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

          {/* Instructions */}
          <div className="text-sm text-gray-800 space-y-1 bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="font-semibold text-blue-900">🎨 Click & drag to paint</p>
            <p className="text-gray-700">🖱️ Right-click + drag to pan</p>
            <p className="text-gray-700">🔍 Scroll to zoom</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div 
        className="flex-1 overflow-hidden flex items-center justify-center bg-white"
        style={{ cursor: isPanning ? 'move' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="shadow-2xl"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            imageRendering: 'pixelated'
          }}
        />
      </div>
    </div>
  )
}
