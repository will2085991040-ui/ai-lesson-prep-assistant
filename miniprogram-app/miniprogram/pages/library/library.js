// pages/library/library.js - 备课库（tabBar 页）
// 功能：展示全部备课记录，支持按类型筛选、关键词搜索、左滑删除
const { TYPE_COLLECTION, TYPE_NAMES } = require('../../utils/constants')
const { getRecordsAll, getRecordsByType, removeRecord, formatTime } = require('../../utils/api')

// 类型表情映射
const TYPE_EMOJI = {
  lesson_plan: '📄',
  ppt_outline: '🎨',
  courseware: '📽️',
  exercises: '✍️',
  analysis: '📊'
}

Page({
  data: {
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'lesson_plan', name: '教案' },
      { key: 'ppt_outline', name: '课件大纲' },
      { key: 'courseware', name: 'AI课件' },
      { key: 'exercises', name: '习题' },
      { key: 'analysis', name: '学情' }
    ],
    activeTab: 'all',   // 当前选中的类型
    list: [],           // 过滤后展示的列表
    keyword: '',        // 搜索关键词
    loading: false,     // 加载中
    swipedId: '',       // 当前左滑打开的项 id
    startX: 0,          // 触摸起点 X
    startY: 0           // 触摸起点 Y
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh())
  },

  // 加载数据
  loadData(done) {
    const { activeTab } = this.data
    this.setData({ loading: true })
    const req = activeTab === 'all' ? getRecordsAll(60) : getRecordsByType(activeTab)
    req
      .then(docs => {
        // 计算每条记录的展示字段并缓存原始数组
        const rawList = (docs || []).map(doc => this.buildItem(doc))
        this._rawList = rawList
        this.applyFilter(rawList, this.data.keyword)
      })
      .catch(err => {
        this._rawList = []
        this.setData({ list: [], loading: false })
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
      .then(() => {
        this.setData({ loading: false })
        if (typeof done === 'function') done()
      })
  },

  // 构造单条列表项展示数据
  buildItem(doc) {
    // 解析 content（JSON 字符串），失败兜底为空对象
    let contentObj = {}
    try {
      contentObj = JSON.parse(doc.content) || {}
    } catch (e) {
      contentObj = {}
    }
    // 标题取值
    let title = ''
    if (doc.type === 'lesson_plan') {
      title = doc.topic || (contentObj.title || '')
    } else if (doc.type === 'ppt_outline') {
      title = doc.topic || ''
    } else if (doc.type === 'courseware') {
      title = doc.topic || ''
    } else if (doc.type === 'exercises') {
      title = doc.knowledge || ''
    } else if (doc.type === 'analysis') {
      title = doc.topic || ''
    }
    // 副标题（学科·年级，或课题/知识点）
    const metaLine = (doc.subject && doc.grade)
      ? `${doc.subject}·${doc.grade}`
      : (doc.topic || doc.knowledge || '')
    return {
      ...doc,
      title,
      metaLine,
      time: formatTime(doc.createTime),
      typeName: TYPE_NAMES[doc.type] || '',
      typeEmoji: TYPE_EMOJI[doc.type] || '📄'
    }
  },

  // 根据关键词过滤
  applyFilter(rawList, keyword) {
    const kw = (keyword || '').trim().toLowerCase()
    let list = rawList || []
    if (kw) {
      list = list.filter(item => {
        // 在标题、副标题、课题、知识点、学科中模糊匹配（忽略大小写）
        const fields = [item.title, item.metaLine, item.topic, item.knowledge, item.subject]
          .map(v => (v || '').toLowerCase())
        return fields.some(v => v.indexOf(kw) >= 0)
      })
    }
    this.setData({ list })
  },

  // Tab 切换
  onTabChange(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key, keyword: '', swipedId: '' })
    this.loadData()
  },

  // 搜索输入
  onKeywordInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this.applyFilter(this._rawList, keyword)
  },

  // 触摸开始：记录起点
  onTouchStart(e) {
    this._moved = false
    const touch = e.touches[0]
    this.setData({ startX: touch.clientX, startY: touch.clientY })
  },

  // 触摸移动：判断左右滑动
  onTouchMove(e) {
    const touch = e.touches[0]
    const dx = touch.clientX - this.data.startX
    const dy = touch.clientY - this.data.startY
    // 仅当横向位移大于纵向位移时视为横向滑动
    if (Math.abs(dx) > Math.abs(dy)) {
      this._moved = true
      const id = e.currentTarget.dataset.id
      if (dx < -30) {
        // 左滑打开
        if (this.data.swipedId !== id) this.setData({ swipedId: id })
      } else if (dx > 30) {
        // 右滑关闭
        if (this.data.swipedId === id) this.setData({ swipedId: '' })
      }
    }
  },

  // 触摸结束：无操作
  onTouchEnd() {},

  // 点击列表项（无滑动时跳转详情）
  onItemTap(e) {
    // 滑动后不触发点击
    if (this._moved) {
      this._moved = false
      return
    }
    // 若有打开的滑动项，先关闭
    if (this.data.swipedId) {
      this.setData({ swipedId: '' })
      return
    }
    const { id, type } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/detail/detail?type=${type}&id=${id}` })
  },

  // 删除记录
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const item = (this._rawList || []).find(i => i._id === id)
    if (!item) return
    wx.showModal({
      title: '删除确认',
      content: '删除后不可恢复，确定删除吗？',
      success: res => {
        if (!res.confirm) return
        removeRecord(TYPE_COLLECTION[item.type], id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'none' })
            this.setData({ swipedId: '' })
            this.loadData()
          })
          .catch(err => {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' })
          })
      }
    })
  }
})
