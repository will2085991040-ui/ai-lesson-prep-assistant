// pages/detail/detail.js - 通用详情页
// 功能：展示教案/课件/习题/学情四种类型的详情，支持收藏、复制、重新生成、生成分享海报
const { STORAGE_KEYS, TYPE_COLLECTION, TYPE_NAMES } = require('../../utils/constants')
const { getRecordById, getFavorites, isFavorite, toggleFavorite, copyText, formatTime } = require('../../utils/api')
const { formatText } = require('../../utils/prompt')

// 重新生成目标页面路由
const REGENERATE_ROUTES = {
  lesson_plan: '/pages/lesson-plan/lesson-plan',
  ppt_outline: '/pages/ppt-outline/ppt-outline',
  courseware: '/pages/courseware/courseware',
  exercises: '/pages/exercises/exercises',
  analysis: '/pages/analysis/analysis'
}

// 中文数字（教学目标用「目标一/目标二…」）
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

// 教学目标数组 → 「目标一：…\n目标二：…」
function objectivesText(list) {
  if (!Array.isArray(list) || !list.length) return ''
  return list.map((o, i) => '目标' + (CN_NUM[i] || (i + 1)) + '：' + o).join('\n')
}

// 教学研究包 5 大模块（与课件生成页保持完全一致的文案格式）
function buildPackSections(pack) {
  pack = pack || {}
  const taskChain = (pack.taskChain || []).map(t => `· ${t.task || ''}（${t.minutes || ''}）：${t.activity || ''}`).join('\n')
  const evaluation = (pack.evaluation || []).map(e => `【${e.level || ''}】${e.content || ''}`).join('\n')
  const homework = (pack.homework || []).map(h => `【${h.level || ''}】${h.items || ''}`).join('\n')
  return [
    { number: '01', title: '单元整体分析', text: pack.unitAnalysis || '', open: true },
    { number: '02', title: '教学目标', text: objectivesText(pack.objectives), open: false },
    {
      number: '03',
      title: '大问题与任务链',
      text: (pack.bigQuestion || '') + (taskChain ? '\n\n任务链：\n' + taskChain : ''),
      open: false
    },
    {
      number: '04',
      title: '过渡语与分层评价语',
      text: (pack.transitions || []).join('\n') + (evaluation ? '\n\n分层评价语：\n' + evaluation : ''),
      open: false
    },
    {
      number: '05',
      title: '分层作业与板书',
      text: homework + (pack.boardDesign ? '\n\n板书设计：\n' + pack.boardDesign : ''),
      open: false
    }
  ]
}

