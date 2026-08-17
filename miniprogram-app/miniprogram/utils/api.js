// api.js - 云函数调用与云数据库访问的统一封装
// 页面一律通过本模块访问后端，不直接写 wx.cloud 调用
const { STORAGE_KEYS, TYPE_COLLECTION, PAGE_SIZE } = require('./constants')

// 云数据库句柄（app.js 中已完成 wx.cloud.init，页面模块加载晚于 App 启动）
const db = wx.cloud.database()

/* ==================== 云函数调用 ==================== */

// 统一调用云函数：约定返回 { code, data, message }
// code === 0 时 resolve(data)；否则 reject 一个友好错误（err.code 保留业务码，2 表示余额不足）
function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then(res => {
    const result = res && res.result
    if (result && result.code === 0) return result.data
    const message = (result && result.message) || '服务开小差了，请稍后重试'
    const err = new Error(message)
    err.code = result ? result.code : 1
    throw err
  })
}

// AI 生成完整教案（PRO 模型）
function generateLessonPlan(payload) {
  return callCloud('generateLessonPlan', payload)
}

// AI 生成课件大纲（32K 模型）
function generatePPTOutline(payload) {
  return callCloud('generatePPTOutline', payload)
}

// AI 生成分层习题（32K 模型）
function generateExercises(payload) {
  return callCloud('generateExercises', payload)
}

// AI 学情诊断（PRO 模型）
function analyzeStudentProfile(payload) {
  return callCloud('analyzeStudentProfile', payload)
}

// 热门课题推荐（32K 模型）
function getInspiration(subject) {
  return callCloud('getInspiration', { subject })
}

// 备课统计
function getUserStats() {
  return callCloud('getUserStats')
}

// 登录/注册（微信 openid 一键登录，新用户自动注册并赠送积分）
function login(payload) {
  return callCloud('login', payload || {})
}

// 钱包信息：余额 + 累计充值/消耗 + 最近积分流水
function getWallet() {
  return callCloud('getWallet')
}

// 兑换码充值
function redeemCode(code) {
  return callCloud('redeemCode', { code })
}

// 教材库列表（可选按学科过滤）
function getTextbooks(subject) {
  return callCloud('getTextbooks', subject ? { subject } : {})
}

// AI 生成课件封面图（豆包生图模型）
function generateImage(payload) {
  return callCloud('generateImage', payload)
}

// AI 一键生成完整课件（10-50 页，含讲解词，DeepSeek）
function generateCourseware(payload) {
  return callCloud('generateCourseware', payload)
}

// AI 生成单词表（DeepSeek）
function generateWords(payload) {
  return callCloud('generateWords', payload)
}

// AI 生成错题变式题（DeepSeek）
function generateVariants(payload) {
  return callCloud('generateVariants', payload)
}

// AI 批量生成课件页面配图（豆包生图，每张 15 积分）
function generateSlideImages(payload) {
  return callCloud('generateSlideImages', payload)
}

// 导出真正的 PPTX 文件（pptxgenjs 云端生成，返回云存储 fileID）
function exportPPTX(payload) {
  return callCloud('exportPPTX', payload)
}

// AI 生成说课稿（DeepSeek，15 积分）
function generateLectureScript(payload) {
  return callCloud('generateLectureScript', payload)
}

// AI 生成随堂挖空练习（DeepSeek，15 积分）
function generateCloze(payload) {
  return callCloud('generateCloze', payload)
}

// 提交课件小视频生成任务（豆包视频模型，50 积分）
function generateVideoTask(payload) {
  return callCloud('generateVideoTask', payload)
}

// 查询视频任务状态（succeeded 时返回 fileID）
function queryVideoTask(taskId) {
  return callCloud('queryVideoTask', { taskId })
}

/* ==================== 云数据库读写 ==================== */

// 新增一条记录（自动补充创建时间）
function addRecord(collection, data) {
  return db.collection(collection).add({
    data: { ...data, createTime: data.createTime || Date.now() }
  })
}

// 按 ID 读取一条记录
function getRecordById(collection, id) {
  return db.collection(collection).doc(id).get().then(res => res.data)
}

// 按 ID 删除一条记录
function removeRecord(collection, id) {
  return db.collection(collection).doc(id).remove()
}

// 按业务类型读取列表（附带 type 字段，按创建时间倒序）
function getRecordsByType(type, limit = PAGE_SIZE) {
  const collection = TYPE_COLLECTION[type]
  if (!collection) return Promise.resolve([])
  return db.collection(collection)
    .orderBy('createTime', 'desc')
    .limit(limit)
    .get()
    .then(res => res.data.map(doc => ({ ...doc, type })))
}

// 读取全部四种类型并合并按时间倒序
function getRecordsAll(limit = PAGE_SIZE) {
  const tasks = Object.keys(TYPE_COLLECTION).map(type =>
    getRecordsByType(type, limit).catch(() => [])
  )
  return Promise.all(tasks).then(groups => {
    return groups
      .reduce((all, list) => all.concat(list), [])
      .sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
      .slice(0, limit)
  })
}

