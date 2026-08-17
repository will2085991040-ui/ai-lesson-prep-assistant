// pages/courseware/courseware.js - AI 课件
// 表单填写 → AI 一键生成完整课件（教学研究包 + 逐页幻灯片，含讲解词）→
// 逐页配图 / 全屏放映 / 导出PPTX → 保存 / 复制全文 / 存入知识库
const {
  SUBJECTS, GRADES, TEACH_STYLES, STUDENT_LEVELS, STORAGE_KEYS, COLLECTIONS
} = require('../../utils/constants')
const { buildCoursewarePrompt, buildLectureScriptPrompt, buildClozePrompt, buildVideoPrompt, formatText, COURSEWARE_TEMPLATES, VISUAL_STYLES } = require('../../utils/prompt')
const api = require('../../utils/api')

// 中文数字（教学目标用「目标一/目标二…」）
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

// 教学目标数组 → 「目标一：…\n目标二：…」
function objectivesText(list) {
  if (!Array.isArray(list) || !list.length) return ''
  return list.map((o, i) => '目标' + (CN_NUM[i] || (i + 1)) + '：' + o).join('\n')
}

// 教学研究包 5 大模块（与详情页保持完全一致的文案格式）
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

// 年级 → 学段（用于教材联动过滤）
function stageOf(grade) {
  const primary = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']
  const junior = ['七年级', '八年级', '九年级']
  const senior = ['高一', '高二', '高三']
  if (primary.indexOf(grade) >= 0) return '小学'
  if (junior.indexOf(grade) >= 0) return '初中'
  if (senior.indexOf(grade) >= 0) return '高中'
  return ''
}

