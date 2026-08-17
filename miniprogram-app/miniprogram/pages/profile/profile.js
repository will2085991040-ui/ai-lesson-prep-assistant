// pages/profile/profile.js - 我的（tabBar 页）
// 功能：备课统计、我的收藏、提醒设置、使用帮助、清除本地缓存
const { STORAGE_KEYS } = require('../../utils/constants')
const { getUser, setUser, getWallet, login, getUserStats, getFavorites, getSchedule, saveSchedule, formatTime } = require('../../utils/api')

// 类型表情映射
const TYPE_EMOJI = {
  lesson_plan: '📄',
  ppt_outline: '🎨',
  exercises: '✍️',
  analysis: '📊'
}

// 使用帮助 FAQ（静态数组）
const FAQ_LIST = [
  { q: '如何生成教案？', a: '在首页点击「教案」，填写学科、年级、课题等信息后点击生成，AI 会在十几秒内生成一份完整教案。', open: false },
  { q: '如何配置豆包模型？', a: '在云开发控制台的云函数中配置豆包大模型的 API Key 与模型参数，小程序端无需额外配置。', open: false },
  { q: '生成的内容保存在哪里？', a: '点击「保存」后内容会写入云数据库，可在「备课库」中查看与删除；草稿、收藏保存在本机。', open: false },
  { q: '如何删除备课记录？', a: '在「备课库」中向左滑动某条记录，点击露出的红色「删除」按钮并确认即可。', open: false },
  { q: '如何生成分享海报？', a: '打开任意备课详情页，点击底部「生成分享海报」，即可生成海报并保存到相册。', open: false },
  { q: '备课统计如何计算？', a: '统计已保存到云端的教案、课件、习题、学情诊断数量，实时累计显示。', open: false },
  { q: '积分怎么获得？', a: '新用户注册赠送 100 积分；积分不足时可在充值中心使用兑换码充值。', open: false },
  { q: '兑换码怎么用？', a: '进入「我的」→「积分余额」→ 充值中心，输入管理员提供的兑换码即可到账。', open: false },
  { q: 'AI 完整课件怎么生成？', a: '首页点「AI课件」，选好学科年级教材和课题，可选 10-50 页和 6 种课件模板，AI 会生成每页要点+配图建议+讲解词。', open: false },
  { q: '单词本和错题本在哪？', a: '首页快捷入口可直接进入；单词本可手动添加或让 AI 按主题批量生成，错题本可记录共性错题并让 AI 出变式题。', open: false }
]

