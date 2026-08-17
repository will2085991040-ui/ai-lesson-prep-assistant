// pages/ppt-outline/ppt-outline.js - 课件大纲
// 表单填写 → AI 生成课件大纲 → 逐页卡片展示 → 保存/导出文本
const { TEACH_STYLES, STORAGE_KEYS, COLLECTIONS } = require('../../utils/constants')
const { buildPPTOutlinePrompt, buildImagePrompt, formatText } = require('../../utils/prompt')
const api = require('../../utils/api')

Page({
  data: {
    styles: TEACH_STYLES,   // 教学风格选项
    form: {
      topic: '',
      pages: 10,
      style: '常规严谨'
    },
    styleIndex: 0,          // 风格 picker 索引
    generating: false,      // AI 生成中标志
    result: null,           // 大纲结果（slides 数组）
    saving: false,          // 保存防连点标志
    coverFileId: '',        // 课件封面图 fileID
    generatingImage: false  // 封面图生成中标志
  },

  onLoad(options) {
    // query 预填课题
    if (options.topic) {
      this.setData({ 'form.topic': decodeURIComponent(options.topic) })
    }

    // PREFILL 缓存回填（「重新生成」场景）
    const prefill = wx.getStorageSync(STORAGE_KEYS.PREFILL)
    if (prefill && prefill.type === 'ppt_outline' && prefill.meta) {
      const meta = prefill.meta
      const form = Object.assign({}, this.data.form)
      if (meta.topic !== undefined && meta.topic !== null) form.topic = meta.topic
      if (meta.pages !== undefined && meta.pages !== null) form.pages = meta.pages
      if (meta.style !== undefined && meta.style !== null) form.style = meta.style
      const patch = {
        form,
        styleIndex: TEACH_STYLES.indexOf(form.style)
      }
      // 重新生成场景：若已生成过封面图，一并回填
      if (meta.coverFileId) patch.coverFileId = meta.coverFileId
      this.setData(patch)
      wx.removeStorageSync(STORAGE_KEYS.PREFILL)
    }
  },

  // input：课题
  onTopicInput(e) {
    this.setData({ 'form.topic': e.detail.value })
  },

  // slider：页数
  onPagesChange(e) {
    this.setData({ 'form.pages': e.detail.value })
  },

  // picker：风格
  onStyleChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.style': TEACH_STYLES[index],
      styleIndex: index
    })
  },

  // 生成课件大纲
  onGenerate() {
    const form = this.data.form
    // 必填校验
    if (!form.topic || !form.topic.trim()) {
      wx.showToast({ title: '请输入课题', icon: 'none' })
      return
    }

    this.setData({ generating: true })

    api.generatePPTOutline({
      topic: form.topic,
      pages: form.pages,
      style: form.style,
      prompt: buildPPTOutlinePrompt(form)
    })
      .then(data => {
        // 兼容两种返回结构：直接数组 / {slides: []}
        const result = Array.isArray(data) ? data : ((data && data.slides) || [])
        this.setData({ result, generating: false })
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 生成课件封面图
  onGenerateCover() {
    // 校验课题
    if (!this.data.form.topic || !this.data.form.topic.trim()) {
      wx.showToast({ title: '请先输入课题', icon: 'none' })
      return
    }
    this.setData({ generatingImage: true })
    api.generateImage({
      prompt: buildImagePrompt({ topic: this.data.form.topic, style: this.data.form.style })
    })
      .then(data => {
        this.setData({ coverFileId: data.fileID })
      })
      .catch(err => {
        api.handleAIError(err)
      })
      .then(() => {
        // 无论成败都复位生成状态
        this.setData({ generatingImage: false })
      })
  },

  // 保存大纲到备课库
  onSave() {
    if (this.data.saving) return
    const { form, result } = this.data
    if (!result) return
    this.setData({ saving: true })

    api.addRecord(COLLECTIONS.PPT_OUTLINES, {
      topic: form.topic,
      pages: form.pages,
      style: form.style,
      coverFileId: this.data.coverFileId || '',
      content: JSON.stringify(result)
    })
      .then(res => {
        api.pushHistory({
          type: 'ppt_outline',
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

  // 导出大纲文本
  onExport() {
    const { result } = this.data
    if (!result) return
    api.copyText(formatText('ppt_outline', result))
      .then(() => {
        wx.showToast({ title: '大纲文本已复制，可粘贴到 PPT 制作工具', icon: 'none' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  }
})