/* ==================== 本地历史记录 ==================== */

// 写入最近备课记录（最多保留 10 条，按 id 去重）
function pushHistory(item) {
  const list = wx.getStorageSync(STORAGE_KEYS.HISTORY) || []
  const next = [item, ...list.filter(i => i.id !== item.id)].slice(0, 10)
  wx.setStorageSync(STORAGE_KEYS.HISTORY, next)
  return next
}

// 读取最近备课记录（默认最近 3 条）
function getHistory(n = 3) {
  return (wx.getStorageSync(STORAGE_KEYS.HISTORY) || []).slice(0, n)
}

/* ==================== 本地收藏 ==================== */

function getFavorites() {
  return wx.getStorageSync(STORAGE_KEYS.FAVORITES) || []
}

function isFavorite(id) {
  return getFavorites().some(f => f.id === id)
}

// 切换收藏状态，返回 { added, favorites }
function toggleFavorite(item) {
  const list = getFavorites()
  const idx = list.findIndex(f => f.id === item.id)
  let added = false
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    list.unshift(item)
    added = true
  }
  wx.setStorageSync(STORAGE_KEYS.FAVORITES, list)
  return { added, favorites: list }
}

/* ==================== 表单草稿 ==================== */

function saveDraft(key, data) {
  wx.setStorageSync(key, data)
}

function getDraft(key) {
  const value = wx.getStorageSync(key)
  return value || null
}

function clearDraft(key) {
  wx.removeStorageSync(key)
}

/* ==================== 本地用户信息 ==================== */

function getUser() {
  return wx.getStorageSync(STORAGE_KEYS.USER) || null
}

function setUser(user) {
  wx.setStorageSync(STORAGE_KEYS.USER, user)
}

/* ==================== 单词本 / 错题本 / 课表（本地存储） ==================== */

function getWordBook() {
  return wx.getStorageSync(STORAGE_KEYS.WORDS) || []
}

function saveWordBook(list) {
  wx.setStorageSync(STORAGE_KEYS.WORDS, list)
}

function getMistakeBook() {
  return wx.getStorageSync(STORAGE_KEYS.MISTAKES) || []
}

function saveMistakeBook(list) {
  wx.setStorageSync(STORAGE_KEYS.MISTAKES, list)
}

function getSchedule() {
  return wx.getStorageSync(STORAGE_KEYS.SCHEDULE) || null
}

function saveSchedule(data) {
  wx.setStorageSync(STORAGE_KEYS.SCHEDULE, data)
}

// 个人知识库（本地存储）
function getKnowledgeBase() {
  return wx.getStorageSync(STORAGE_KEYS.KNOWLEDGE) || []
}

function saveKnowledgeBase(list) {
  wx.setStorageSync(STORAGE_KEYS.KNOWLEDGE, list)
}

/* ==================== 通用工具 ==================== */

// 格式化时间：YYYY-MM-DD HH:mm
function formatTime(ts) {
  const d = new Date(ts || Date.now())
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 复制文本到剪贴板（Promise 化）
function copyText(text) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({ data: text, success: resolve, fail: reject })
  })
}

// AI 调用失败的统一处理：
// code === 2（余额不足）→ 弹窗引导前往充值中心；其余 → toast 展示错误信息
function handleAIError(err) {
  const message = (err && err.message) || '操作失败，请稍后重试'
  if (err && err.code === 2) {
    wx.showModal({
      title: '积分不足',
      content: '当前积分余额不足，是否前往充值中心？',
      confirmText: '去充值',
      cancelText: '取消',
      success: res => {
        if (res.confirm) wx.navigateTo({ url: '/pages/recharge/recharge' })
      }
    })
    return
  }
  wx.showToast({ title: message, icon: 'none' })
}

module.exports = {
  callCloud,
  generateLessonPlan,
  generatePPTOutline,
  generateExercises,
  analyzeStudentProfile,
  getInspiration,
  getUserStats,
  login,
  getWallet,
  redeemCode,
  getTextbooks,
  generateImage,
  generateCourseware,
  generateWords,
  generateVariants,
  generateSlideImages,
  exportPPTX,
  generateLectureScript,
  generateCloze,
  generateVideoTask,
  queryVideoTask,
  addRecord,
  getRecordById,
  removeRecord,
  getRecordsByType,
  getRecordsAll,
  pushHistory,
  getHistory,
  getFavorites,
  isFavorite,
  toggleFavorite,
  saveDraft,
  getDraft,
  clearDraft,
  getUser,
  setUser,
  getWordBook,
  saveWordBook,
  getMistakeBook,
  saveMistakeBook,
  getSchedule,
  saveSchedule,
  getKnowledgeBase,
  saveKnowledgeBase,
  formatTime,
  copyText,
  handleAIError
}