Page({
  data: {
    stats: { lessonPlans: 0, pptOutlines: 0, coursewares: 0, exercises: 0, analyses: 0, total: 0 }, // 备课统计
    favorites: [],           // 收藏列表（前 20 条）
    favoritesOverflow: false, // 收藏是否超过 20 条
    reminder: { enabled: false, time: '20:00' }, // 提醒设置
    faqList: FAQ_LIST,       // 使用帮助列表
    user: { nickname: '', avatarFileID: '' }, // 当前登录用户（昵称/头像）
    walletBalance: 0,        // 积分余额
    schedule: {},            // 我的课表（本地）
    weekKeys: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], // 星期 key
    weekLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], // 星期中文标签
    activeDay: 0             // 当前选中的星期索引
  },

  onShow() {
    this.loadStats()
    this.loadFavorites()
    this.loadReminder()
    this.loadUser()
    this.loadWallet()
    this.loadSchedule()
  },

  // 加载云端备课统计
  loadStats() {
    getUserStats()
      .then(stats => {
        const lessonPlans = stats.lessonPlans || 0
        const pptOutlines = stats.pptOutlines || 0
        const coursewares = stats.coursewares || 0
        const exercises = stats.exercises || 0
        const analyses = stats.analyses || 0
        const total = stats.total || (lessonPlans + pptOutlines + coursewares + exercises + analyses)
        this.setData({
          stats: { lessonPlans, pptOutlines, coursewares, exercises, analyses, total }
        })
      })
      .catch(err => {
        // 失败保留旧值（初始全 0）
        wx.showToast({ title: err.message || '统计加载失败', icon: 'none' })
      })
  },

  // 加载收藏列表（最多显示前 20 条）
  loadFavorites() {
    const favs = getFavorites()
    const favorites = favs.slice(0, 20).map(f => ({
      ...f,
      emoji: TYPE_EMOJI[f.type] || '📄',
      time: formatTime(f.createTime)
    }))
    this.setData({ favorites, favoritesOverflow: favs.length > 20 })
  },

  // 加载提醒设置
  loadReminder() {
    const reminder = wx.getStorageSync(STORAGE_KEYS.REMINDER) || { enabled: false, time: '20:00' }
    this.setData({ reminder })
  },

  // 点击收藏跳转详情
  onFavoriteTap(e) {
    const index = e.currentTarget.dataset.index
    wx.navigateTo({ url: '/pages/detail/detail?fav=' + index })
  },

  // 每日备课提醒开关
  onReminderSwitch(e) {
    const enabled = e.detail.value
    const reminder = { ...this.data.reminder, enabled }
    this.setData({ reminder })
    wx.setStorageSync(STORAGE_KEYS.REMINDER, reminder)
  },

  // 提醒时间变更
  onTimeChange(e) {
    const time = e.detail.value
    const reminder = { ...this.data.reminder, time }
    this.setData({ reminder })
    wx.setStorageSync(STORAGE_KEYS.REMINDER, reminder)
  },

  // FAQ 展开/收起
  onFaqToggle(e) {
    const index = e.currentTarget.dataset.index
    const key = 'faqList[' + index + '].open'
    this.setData({ [key]: !this.data.faqList[index].open })
  },

  // 加载本地登录用户信息
  loadUser() {
    const user = getUser()
    if (user) {
      this.setData({ user: { nickname: user.nickname || '', avatarFileID: user.avatarFileID || '' } })
    }
  },

  // 加载积分余额（静默失败，保留旧值）
  loadWallet() {
    getWallet()
      .then(w => this.setData({ walletBalance: w.balance || 0 }))
      .catch(() => {})
  },

  // 加载我的课表：有 monday 键直接使用，否则初始化空课表
  loadSchedule() {
    const s = getSchedule()
    let schedule = s
    if (!s || !s.monday) {
      schedule = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
      }
    }
    this.setData({ schedule })
  },

  // 切换星期
  onDayTap(e) {
    this.setData({ activeDay: Number(e.currentTarget.dataset.index) })
  },

  // 课节输入（节次/科目），输入即保存
  onSlotInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const day = this.data.weekKeys[this.data.activeDay]
    this.setData({ ['schedule.' + day + '[' + index + '].' + field]: e.detail.value })
    saveSchedule(this.data.schedule)
  },

  // 添加一节
  onAddSlot() {
    const day = this.data.weekKeys[this.data.activeDay]
    const schedule = this.data.schedule
    const list = (schedule[day] || []).slice()
    const len = list.length
    list.push({ period: '第' + (len + 1) + '节', subject: '' })
    const next = Object.assign({}, schedule, { [day]: list })
    this.setData({ schedule: next })
    saveSchedule(next)
  },

  // 删除一节
  onRemoveSlot(e) {
    const index = Number(e.currentTarget.dataset.index)
    const day = this.data.weekKeys[this.data.activeDay]
    const schedule = this.data.schedule
    const list = (schedule[day] || []).slice()
    list.splice(index, 1)
    const next = Object.assign({}, schedule, { [day]: list })
    this.setData({ schedule: next })
    saveSchedule(next)
  },

  // 跳转单词本
  goWords() {
    wx.navigateTo({ url: '/pages/words/words' })
  },

  // 跳转错题本
  goMistakes() {
    wx.navigateTo({ url: '/pages/mistakes/mistakes' })
  },

  // 跳转个人知识库
  goKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' })
  },

  // 跳转提示词宝典
  goPromptBook() {
    wx.navigateTo({ url: '/pages/prompt-book/prompt-book' })
  },

  // 选择头像：上传到云存储后保存到用户资料
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    wx.cloud.uploadFile({
      cloudPath: 'avatars/' + Date.now() + '.png',
      filePath: tempPath
    })
      .then(res => login({ nickname: this.data.user.nickname, avatarFileID: res.fileID }))
      .then(user => {
        setUser(user)
        this.setData({ user: { nickname: user.nickname || '', avatarFileID: user.avatarFileID || '' } })
        wx.showToast({ title: '头像已更新', icon: 'none' })
      })
      .catch(() => {
        wx.showToast({ title: '头像更新失败', icon: 'none' })
      })
  },

  // 昵称输入（仅本地预览）
  onNicknameInput(e) {
    this.setData({ 'user.nickname': e.detail.value })
  },

  // 昵称失焦保存
  onNicknameBlur() {
    const nickname = (this.data.user.nickname || '').trim()
    if (!nickname) return
    login({ nickname })
      .then(user => {
        setUser(user)
        wx.showToast({ title: '昵称已保存', icon: 'none' })
      })
      .catch(err => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      })
  },

  // 跳转充值中心
  goRecharge() {
    wx.navigateTo({ url: '/pages/recharge/recharge' })
  },

  // 清除本地缓存
  onClearCache() {
    wx.showModal({
      title: '清除本地缓存',
      content: '将清除草稿、浏览历史与收藏，已保存到云端的内容不受影响',
      success: res => {
        if (!res.confirm) return
        // 依次清除各类本地缓存
        const keys = [
          STORAGE_KEYS.DRAFT_LESSON_PLAN,
          STORAGE_KEYS.DRAFT_PPT_OUTLINE,
          STORAGE_KEYS.DRAFT_EXERCISES,
          STORAGE_KEYS.DRAFT_ANALYSIS,
          STORAGE_KEYS.HISTORY,
          STORAGE_KEYS.FAVORITES,
          STORAGE_KEYS.DETAIL_CACHE,
          STORAGE_KEYS.PREFILL,
          STORAGE_KEYS.REMINDER
        ]
        keys.forEach(k => wx.removeStorageSync(k))
        wx.showToast({ title: '已清除', icon: 'none' })
        // 刷新收藏与提醒（统计来自云端，不受影响）
        this.onShow()
      }
    })
  }
})
