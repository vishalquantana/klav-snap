import type { Shape } from './types'

export class Annotator {
  readonly shapes: Shape[] = []
  private canvas: HTMLCanvasElement
  private imageDataUrl: string

  constructor(canvas: HTMLCanvasElement, imageDataUrl: string) {
    this.canvas = canvas
    this.imageDataUrl = imageDataUrl
  }

  computeLineWidth(): number {
    return Math.max(3, this.canvas.width / 400)
  }

  computeFontSize(): number {
    return Math.max(16, this.canvas.width / 60)
  }

  addShape(shape: Shape): void {
    this.shapes.push(shape)
    this.redraw()
  }

  undo(): void {
    this.shapes.pop()
    this.redraw()
  }

  clearAll(): void {
    this.shapes.length = 0
    this.redraw()
  }

  redraw(): void {
    // Image may not be defined in non-browser environments (e.g., tests)
    if (typeof Image === 'undefined') return
    const ctx = this.canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      ctx.drawImage(img, 0, 0)
      this.shapes.forEach(s => this.drawShape(ctx, s))
    }
    img.src = this.imageDataUrl
  }

  private drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    ctx.strokeStyle = shape.color
    ctx.fillStyle = shape.color
    ctx.lineWidth = this.computeLineWidth()
    ctx.lineCap = 'round'

    if (shape.type === 'pen') {
      ctx.beginPath()
      shape.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      )
      ctx.stroke()
    } else if (shape.type === 'rect') {
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h)
    } else if (shape.type === 'arrow') {
      const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1)
      const headLen = Math.max(12, this.computeLineWidth() * 4)
      ctx.beginPath()
      ctx.moveTo(shape.x1, shape.y1)
      ctx.lineTo(shape.x2, shape.y2)
      ctx.lineTo(
        shape.x2 - headLen * Math.cos(angle - Math.PI / 6),
        shape.y2 - headLen * Math.sin(angle - Math.PI / 6),
      )
      ctx.moveTo(shape.x2, shape.y2)
      ctx.lineTo(
        shape.x2 - headLen * Math.cos(angle + Math.PI / 6),
        shape.y2 - headLen * Math.sin(angle + Math.PI / 6),
      )
      ctx.stroke()
    } else if (shape.type === 'circle') {
      ctx.beginPath()
      ctx.ellipse(shape.x, shape.y, Math.abs(shape.rx), Math.abs(shape.ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (shape.type === 'text') {
      ctx.font = `bold ${this.computeFontSize()}px sans-serif`
      ctx.fillText(shape.text, shape.x, shape.y)
    }
  }

  async save(): Promise<string> {
    const png = this.canvas.toDataURL('image/png')
    if (png.length > 5 * 1024 * 1024) {
      return this.canvas.toDataURL('image/jpeg', 0.85)
    }
    return png
  }
}
