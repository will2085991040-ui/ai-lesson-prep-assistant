// pages/words/words.js - 单词本
// 功能：手动添加单词 + AI 按主题批量生成单词表（本地存储）
const { GRADES } = require('../../utils/constants')
const { buildWordsPrompt } = require('../../utils/prompt')
const api = require('../../utils/api')

Page({
  data: {
    displayList: [],           // 过滤后展示的单词列表
    keyword: '',               // 搜索关键词
    showAdd: false,            // 手动添加表单是否展开
    form: {                    // 手动添加表单
      word: '',
      phonetic: '',
      meaning: '',
      example: '',
      exampleCn: ''
    },
    aiForm: {                  // AI 批量生成表单
      theme: '',
      count: 10
    },
    gradeIndex: -1,            // 年级 picker 索引（-1 表示不限）
    grades: GRADES,            // 年级选项
    generating: false          // AI 生成中标志
  },

  onShow() {
    this.loadBook()
  },

  // 加载单词本：先 map 加 idx 缓存原始数组，再按关键词过滤
  loadBook() {
    const book = api.getWordBook()
    const rawList = (book || []).map((w, i) => Object.assign({}, w, { idx: i }))
    this._rawList = rawList
    this.applyFilter(rawList, this.data.keyword)
  },

  // 根据关键词过滤（word/meaning/example 模糊匹配，忽略大小写）
  applyFilter(rawList, keyword) {
    const kw = (keyword || '').trim().toLowerCase()
    let list = rawList || []
    if (kw) {
      list = list.filter(item => {
        const fields = [item.word, item.meaning, item.example]
          .map(v => (v || '').toLowerCase())
        return fields.some(v => v.indexOf(kw) >= 0)
      })
    }
    this.setData({ displayList: list })
  },

  // 搜索输入
  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this.applyFilter(this._rawList, keyword)
  },

  // 展开/收起手动添加表单
  onToggleAdd() {
    this.setData({ showAdd: !this.data.showAdd })
  },

  // 手动添加表单输入
  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 判断单词本中是否已存在同 word（忽略大小写与首尾空格）
  hasWord(book, word) {
    const target = (word || '').trim().toLowerCase()
    if (!target) return false
    return book.some(w => (w.word || '').trim().toLowerCase() === target)
  },

  // 手动保存单词
  onSaveWord() {
    const form = this.data.form
    const word = (form.word || '').trim()
    if (!word) {
      wx.showToast({ title: '请输入单词', icon: 'none' })
      return
    }
    const book = api.getWordBook()
    if (this.hasWord(book, word)) {
      wx.showToast({ title: '该单词已在单词本', icon: 'none' })
      return
    }
    // 新单词插到最前面
    book.unshift({
      word,
      phonetic: (form.phonetic || '').trim(),
      meaning: (form.meaning || '').trim(),
      example: (form.example || '').trim(),
      exampleCn: (form.exampleCn || '').trim(),
      createTime: Date.now()
    })
    api.saveWordBook(book)
    // 清空表单
    this.setData({ form: { word: '', phonetic: '', meaning: '', example: '', exampleCn: '' } })
    this.loadBook()
    wx.showToast({ title: '已添加到单词本', icon: 'none' })
  },

  // AI 表单：主题输入
  onThemeInput(e) {
    this.setData({ 'aiForm.theme': e.detail.value })
  },

  // AI 表单：数量 slider
  onCountChange(e) {
    this.setData({ 'aiForm.count': e.detail.value })
  },

  // AI 表单：年级 picker
  onGradeChange(e) {
    this.setData({ gradeIndex: Number(e.detail.value) })
  },

  // AI 批量生成单词表
  onGenerateWords() {
    const aiForm = this.data.aiForm
    const theme = (aiForm.theme || '').trim()
    if (!theme) {
      wx.showToast({ title: '请输入单词主题', icon: 'none' })
      return
    }
    const count = aiForm.count
    const grade = this.data.gradeIndex >= 0 ? GRADES[this.data.gradeIndex] : ''
    this.setData({ generating: true })

    api.generateWords({
      subject: '英语',
      theme,
      count,
      grade,
      prompt: buildWordsPrompt({ subject: '英语', theme, count, grade })
    })
      .then(data => {
        const list = Array.isArray(data) ? data : []
        const book = api.getWordBook()
        // 按 word 去重合并：新词放前面，已存在的跳过
        const news = []
        list.forEach(w => {
          if (!w.word) return
          if (this.hasWord(book, w.word) || this.hasWord(news, w.word)) return
          news.push({
            word: w.word,
            phonetic: w.phonetic || '',
            meaning: w.meaning || '',
            example: w.example || '',
            exampleCn: w.exampleCn || '',
            createTime: Date.now()
          })
        })
        const next = news.concat(book)
        api.saveWordBook(next)
        this.loadBook()
        this.setData({ generating: false })
        wx.showToast({ title: '已加入 ' + news.length + ' 个新单词', icon: 'none' })
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 删除单词
  onDelete(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const book = api.getWordBook()
    if (!book[idx]) return
    wx.showModal({
      title: '删除确认',
      content: '删除后不可恢复，确定删除吗？',
      success: res => {
        if (!res.confirm) return
        book.splice(idx, 1)
        api.saveWordBook(book)
        wx.showToast({ title: '已删除', icon: 'none' })
        this.loadBook()
      }
    })
  }
})
