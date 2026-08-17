// radar-chart.js - 原生 Canvas 雷达图组件
// 用法：<radar-chart dimensions="{{[{name:'知识掌握',score:85},...]}}" max="{{100}}" />
Component({
  properties: {
    // 维度数据：[{ name: '维度名', score: 数值 }]
    dimensions: {
      type: Array,
      value: []
    },
    // 满分值（默认 100）
    max: {
      type: Number,
      value: 100
    }
  },
  data: {},
  lifetimes: {
    ready() {
      // 组件就绪后标记可绘制
      this._canvasReady = true
      this.drawChart()
    }
  },
  observers: {
    // 数据变化时重绘
    'dimensions, max': function () {
      this.drawChart()
    }
  },
  methods: {
    // 绘制雷达图
    drawChart() {
      const dims = this.data.dimensions || []
      // 数据不足或画布未就绪时不绘制
      if (!dims.length || !this._canvasReady) return
      const max = Number(this.data.max) || 100

      this.createSelectorQuery()
        .select('#radarCanvas')
        .fields({ node: true, size: true })
        .exec(res => {
          if (!res || !res[0] || !res[0].node) return
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const width = res[0].width
          const height = res[0].height
          // 按设备像素比缩放，保证高清屏清晰
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          canvas.width = width * dpr
          canvas.height = height * dpr
          ctx.scale(dpr, dpr)
          ctx.clearRect(0, 0, width, height)

          const n = dims.length
          const cx = width / 2
          const cy = height / 2
          // 半径留出标签空间
          const r = Math.min(width, height) / 2 - 46
          const angleStep = (Math.PI * 2) / n
          const startAngle = -Math.PI / 2

          // 1. 绘制网格（4 层同心多边形）
          for (let ring = 1; ring <= 4; ring++) {
            ctx.beginPath()
            for (let i = 0; i < n; i++) {
              const angle = startAngle + i * angleStep
              const x = cx + Math.cos(angle) * r * ring / 4
              const y = cy + Math.sin(angle) * r * ring / 4
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.closePath()
            ctx.strokeStyle = '#E5EAF3'
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // 2. 绘制轴线
          for (let i = 0; i < n; i++) {
            const angle = startAngle + i * angleStep
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
            ctx.stroke()
          }

          // 3. 绘制数据多边形（半透明填充 + 描边）
          ctx.beginPath()
          dims.forEach((d, i) => {
            const score = Math.min(Math.max(Number(d.score) || 0, 0), max)
            const angle = startAngle + i * angleStep
            const x = cx + Math.cos(angle) * r * score / max
            const y = cy + Math.sin(angle) * r * score / max
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.closePath()
          ctx.fillStyle = 'rgba(22, 119, 255, 0.2)'
          ctx.fill()
          ctx.strokeStyle = '#1677FF'
          ctx.lineWidth = 2
          ctx.stroke()

          // 4. 绘制顶点圆点
          dims.forEach((d, i) => {
            const score = Math.min(Math.max(Number(d.score) || 0, 0), max)
            const angle = startAngle + i * angleStep
            const x = cx + Math.cos(angle) * r * score / max
            const y = cy + Math.sin(angle) * r * score / max
            ctx.beginPath()
            ctx.arc(x, y, 4, 0, Math.PI * 2)
            ctx.fillStyle = '#1677FF'
            ctx.fill()
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 1.5
            ctx.stroke()
          })

          // 5. 绘制维度标签（名称 + 分值）
          ctx.fillStyle = '#4E5969'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          dims.forEach((d, i) => {
            const angle = startAngle + i * angleStep
            const lx = cx + Math.cos(angle) * (r + 32)
            const ly = cy + Math.sin(angle) * (r + 32)
            ctx.fillText(`${d.name} ${d.score}`, lx, ly)
          })
        })
    }
  }
})
