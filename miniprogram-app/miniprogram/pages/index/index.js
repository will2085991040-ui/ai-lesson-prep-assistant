// pages/index/index.js - 首页
// 问候语 + 每日小提示 + 今日课表 + 快捷入口 + 热门课题推荐 + 最近备课
const { TYPE_NAMES, DAILY_TIPS } = require('../../utils/constants')
const api = require('../../utils/api')

// 首页热门课题可切换的学科（语文/数学/英语）
const HOT_SUBJECTS = ['语文', '数学', '英语']

// 各备课类型的 emoji 图标
const TYPE_EMOJI = {
  lesson_plan: '📄',
  ppt_outline: '🎨',
  courseware: '📽️',
  exercises: '✍️',
  analysis: '📊'
}

// 快捷入口（9 个，3 列网格展示）
const QUICK_ENTRIES = [
  { emoji: '📝', name: '智能备课', desc: '完整教案一键生成', url: '/pages/lesson-plan/lesson-plan' },
  { emoji: '🎨', name: '课件大纲', desc: '课件结构快速梳理', url: '/pages/ppt-outline/ppt-outline' },
  { emoji: '📽️', name: 'AI课件', desc: '一键生成10-50页完整课件', url: '/pages/courseware/courseware' },
  { emoji: '✍️', name: '分层习题', desc: '三层难度精准出题', url: '/pages/exercises/exercises' },
  { emoji: '📊', name: '学情诊断', desc: '雷达图定位薄弱点', url: '/pages/analysis/analysis' },
  { emoji: '📖', name: '单词本', desc: '英语单词随记随背', url: '/pages/words/words' },
  { emoji: '✏️', name: '错题本', desc: '错题变式巩固练习', url: '/pages/mistakes/mistakes' },
  { emoji: '📚', name: '知识库', desc: '教研笔记与资料', url: '/pages/knowledge/knowledge' },
  { emoji: '💡', name: '提示词宝典', desc: 'AI 备课提示词模板', url: '/pages/prompt-book/prompt-book' }
]

// 星期索引（new Date().getDay() 0~6）→ 课表键名
const WEEK_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

Page({
  data: {
    greeting: '',          // 问候语
    dateStr: '',           // 日期字符串
    dailyTip: '',          // 每日备课小提示（按日期轮换）
    todaySlots: [],        // 今日课表课节数组（已排序）
    isEmpty: true,         // 今日课表是否为空
    quickEntries: QUICK_ENTRIES, // 快捷入口列表
    hotSubjects: HOT_SUBJECTS,   // 热门课题学科 chips
    subjectIndex: 0,       // 当前选中的学科索引（默认语文）
    topics: [],            // 热门课题列表
    topicLoading: false,   // 热门课题加载中标志
    history: []            // 最近备课记录（已格式化）
  },

  onLoad() {
    // 计算问候语、日期与每日小提示
    this.setData({
      greeting: this.getGreeting(),
      dateStr: this.getDateStr(),
      dailyTip: this.getDailyTip()
    })
    // 默认加载语文热门课题
    this.loadTopics()
  },

  onShow() {
    // 每次进入页面刷新最近备课与今日课表
    this.loadHistory()
    this.loadSchedule()
  },

  onPullDownRefresh() {
    // 下拉刷新：同步刷新最近备课与课表，再等热门课题请求结束后停止刷新
    this.loadHistory()
    this.loadSchedule()
    this.loadTopics().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 根据当前小时返回问候语
  getGreeting() {
    const h = new Date().getHours()
    if (h >= 5 && h < 12) return '早上好'
    if (h >= 12 && h < 18) return '下午好'
    return '晚上好'
  },

  // 返回 YYYY年M月D日 格式日期
  getDateStr() {
    const d = new Date()
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  },

  // 按日期轮换返回一条每日备课小提示（24 条，每天切换一次）
  getDailyTip() {
    const tipIndex = Math.floor(Date.now() / 86400000) % DAILY_TIPS.length
    return DAILY_TIPS[tipIndex]
  },

  // 加载今日课表（本地缓存），预先算好 todaySlots 与 isEmpty
  loadSchedule() {
    const schedule = api.getSchedule()
    const todayKey = WEEK_KEYS[new Date().getDay()]
    const raw = (schedule && Array.isArray(schedule[todayKey])) ? schedule[todayKey] : []
    // 按「第几节」升序排序，并规整为纯展示字段
    const todaySlots = raw
      .slice()
      .sort((a, b) => Number(a.period) - Number(b.period))
      .map(s => ({ period: s.period, subject: s.subject }))
    this.setData({
      todaySlots,
      isEmpty: todaySlots.length === 0
    })
  },

  // 切换热门课题学科
  onSubjectChange(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.subjectIndex) return
    this.setData({ subjectIndex: index })
    this.loadTopics()
  },

  // 加载热门课题推荐
  loadTopics() {
    const subject = HOT_SUBJECTS[this.data.subjectIndex]
    this.setData({ topicLoading: true })
    return api.getInspiration(subject)
      .then(data => {
        const topics = (data && Array.isArray(data.topics)) ? data.topics : []
        this.setData({ topics })
      })
      .catch(err => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' })
      })
      .then(() => {
        // 无论成功失败都关闭加载中状态
        this.setData({ topicLoading: false })
      })
  },

  // 加载最近备课记录（最近 3 条），预先算好展示字段
  loadHistory() {
    const history = api.getHistory(3).map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      emoji: TYPE_EMOJI[item.type] || '📄',
      typeName: TYPE_NAMES[item.type] || '',
      timeStr: api.formatTime(item.createTime)
    }))
    this.setData({ history })
  },

  // 点击某条热门课题 → 携带学科与课题跳转智能备课
  onTopicTap(e) {
    const index = e.currentTarget.dataset.index
    const topic = this.data.topics[index]
    if (!topic) return
    const subject = HOT_SUBJECTS[this.data.subjectIndex]
    wx.navigateTo({
      url: '/pages/lesson-plan/lesson-plan?subject=' + encodeURIComponent(subject) + '&topic=' + encodeURIComponent(topic.title)
    })
  },

  // 点击某条最近备课记录 → 跳转详情页
  onHistoryTap(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.history[index]
    if (!item) return
    wx.navigateTo({
      url: '/pages/detail/detail?type=' + item.type + '&id=' + item.id
    })
  },

  // 点击快捷入口卡片 → 跳转对应页面
  onQuickTap(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.navigateTo({ url })
  },

  // 去设置课表 → 切换到「我的」tabBar 页
  goSchedule() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  // 查看全部 → 切换到备课库 tabBar 页
  goLibrary() {
    wx.switchTab({ url: '/pages/library/library' })
  }
})
