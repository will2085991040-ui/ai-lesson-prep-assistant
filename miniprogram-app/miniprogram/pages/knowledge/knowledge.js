// pages/knowledge/knowledge.js - 个人知识库
// 功能：分类/关键词筛选 + 手动添加 + 详情查看/复制/删除（本地存储）
const api = require('../../utils/api')

// 分类（首项「全部」仅用于列表筛选）
const CATEGORIES = ['全部', '教研笔记', '提示词', '学科资料', '其他']
// 分类 picker 选项：去掉「全部」
const CAT_OPTIONS = CATEGORIES.slice(1)
// 分类 → 标签样式类（JS 预计算，避免 WXML 函数调用）
const CAT_TAG = {
  '教研笔记': 'tag-blue',
  '提示词': 'tag-orange',
  '学科资料': 'tag-green',
  '其他': 'tag-gray'
}

Page({
  data: {
    categories: CATEGORIES,   // 分类筛选 chips
    activeCat: '全部',         // 当前选中的分类
    list: [],                  // 筛选后展示的知识列表
    keyword: '',               // 搜索关键词
    showAdd: false,            // 添加表单是否展开
    form: {                    // 添加表单
      title: '',
      category: '教研笔记',
      content: ''
    },
    catIndex: 0,               // 分类 picker 索引
    catOptions: CAT_OPTIONS,   // 分类 picker 选项
    detail: null               // 当前查看的详情（null 表示弹层关闭）
  },

  onShow() {
    // 每次进入页面重新加载知识库
    this.loadList()
  },

  // 加载知识库：注入 idx/time/catTag 展示字段后缓存原始数组，再执行筛选
  loadList() {
    const raw = api.getKnowledgeBase() || []
    const rawList = raw.map((item, i) => Object.assign({}, item, {
      idx: i,
      time: api.formatTime(item.createTime),
      catTag: CAT_TAG[item.category] || 'tag-gray'
    }))
    this._rawList = rawList
    this.applyFilter(rawList, this.data.keyword, this.data.activeCat)
  },

  // 筛选：分类精确匹配 + 关键词模糊匹配（title/content/category 包含，忽略大小写）
  applyFilter(rawList, keyword, activeCat) {
    const kw = (keyword || '').trim().toLowerCase()
    let list = rawList || []
    // 分类筛选
    if (activeCat && activeCat !== '全部') {
      list = list.filter(item => item.category === activeCat)
    }
    // 关键词筛选
    if (kw) {
      list = list.filter(item => {
        const fields = [item.title, item.content, item.category]
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
    this.applyFilter(this._rawList, keyword, this.data.activeCat)
  },

  // 切换分类 chips
  onCatTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const activeCat = this.data.categories[index] || '全部'
    this.setData({ activeCat })
    this.applyFilter(this._rawList, this.data.keyword, activeCat)
  },

  // 展开/收起添加表单
  onToggleAdd() {
    this.setData({ showAdd: !this.data.showAdd })
  },

  // 添加表单输入（title/content）
  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 分类 picker 变更：同步索引与表单分类
  onCatChange(e) {
    const catIndex = Number(e.detail.value)
    this.setData({
      catIndex,
      'form.category': CAT_OPTIONS[catIndex]
    })
  },

  // 保存到知识库：校验 → unshift 新条目 → 落库 → 清空表单 → 刷新 → 提示
  onSave() {
    const form = this.data.form
    const title = (form.title || '').trim()
    const content = (form.content || '').trim()
    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    const list = api.getKnowledgeBase() || []
    list.unshift({
      id: Date.now(),
      title,
      category: CAT_OPTIONS[this.data.catIndex] || '教研笔记',
      content,
      createTime: Date.now()
    })
    api.saveKnowledgeBase(list)
    // 清空表单并回到默认分类
    this.setData({
      form: { title: '', category: '教研笔记', content: '' },
      catIndex: 0
    })
    this.loadList()
    wx.showToast({ title: '已保存到知识库', icon: 'none' })
  },

  // 点击列表项 → 打开详情弹层
  onItemTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.list[index]
    if (!item) return
    this.setData({ detail: item })
  },

  // 关闭详情弹层
  onCloseDetail() {
    this.setData({ detail: null })
  },

  // 空处理器：拦截弹层内部点击，防止冒泡触发遮罩关闭
  noop() {},

  // 复制详情内容到剪贴板
  onCopyDetail() {
    const detail = this.data.detail
    if (!detail) return
    api.copyText(detail.content)
      .then(() => wx.showToast({ title: '已复制', icon: 'none' }))
      .catch(() => wx.showToast({ title: '复制失败', icon: 'none' }))
  },

  // 删除详情条目：确认后按 id 过滤 → 落库 → 刷新 → 关闭弹层
  onDeleteDetail() {
    const detail = this.data.detail
    if (!detail) return
    wx.showModal({
      title: '删除确认',
      content: '删除后不可恢复，确定删除这条知识吗？',
      success: res => {
        if (!res.confirm) return
        const list = api.getKnowledgeBase() || []
        const next = list.filter(item => item.id !== detail.id)
        api.saveKnowledgeBase(next)
        this.setData({ detail: null })
        this.loadList()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  }
})