Page({
  data: {
    type: '',            // 业务类型
    typeName: '',        // 类型中文名
    data: null,          // 解析后的 content 对象
    meta: {},            // 文档其余字段
    isFav: false,        // 是否已收藏
    favKey: '',          // 收藏唯一 key
    sections: [],        // 教案 8 大模块
    slides: [],          // 课件大纲页
    packSections: [],    // AI 完整课件：教学研究包 5 大折叠模块
    showViewer: false,   // 是否全屏放映课件
    exercisesTabs: [     // 习题分层 tab
      { key: 'basic', name: '基础巩固', tag: 'tag-green' },
      { key: 'improve', name: '能力提升', tag: 'tag-blue' },
      { key: 'challenge', name: '拓展创新', tag: 'tag-orange' }
    ],
    activeKey: 'basic',  // 当前习题分层
    activeTag: 'tag-green', // 当前分层标签样式
    suggestionTags: ['tag-green', 'tag-blue', 'tag-orange'], // 学情建议标签样式
    metaLine: '',        // 顶部元信息
    viewTitle: '',       // 展示标题
    loaded: false,       // 是否完成加载
    showPoster: false,   // 是否显示海报弹层
    posterPath: ''       // 海报临时文件路径
  },

  onLoad(options) {
    this.loadData(options)
  },

  // 加载数据（三种来源：收藏 / 云端记录 / 本地缓存）
  loadData(options) {
    // ① 收藏打开
    if (options.fav !== undefined && options.fav !== '') {
      const fav = getFavorites()[Number(options.fav)]
      if (!fav) {
        wx.showToast({ title: '收藏内容不存在', icon: 'none' })
        return
      }
      this.finishLoad({
        type: fav.type,
        data: fav.snapshot.data,
        meta: fav.snapshot.meta || {},
        favKey: fav.id,
        isFav: true
      })
      return
    }

    // ② 云端记录
    if (options.id) {
      const type = options.type || ''
      getRecordById(TYPE_COLLECTION[type], options.id)
        .then(doc => {
          let data = null
          try {
            data = doc ? JSON.parse(doc.content) : null
          } catch (e) {
            data = null
          }
          this.finishLoad({ type, data, meta: doc || {}, favKey: options.id, isFav: null })
        })
        .catch(() => {
          wx.showToast({ title: '记录不存在或已删除', icon: 'none' })
        })
      return
    }

    // ③ 本地缓存（未入库结果跳转详情）
    const cache = wx.getStorageSync(STORAGE_KEYS.DETAIL_CACHE)
    if (cache && cache.type) {
      wx.removeStorageSync(STORAGE_KEYS.DETAIL_CACHE)
      this.finishLoad({ type: cache.type, data: cache.data, meta: cache.meta || {}, favKey: null, isFav: null })
    } else {
      wx.removeStorageSync(STORAGE_KEYS.DETAIL_CACHE)
      wx.showToast({ title: '暂无数据', icon: 'none' })
    }
  },

  // 统一完成加载：确定收藏状态、构建展示数据
  finishLoad({ type, data, meta, favKey, isFav }) {
    // favKey 兜底
    let finalFavKey = favKey
    if (!finalFavKey) {
      finalFavKey = (meta && meta.topic) || ('local-' + Date.now())
    }
    // isFav 未定时计算
    let finalIsFav = isFav
    if (finalIsFav === null || finalIsFav === undefined) {
      finalIsFav = isFavorite(finalFavKey)
    }

    // 根据类型构建展示数据（全部 try-catch 兜底）
    const view = this.buildView(type, data, meta)

    this.setData({
      type,
      typeName: TYPE_NAMES[type] || '',
      data: view.data !== undefined ? view.data : (data || {}),
      meta: meta || {},
      isFav: finalIsFav,
      favKey: finalFavKey,
      sections: view.sections || [],
      slides: view.slides || [],
      packSections: view.packSections || [],
      showViewer: false,
      viewTitle: view.viewTitle || '',
      activeKey: view.activeKey || 'basic',
      activeTag: view.activeTag || 'tag-green',
      metaLine: this.buildMetaLine(meta || {}),
      loaded: true
    })
  },

  // 根据类型构建展示数据
  buildView(type, data, meta) {
    try {
      if (type === 'lesson_plan') return this.buildLessonPlan(data, meta)
      if (type === 'ppt_outline') return this.buildPPTOutline(data, meta)
      if (type === 'courseware') return this.buildCourseware(data, meta)
      if (type === 'exercises') return this.buildExercises(data, meta)
      if (type === 'analysis') return { viewTitle: (meta && meta.topic) || '学情诊断' }
    } catch (e) {
      console.error('构建详情展示数据失败', e)
    }
    return { viewTitle: ((meta && meta.topic) || '详情') }
  },

  // 教案：8 大模块
  buildLessonPlan(data, meta) {
    const d = data || {}
    // 教学目标 → 目标一/二/三
    const objectives = Array.isArray(d.objectives)
      ? `目标一：${d.objectives[0] || ''}\n目标二：${d.objectives[1] || ''}\n目标三：${d.objectives[2] || ''}`
      : (d.objectives || '')
    // 重难点
    const kp = d.keyPoints || {}
    const keyPointText = `教学重点：${kp.key || ''}\n教学难点：${kp.difficult || ''}`
    // 教学过程 → 逐环节拼接
    const process = Array.isArray(d.process)
      ? d.process
          .map(p => `${p.step || ''}\n教师活动：${p.teacher || ''}\n学生活动：${p.student || ''}\n设计意图：${p.intent || ''}`)
          .join('\n\n')
      : (d.process || '')
    const sections = [
      { number: '01', title: '教材分析', content: d.textbookAnalysis || '暂无内容', open: true },
      { number: '02', title: '学情分析', content: d.studentAnalysis || '暂无内容', open: false },
      { number: '03', title: '教学目标', content: objectives || '暂无内容', open: false },
      { number: '04', title: '教学重难点', content: keyPointText, open: false },
      { number: '05', title: '教学准备', content: d.preparation || '暂无内容', open: false },
      { number: '06', title: '教学过程', content: process || '暂无内容', open: false },
      { number: '07', title: '板书设计', content: d.boardDesign || '暂无内容', open: false },
      { number: '08', title: '反思预设', content: d.reflection || '暂无内容', open: false }
    ]
    return {
      sections,
      viewTitle: d.title || (meta && meta.topic) || '教案详情'
    }
  },

  // 课件大纲：页面数组
  buildPPTOutline(data, meta) {
    const raw = Array.isArray(data) ? data : ((data && data.slides) || [])
    const slides = raw.map((s, i) => Object.assign({}, s, { idx: i }))
    return {
      slides,
      viewTitle: (meta && meta.topic) || '课件大纲'
    }
  },

  // AI 完整课件：教学研究包 + 逐页幻灯片 + 讲解词（兼容新 {pack, slides} 与旧数组两种格式）
  buildCourseware(data, meta) {
    const pack = (data && data.pack) || {}
    const hasPack = !!(data && data.pack)
    const raw = Array.isArray(data) ? data : ((data && data.slides) || [])
    const slides = raw.map((s, i) => Object.assign({}, s, {
      idx: i,
      showNotes: false,
      imageFileID: s.imageFileID || '',
      imgBusy: false,
      title: s.title || '',
      content: s.content || '',
      visual: s.visual || '',
      animation: s.animation || '',
      speakerNotes: s.speakerNotes || '',
      imagePrompt: s.imagePrompt || '',
      layout: s.layout || ''
    }))
    return {
      pack,
      // 旧记录（直接数组）没有 pack，不渲染教学研究包
      packSections: hasPack ? buildPackSections(pack) : [],
      slides,
      viewTitle: (meta && meta.topic) || 'AI课件'
    }
  },

  // 习题：注入 showAnswer、选项兜底、idx
  buildExercises(data, meta) {
    const d = data || {}
    const inject = list => (Array.isArray(list) ? list : []).map((q, i) => ({
      ...q,
      options: Array.isArray(q.options) ? q.options : [],
      showAnswer: false,
      idx: i
    }))
    return {
      data: {
        basic: inject(d.basic),
        improve: inject(d.improve),
        challenge: inject(d.challenge)
      },
      viewTitle: (meta && meta.knowledge) || '分层习题',
      activeKey: 'basic',
      activeTag: 'tag-green'
    }
  },

  // 构建顶部元信息
  buildMetaLine(meta) {
    const parts = []
    if (meta.subject && meta.grade) {
      parts.push(`${meta.subject}·${meta.grade}`)
    } else if (meta.subject) {
      parts.push(meta.subject)
    } else if (meta.grade) {
      parts.push(meta.grade)
    }
    parts.push(formatTime(meta.createTime))
    return parts.join(' · ')
  },

  // 习题分层 tab 切换
  onExercisesTab(e) {
    const key = e.currentTarget.dataset.key
    const tab = this.data.exercisesTabs.find(t => t.key === key)
    this.setData({
      activeKey: key,
      activeTag: tab ? tab.tag : 'tag-green'
    })
  },

  // 切换答案解析
  onToggleAnswer(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const list = this.data.data[this.data.activeKey] || []
    const item = list[idx]
    if (!item) return
    const path = 'data.' + this.data.activeKey + '[' + idx + '].showAnswer'
    this.setData({ [path]: !item.showAnswer })
  },

  // 切换某页课件讲解词显示/隐藏
  onToggleNotes(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ ['slides[' + idx + '].showNotes']: !this.data.slides[idx].showNotes })
  },

  // 全屏放映课件
  onOpenViewer() {
    if (!this.data.slides.length) return
    this.setData({ showViewer: true })
  },

  // 关闭全屏放映（slide-viewer bind:close）
  onCloseViewer() {
    this.setData({ showViewer: false })
  },

  // 收藏 / 取消收藏
  onToggleFav() {
    const { favKey, type, viewTitle, meta, data } = this.data
    const res = toggleFavorite({
      id: favKey,
      type,
      title: viewTitle,
      createTime: meta.createTime || Date.now(),
      snapshot: { data, meta }
    })
    this.setData({ isFav: res.added })
    wx.showToast({ title: res.added ? '已收藏' : '已取消收藏', icon: 'none' })
  },

  // 复制全文
  onCopy() {
    // 新版课件为 {pack, slides} 结构，补上课题信息让复制的全文带标题
    let source = this.data.data
    if (this.data.type === 'courseware' && source && !Array.isArray(source)) {
      source = { pack: source.pack || {}, slides: source.slides || [], topic: (this.data.meta && this.data.meta.topic) || '' }
    }
    copyText(formatText(this.data.type, source))
      .then(() => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }))
      .catch(() => wx.showToast({ title: '复制失败', icon: 'none' }))
  },

  // 重新生成：写入回填缓存并跳转对应页面
  onRegenerate() {
    const { type, meta, data } = this.data
    wx.setStorageSync(STORAGE_KEYS.PREFILL, { type, meta, data })
    const url = REGENERATE_ROUTES[type]
    if (!url) return
    wx.navigateTo({ url })
  },

  // 生成分享海报
  onMakePoster() {
    this.createSelectorQuery()
      .select('#posterCanvas')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) {
          wx.showToast({ title: '海报生成失败', icon: 'none' })
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        // 按设备像素比缩放，保证高清
        const dpr = wx.getSystemInfoSync().pixelRatio || 2
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        this.drawPoster(ctx, 320, 512)
        wx.canvasToTempFilePath({
          canvas,
          success: res2 => {
            this.setData({ posterPath: res2.tempFilePath, showPoster: true })
          },
          fail: () => {
            wx.showToast({ title: '海报生成失败', icon: 'none' })
          }
        }, this)
      })
  },

  // 绘制海报
  drawPoster(ctx, w, h) {
    const typeName = this.data.typeName || ''
    const viewTitle = this.data.viewTitle || 'AI备课助手'
    const metaLine = this.data.metaLine || ''
    const createTime = formatTime((this.data.meta && this.data.meta.createTime) || Date.now())

    // ① 渐变背景
    const bg = ctx.createLinearGradient(0, 0, w, h)
    bg.addColorStop(0, '#1677FF')
    bg.addColorStop(1, '#3D8EFF')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // ② 两个半透明白色装饰圆（右上 / 左下）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.beginPath()
    ctx.arc(w - 30, 70, 80, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(20, h - 40, 60, 0, Math.PI * 2)
    ctx.fill()

    // ③ 白色圆角卡片
    const cardX = 20
    const cardY = 48
    const cardW = w - 40
    const cardH = h - 120
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 16)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()

    // ④ 标题换行（16px bold #1F2329，最多 3 行）
    ctx.fillStyle = '#1F2329'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    this.wrapText(ctx, viewTitle, cardX + 20, cardY + 36, cardW - 40, 24, 3)

    // ⑤ 类型 tag（#E8F3FF 圆角底 + #1677FF 12px 文字）
    ctx.font = '12px sans-serif'
    const tagW = ctx.measureText(typeName).width + 24
    const tagX = cardX + 20
    const tagY = cardY + 120
    const tagH = 26
    this.roundRect(ctx, tagX, tagY, tagW, tagH, 13)
    ctx.fillStyle = '#E8F3FF'
    ctx.fill()
    ctx.fillStyle = '#1677FF'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(typeName, tagX + 12, tagY + tagH / 2 + 1)

    // ⑥ 元信息（12px #86909C）
    ctx.fillStyle = '#86909C'
    ctx.font = '12px sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(metaLine, cardX + 20, cardY + 172)
    ctx.fillText('生成时间：' + createTime, cardX + 20, cardY + 196)

    // ⑧ 装饰分隔线
    ctx.strokeStyle = '#F2F3F5'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cardX + 20, cardY + 220)
    ctx.lineTo(cardX + cardW - 20, cardY + 220)
    ctx.stroke()

    // ⑦ 底部文字（16px bold #fff 居中）
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('AI备课助手 · 豆包大模型驱动', w / 2, h - 24)
  },

  // 文本换行（逐字 measureText，最多 maxLines 行，超出加省略号）
  wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const str = text || ''
    let line = ''
    let lines = 0
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      const testLine = line + ch
      if (ctx.measureText(testLine).width > maxWidth && line) {
        if (lines < maxLines - 1) {
          ctx.fillText(line, x, y + lines * lineHeight)
          lines++
          line = ch
        } else {
          // 超出最大行数：截断并加省略号
          while (line && ctx.measureText(line + '…').width > maxWidth) {
            line = line.slice(0, -1)
          }
          ctx.fillText(line + '…', x, y + lines * lineHeight)
          lines++
          line = ''
          break
        }
      } else {
        line = testLine
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, y + lines * lineHeight)
      lines++
    }
    return lines
  },

  // 圆角矩形路径
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  },

  // 保存海报到相册
  onSavePoster() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'none' }),
      fail: err => {
        // 相册权限被拒
        if (err && err.errMsg && err.errMsg.indexOf('auth deny') >= 0) {
          wx.showModal({
            title: '提示',
            content: '需要相册权限',
            success: res => {
              if (res.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  // 关闭海报弹层
  onClosePoster() {
    this.setData({ showPoster: false })
  },

  // 空函数：拦截弹层内部点击冒泡
  noop() {}
})