Page({
  data: {
    subjects: SUBJECTS,         // 学科选项
    grades: GRADES,             // 年级选项
    styles: TEACH_STYLES,       // 教学风格选项
    studentLevels: STUDENT_LEVELS, // 学生水平假设选项
    visualStyles: VISUAL_STYLES,   // 视觉风格选项（教学模式×视觉风格双轴）
    templates: COURSEWARE_TEMPLATES, // 课件模板选项
    allTextbooks: [],           // 教材完整对象数组（全量）
    textbookNames: [],          // 教材名称（picker range，已按学科/学段过滤）
    form: {
      subject: '',
      grade: '',
      textbook: '',
      topic: '',
      pages: 20,
      style: '常规严谨',
      visualStyle: '清新现代',
      template: '标准结构',
      studentLevel: '中等',
      requirements: ''
    },
    indexes: {
      subjectIndex: -1,
      gradeIndex: -1,
      styleIndex: 0,
      visualStyleIndex: 0,
      textbookIndex: -1,
      studentLevelIndex: 1
    },
    generating: false,          // AI 生成中标志
    packSections: [],           // 教学研究包 5 大折叠模块
    slides: [],                 // 课件结果（注入 idx/showNotes/imageFileID/imgBusy）
    saving: false,              // 保存防连点标志
    imgBusy: false,             // 批量配图生成中标志
    exporting: false,           // 导出 PPTX 中标志
    showViewer: false,          // 全屏放映开关
    lectureContent: '',         // 说课稿纯文本内容
    lectureVisible: false,      // 说课稿弹层开关
    lectureGen: false,          // 说课稿生成中标志
    clozeItems: [],             // 随堂挖空练习（注入 showAnswer/idx）
    clozeVisible: false,        // 随堂练习弹层开关
    clozeGen: false,            // 随堂练习生成中标志
    videoFileID: '',            // 课堂开场视频 fileID
    videoVisible: false,        // 开场视频弹层开关
    videoGen: false             // 开场视频生成中标志
  },

  onLoad() {
    // 教材列表加载（教材可选填，失败静默）
    this.loadTextbooks()

    // PREFILL 缓存回填（「重新生成」场景）
    const prefill = wx.getStorageSync(STORAGE_KEYS.PREFILL)
    if (prefill && prefill.type === 'courseware' && prefill.meta) {
      this.applyPrefill(prefill.meta)
      wx.removeStorageSync(STORAGE_KEYS.PREFILL)
      this.refreshTextbookPicker()
    }
  },

  // 加载教材库（全量 200+ 本）
  loadTextbooks() {
    api.getTextbooks()
      .then(list => {
        this.setData({ allTextbooks: list || [] })
        this.refreshTextbookPicker()
      })
      .catch(() => {
        // 教材为可选项，加载失败静默处理
      })
  },

  // 用一份 meta 数据覆盖表单（含 studentLevel/visualStyle）
  applyPrefill(meta) {
    const form = Object.assign({}, this.data.form)
    const keys = ['subject', 'grade', 'textbook', 'topic', 'pages', 'style', 'visualStyle', 'template', 'studentLevel', 'requirements']
    keys.forEach(k => {
      if (meta[k] !== undefined && meta[k] !== null) {
        form[k] = k === 'pages' ? Number(meta[k]) : meta[k]
      }
    })
    this.setData({
      form,
      indexes: {
        subjectIndex: SUBJECTS.indexOf(form.subject),
        gradeIndex: GRADES.indexOf(form.grade),
        styleIndex: TEACH_STYLES.indexOf(form.style),
        visualStyleIndex: VISUAL_STYLES.indexOf(form.visualStyle) >= 0 ? VISUAL_STYLES.indexOf(form.visualStyle) : 0,
        textbookIndex: -1,
        studentLevelIndex: STUDENT_LEVELS.indexOf(form.studentLevel) >= 0 ? STUDENT_LEVELS.indexOf(form.studentLevel) : 1
      }
    })
  },

  // 按「学科 + 学段」过滤教材并同步教材选择器
  refreshTextbookPicker() {
    const allTextbooks = this.data.allTextbooks
    const form = this.data.form
    const filtered = allTextbooks.filter(t =>
      (!form.subject || t.subject === form.subject) &&
      (!stageOf(form.grade) || t.stage === stageOf(form.grade))
    )
    const textbookNames = filtered.map(t => t.bookName)
    // 若当前教材不在过滤结果中（且教材库已加载），清空教材
    let textbook = form.textbook
    if (allTextbooks.length > 0 && textbook && textbookNames.indexOf(textbook) < 0) {
      textbook = ''
    }
    this.setData({
      textbookNames,
      'form.textbook': textbook,
      'indexes.textbookIndex': textbookNames.indexOf(textbook)
    })
  },

  // picker：学科
  onSubjectChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.subject': SUBJECTS[index],
      'indexes.subjectIndex': index
    })
    this.refreshTextbookPicker()
  },

  // picker：年级
  onGradeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.grade': GRADES[index],
      'indexes.gradeIndex': index
    })
    this.refreshTextbookPicker()
  },

  // picker：教材
  onTextbookChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.textbook': this.data.textbookNames[index],
      'indexes.textbookIndex': index
    })
  },

  // picker：教学风格
  onStyleChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.style': TEACH_STYLES[index],
      'indexes.styleIndex': index
    })
  },

  // picker：视觉风格（决定配图风格与导出配色）
  onVisualStyleChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.visualStyle': VISUAL_STYLES[index],
      'indexes.visualStyleIndex': index
    })
  },

  // picker：学生水平假设
  onStudentLevelChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.studentLevel': STUDENT_LEVELS[index],
      'indexes.studentLevelIndex': index
    })
  },

  // input：课题
  onTopicInput(e) {
    this.setData({ 'form.topic': e.detail.value })
  },

  // slider：页数
  onPagesChange(e) {
    this.setData({ 'form.pages': e.detail.value })
  },

  // chip：课件模板
  onTemplateTap(e) {
    const template = e.currentTarget.dataset.template
    this.setData({ 'form.template': template })
  },

  // textarea：老师补充要求
  onRequirementsInput(e) {
    this.setData({ 'form.requirements': e.detail.value })
  },

  // 生成完整课件
  onGenerate() {
    const form = this.data.form
    // 必填校验
    if (!form.subject) {
      wx.showToast({ title: '请选择学科', icon: 'none' })
      return
    }
    if (!form.grade) {
      wx.showToast({ title: '请选择年级', icon: 'none' })
      return
    }
    if (!form.topic || !form.topic.trim()) {
      wx.showToast({ title: '请输入课题', icon: 'none' })
      return
    }

    this.setData({ generating: true })

    api.generateCourseware(Object.assign({}, form, {
      prompt: buildCoursewarePrompt(form)
    }))
      .then(data => {
        // 新契约 {pack, slides}；兼容旧记录直接数组
        const pack = (data && data.pack) || {}
        const list = Array.isArray(data) ? data : ((data && data.slides) || [])
        // 注入 idx / showNotes / imageFileID / imgBusy，字段兜底
        const slides = list.map((s, idx) => Object.assign({}, s, {
          slideType: s.slideType || 'concept', // 版式类型（导出时决定布局）
          title: s.title || '',
          content: s.content || '',
          visual: s.visual || '',
          animation: s.animation || '',
          speakerNotes: s.speakerNotes || '',
          imagePrompt: s.imagePrompt || '',
          layout: s.layout || '',
          idx,
          showNotes: false,
          imageFileID: '',
          imgBusy: false
        }))
        this.setData({
          slides,
          packSections: buildPackSections(pack),
          _pack: pack,
          generating: false
        })
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 切换某页讲解词显示/隐藏
  onToggleNotes(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (!this.data.slides[idx]) return
    this.setData({ ['slides[' + idx + '].showNotes']: !this.data.slides[idx].showNotes })
  },

  // 单页生成/重新生成配图（15 积分/张）
  onGenSlideImage(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const slide = this.data.slides[idx]
    if (!slide || slide.imgBusy) return
    this.setData({ ['slides[' + idx + '].imgBusy']: true })

    api.generateSlideImages({
      style: this.data.form.visualStyle,
      slides: [{
        title: slide.title,
        content: slide.content,
        imagePrompt: slide.imagePrompt,
        layout: slide.layout
      }]
    })
      .then(list => {
        const fileID = (list && list[0] && list[0].fileID) || ''
        this.setData({
          ['slides[' + idx + '].imageFileID']: fileID,
          ['slides[' + idx + '].imgBusy']: false
        })
        if (fileID) wx.showToast({ title: '配图已生成', icon: 'success' })
      })
      .catch(err => {
        this.setData({ ['slides[' + idx + '].imgBusy']: false })
        api.handleAIError(err)
      })
  },

  // 一键生成全部配图：分批（每批 6 页）顺序执行，结果按 index 映射回原页
  onGenAllImages() {
    if (this.data.imgBusy) return
    const slides = this.data.slides
    // 收集尚未配图且不在生成中的页
    const pending = slides.filter(s => !s.imageFileID && !s.imgBusy)
    if (!pending.length) {
      wx.showToast({ title: '所有页面都已有配图', icon: 'none' })
      return
    }

    const total = slides.length
    let done = 0
    this.setData({ imgBusy: true })

    // 执行一批：批内页置为生成中，成功后按返回的 index 映射回原页
    const runBatch = batch => {
      batch.forEach(s => {
        this.setData({ ['slides[' + s.idx + '].imgBusy']: true })
      })
      return api.generateSlideImages({
        style: this.data.form.visualStyle,
        slides: batch.map(s => ({
          title: s.title,
          content: s.content,
          imagePrompt: s.imagePrompt,
          layout: s.layout
        }))
      })
        .then(list => {
          ;(list || []).forEach(item => {
            const batchPos = Number(item.index)
            const slide = batch[batchPos]
            if (slide) {
              this.setData({ ['slides[' + slide.idx + '].imageFileID']: item.fileID || '' })
            }
          })
          done += batch.length
          wx.showToast({ title: '已生成 ' + done + '/' + total + ' 张配图', icon: 'none' })
        })
    }

    // 按 6 页一批切分，顺序串联执行
    const chunks = []
    for (let i = 0; i < pending.length; i += 6) {
      chunks.push(pending.slice(i, i + 6))
    }
    const chain = chunks.reduce((p, batch) => p.then(() => runBatch(batch)), Promise.resolve())

    chain
      .then(() => {
        this.setData({ imgBusy: false })
        wx.showToast({ title: '全部配图生成完成', icon: 'success' })
      })
      .catch(err => {
        // 任一批失败：清空所有生成中标志并中断
        this.data.slides.forEach(s => {
          if (s.imgBusy) this.setData({ ['slides[' + s.idx + '].imgBusy']: false })
        })
        this.setData({ imgBusy: false })
        api.handleAIError(err)
      })
  },

  // 全屏放映
  onPresent() {
    if (!this.data.slides.length) return
    this.setData({ showViewer: true })
  },

  // 关闭全屏放映（slide-viewer bind:close）
  onCloseViewer() {
    this.setData({ showViewer: false })
  },

  // 生成说课稿（15 积分）：基于教学研究包 + 表单信息
  onGenLecture() {
    const pack = this.data._pack
    if (!pack || !this.data.slides.length) {
      wx.showToast({ title: '请先生成完整课件', icon: 'none' })
      return
    }
    this.setData({ lectureGen: true })
    api.generateLectureScript(Object.assign({}, this.data.form, {
      pack,
      prompt: buildLectureScriptPrompt(this.data.form, pack)
    }))
      .then(data => {
        this.setData({
          lectureContent: (data && data.content) || '',
          lectureVisible: true
        })
      })
      .catch(err => {
        api.handleAIError(err)
      })
      .then(() => {
        this.setData({ lectureGen: false })
      })
  },

  // 生成随堂挖空练习（15 积分）：基于全部课件页文本
  onGenCloze() {
    const slides = this.data.slides
    if (!slides.length) {
      wx.showToast({ title: '请先生成完整课件', icon: 'none' })
      return
    }
    // 拼接全部课件页文本（标题 + 内容），供 AI 出题
    const slidesText = slides.map(s => (s.title || '') + '\n' + (s.content || '')).join('\n')
    this.setData({ clozeGen: true })
    api.generateCloze(Object.assign({}, this.data.form, {
      prompt: buildClozePrompt(this.data.form, slidesText)
    }))
      .then(list => {
        // 每道题注入 showAnswer 开关与稳定下标 idx
        const items = (list || []).map((item, i) => Object.assign({}, item, { showAnswer: false, idx: i }))
        this.setData({ clozeItems: items, clozeVisible: true })
      })
      .catch(err => {
        api.handleAIError(err)
      })
      .then(() => {
        this.setData({ clozeGen: false })
      })
  },

  // 切换某道题的答案显示/隐藏
  onToggleClozeAnswer(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (!this.data.clozeItems[idx]) return
    this.setData({ ['clozeItems[' + idx + '].showAnswer']: !this.data.clozeItems[idx].showAnswer })
  },

  // 关闭说课稿弹层
  onCloseLecture() {
    this.setData({ lectureVisible: false })
  },

  // 复制说课稿全文
  onCopyLecture() {
    api.copyText(this.data.lectureContent)
      .then(() => {
        wx.showToast({ title: '已复制说课稿', icon: 'success' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  },

  // 说课稿存入个人知识库（教研笔记）
  onSaveLecture() {
    const list = api.getKnowledgeBase()
    list.unshift({
      id: Date.now(),
      category: '教研笔记',
      title: this.data.form.topic + ' · 说课稿',
      content: this.data.lectureContent,
      createTime: Date.now()
    })
    api.saveKnowledgeBase(list)
    wx.showToast({ title: '已存入知识库', icon: 'success' })
  },

  // 关闭随堂练习弹层
  onCloseCloze() {
    this.setData({ clozeVisible: false })
  },

  // 生成课堂开场小视频（豆包视频模型，50 积分，异步任务 + 轮询）
  onGenVideo() {
    if (this.data.videoGen) return
    const { form } = this.data
    if (!form.topic || !form.topic.trim()) {
      wx.showToast({ title: '请先输入课题', icon: 'none' })
      return
    }
    this.setData({ videoGen: true })
    api.generateVideoTask({
      topic: form.topic,
      prompt: buildVideoPrompt(form)
    })
      .then(res => {
        const taskId = res && res.taskId
        if (!taskId) return Promise.reject(new Error('视频任务提交失败，请稍后重试'))
        // 轮询任务状态（每 5 秒一次，最多 60 次 ≈ 5 分钟）
        let polls = 0
        const timer = setInterval(() => {
          polls++
          api.queryVideoTask(taskId)
            .then(r => {
              if (r && r.status === 'succeeded' && r.fileID) {
                clearInterval(timer)
                this.setData({ videoFileID: r.fileID, videoVisible: true, videoGen: false })
                wx.showToast({ title: '开场视频已生成', icon: 'success' })
              } else if (r && r.status === 'failed') {
                clearInterval(timer)
                this.setData({ videoGen: false })
                wx.showToast({ title: '视频生成失败，请重试', icon: 'none' })
              } else if (polls >= 60) {
                clearInterval(timer)
                this.setData({ videoGen: false })
                wx.showToast({ title: '视频生成超时，请稍后重试', icon: 'none' })
              }
            })
            .catch(err => {
              clearInterval(timer)
              this.setData({ videoGen: false })
              api.handleAIError(err)
            })
        }, 5000)
        this._videoTimer = timer
      })
      .catch(err => {
        this.setData({ videoGen: false })
        api.handleAIError(err)
      })
  },

  // 关闭开场视频弹层
  onCloseVideo() {
    this.setData({ videoVisible: false })
  },

  // 页面卸载时清理轮询定时器
  onUnload() {
    if (this._videoTimer) clearInterval(this._videoTimer)
  },

  // 复制全部随堂练习（题号 + 题目 + 选项 + 答案/解析）
  onCopyCloze() {
    const text = this.data.clozeItems.map((item, i) => {
      const lines = [(i + 1) + '. ' + (item.content || '')]
      if (item.type === 'choice' && Array.isArray(item.options) && item.options.length) {
        lines.push(item.options.join('\n'))
      }
      lines.push('答案：' + (item.answer || '略'))
      if (item.analysis) lines.push('解析：' + item.analysis)
      return lines.join('\n')
    }).join('\n\n')
    api.copyText(text)
      .then(() => {
        wx.showToast({ title: '已复制随堂练习', icon: 'success' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  },

  // 空函数：拦截弹层面板内点击，防止触发遮罩关闭
  noop() {},

  // 导出 PPTX（20 积分）：云端生成 → 下载 → 打开文档
  onExport() {
    if (this.data.exporting) return
    const { slides, form } = this.data
    if (!slides.length) return
    this.setData({ exporting: true })

    api.exportPPTX({
      title: form.topic,
      subtitle: [form.subject, form.grade, form.textbook].filter(Boolean).join(' · '),
      visualStyle: form.visualStyle || '清新现代',
      slides: slides.map(s => ({
        slideType: s.slideType || 'concept',
        title: s.title,
        content: s.content,
        speakerNotes: s.speakerNotes,
        imageFileID: s.imageFileID || ''
      }))
    })
      .then(data => {
        const fileID = (data && data.fileID) || ''
        if (!fileID) return Promise.reject(new Error('导出失败，请稍后重试'))
        return wx.cloud.downloadFile({ fileID })
      })
      .then(res => {
        const filePath = res && res.tempFilePath
        if (!filePath) return Promise.reject(new Error('导出失败，请稍后重试'))
        return wx.openDocument({ filePath, fileType: 'pptx', showMenu: true })
      })
      .then(() => {
        wx.showToast({ title: '已导出，可在 WPS/PowerPoint 中打开', icon: 'none' })
      })
      .catch(err => {
        api.handleAIError(err)
      })
      .then(() => {
        this.setData({ exporting: false })
      })
  },

  // 存入个人知识库（教研笔记）
  onSaveKnowledge() {
    const { slides, form } = this.data
    if (!slides.length) return
    const pack = this.data._pack || {}
    const list = api.getKnowledgeBase()
    list.unshift({
      id: Date.now(),
      category: '教研笔记',
      title: (form.topic || '课件') + ' · 教学研究包',
      content: formatText('courseware', { pack, slides, topic: form.topic }),
      createTime: Date.now()
    })
    api.saveKnowledgeBase(list)
    wx.showToast({ title: '已存入知识库', icon: 'success' })
  },

  // 保存课件到备课库
  onSave() {
    if (this.data.saving) return
    const { form, slides } = this.data
    if (!slides.length) return
    this.setData({ saving: true })

    api.addRecord(COLLECTIONS.COURSEWARES, Object.assign({}, form, {
      content: JSON.stringify({ pack: this.data._pack || {}, slides, videoFileID: this.data.videoFileID || '' })
    }))
      .then(res => {
        api.pushHistory({
          type: 'courseware',
          title: form.topic,
          id: res._id,
          createTime: Date.now()
        })
        wx.showToast({ title: '已保存到备课库', icon: 'success' })
      })
      .catch(err => {
        wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      })
      .then(() => {
        this.setData({ saving: false })
      })
  },

  // 复制全文
  onCopy() {
    const { slides, form } = this.data
    if (!slides.length) return
    api.copyText(formatText('courseware', { pack: this.data._pack || {}, slides, topic: form.topic }))
      .then(() => {
        wx.showToast({ title: '已复制，可粘贴到 PPT 工具', icon: 'none' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  }
})
