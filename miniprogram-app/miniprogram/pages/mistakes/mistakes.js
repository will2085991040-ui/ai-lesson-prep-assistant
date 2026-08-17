// pages/mistakes/mistakes.js - 错题本
// 功能：手动记录共性错题 + AI 生成错题变式题（本地存储）
const { SUBJECTS } = require('../../utils/constants')
const { buildVariantsPrompt } = require('../../utils/prompt')
const api = require('../../utils/api')

Page({
  data: {
    list: [],                 // 过滤后展示的错题列表
    keyword: '',              // 搜索关键词
    showAdd: false,           // 记错题表单是否展开
    form: {                   // 记错题表单
      subject: '',
      knowledge: '',
      content: '',
      cause: ''
    },
    subjects: SUBJECTS,       // 学科选项
    subjectIndex: -1,         // 学科 picker 索引
    variants: [],             // AI 变式题列表
    variantVisible: false,    // 变式题弹层是否显示
    generating: false         // AI 生成中标志
  },

  onShow() {
    this.loadList()
  },

  // 加载错题本：map 加 idx/time 缓存原始数组，再按关键词过滤
  loadList() {
    const book = api.getMistakeBook()
    const rawList = (book || []).map((m, i) => Object.assign({}, m, {
      idx: i,
      time: api.formatTime(m.createTime)
    }))
    this._rawList = rawList
    this.applyFilter(rawList, this.data.keyword)
  },

  // 根据关键词过滤（content/knowledge/subject 模糊匹配，忽略大小写）
  applyFilter(rawList, keyword) {
    const kw = (keyword || '').trim().toLowerCase()
    let list = rawList || []
    if (kw) {
      list = list.filter(item => {
        const fields = [item.content, item.knowledge, item.subject]
          .map(v => (v || '').toLowerCase())
        return fields.some(v => v.indexOf(kw) >= 0)
      })
    }
    this.setData({ list })
  },

  // 搜索输入
  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this.applyFilter(this._rawList, keyword)
  },

  // 展开/收起记错题表单
  onToggleAdd() {
    this.setData({ showAdd: !this.data.showAdd })
  },

  // 学科 picker
  onSubjectChange(e) {
    const index = Number(e.detail.value)
    this.setData({ 'form.subject': SUBJECTS[index], subjectIndex: index })
  },

  // 记错题表单输入
  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 保存错题
  onSave() {
    const form = this.data.form
    const content = (form.content || '').trim()
    if (!content) {
      wx.showToast({ title: '请输入题目内容', icon: 'none' })
      return
    }
    const book = api.getMistakeBook()
    book.unshift({
      subject: form.subject || '',
      knowledge: (form.knowledge || '').trim(),
      content,
      cause: (form.cause || '').trim(),
      createTime: Date.now(),
      id: Date.now()
    })
    api.saveMistakeBook(book)
    // 清空表单并收起
    this.setData({
      form: { subject: '', knowledge: '', content: '', cause: '' },
      subjectIndex: -1,
      showAdd: false
    })
    this.loadList()
    wx.showToast({ title: '已记录错题', icon: 'none' })
  },

  // 生成 AI 变式题
  onGenVariants(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const item = this._rawList[idx]
    if (!item) return
    this.setData({ generating: true })
    api.generateVariants({
      subject: item.subject,
      knowledge: item.knowledge,
      content: item.content,
      prompt: buildVariantsPrompt({ subject: item.subject, knowledge: item.knowledge, content: item.content })
    })
      .then(data => {
        const variants = (Array.isArray(data) ? data : []).map(v => Object.assign({}, v, { showAnswer: false }))
        this.setData({ variants, variantVisible: true, generating: false })
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 变式题查看/收起答案
  onToggleAnswer(e) {
    const i = Number(e.currentTarget.dataset.idx)
    const key = 'variants[' + i + '].showAnswer'
    this.setData({ [key]: !this.data.variants[i].showAnswer })
  },

  // 复制全部变式题
  onCopyAll() {
    const variants = this.data.variants
    if (!variants.length) return
    const text = variants.map((v, i) => {
      return '第' + (i + 1) + '题：' + (v.content || '') +
        '\n答案：' + (v.answer || '略') +
        '\n解析：' + (v.analysis || '略')
    }).join('\n--------------------------------\n')
    api.copyText(text)
      .then(() => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  },

  // 关闭变式题弹层
  onCloseVariants() {
    this.setData({ variantVisible: false })
  },

  // 删除错题
  onDelete(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const book = api.getMistakeBook()
    if (!book[idx]) return
    wx.showModal({
      title: '删除确认',
      content: '删除后不可恢复，确定删除吗？',
      success: res => {
        if (!res.confirm) return
        book.splice(idx, 1)
        api.saveMistakeBook(book)
        wx.showToast({ title: '已删除', icon: 'none' })
        this.loadList()
      }
    })
  },

  // 空函数：拦截弹层触摸，防止背景滚动
  noop() {}
})
