// api.js - H5/App 版业务接口统一封装（与小程序版 api.js 同语义，全部走 h5gateway）
import { callCloud, gateway, tempUrls, setUserId, getUserId } from './request.js'

/* ==================== 云函数调用 ==================== */

// 登录/注册（H5 使用匿名 userId，新用户自动送 200 积分）
export function login(payload) {
  return callCloud('login', payload || {})
}

// 钱包信息
export function getWallet() {
  return callCloud('getWallet')
}

// 兑换码充值
export function redeemCode(code) {
  return callCloud('redeemCode', { code })
}

// 备课统计
export function getUserStats() {
  return callCloud('getUserStats')
}

// 教材库
export function getTextbooks(subject) {
  return callCloud('getTextbooks', subject ? { subject } : {})
}

// 热门课题推荐（免费）
export function getInspiration(subject) {
  return callCloud('getInspiration', { subject })
}

/* ==================== AI 生成接口 ==================== */

export function generateLessonPlan(payload) {
  return callCloud('generateLessonPlan', payload)
}

export function generatePPTOutline(payload) {
  return callCloud('generatePPTOutline', payload)
}

export function generateExercises(payload) {
  return callCloud('generateExercises', payload)
}

export function analyzeStudentProfile(payload) {
  return callCloud('analyzeStudentProfile', payload)
}

export function generateCourseware(payload) {
  return callCloud('generateCourseware', payload)
}

export function generateWords(payload) {
  return callCloud('generateWords', payload)
}

export function generateVariants(payload) {
  return callCloud('generateVariants', payload)
}

export function generateImage(payload) {
  return callCloud('generateImage', payload)
}

export function generateSlideImages(payload) {
  return callCloud('generateSlideImages', payload)
}

export function generateLectureScript(payload) {
  return callCloud('generateLectureScript', payload)
}

export function generateCloze(payload) {
  return callCloud('generateCloze', payload)
}

export function generateVideoTask(payload) {
  return callCloud('generateVideoTask', payload)
}

export function queryVideoTask(taskId) {
  return callCloud('queryVideoTask', { taskId })
}

export function exportPPTX(payload) {
  return callCloud('exportPPTX', payload)
}

/* ==================== 保存备课记录（H5 经网关直写云数据库） ==================== */

export function addRecord(collection, data) {
  return gateway('add', { collection, data: data || {} }).then(res => res.data)
}

/* ==================== 云存储 fileID → https 链接 ==================== */

const urlCache = {}

// 单个 fileID 转 https（带缓存；失败返回空串）
export function toHttp(fileID) {
  if (!fileID) return Promise.resolve('')
  if (urlCache[fileID]) return Promise.resolve(urlCache[fileID])
  return tempUrls([fileID])
    .then(list => {
      const hit = (list || []).find(f => f.fileID === fileID)
      const url = hit ? hit.tempFileURL : ''
      if (url) urlCache[fileID] = url
      return url
    })
    .catch(() => '')
}

// 批量转换
export function toHttpList(fileIDs) {
  const ids = (fileIDs || []).filter(Boolean)
  if (!ids.length) return Promise.resolve([])
  return tempUrls(ids)
    .then(list => (list || []).map(f => f.tempFileURL || ''))
    .catch(() => [])
}

/* ==================== 导出 PPTX：下载并打开 ==================== */

// H5：拿到临时链接后新窗口下载；App：uni.downloadFile + uni.openDocument
export function openPPTX(fileID) {
  return toHttp(fileID).then(url => {
    if (!url) throw new Error('获取下载链接失败')
    // #ifdef H5
    window.open(url, '_blank')
    // #endif
    // #ifndef H5
    return uni.downloadFile({ url }).then(res => {
      if (res.statusCode !== 200) throw new Error('下载失败')
      return uni.openDocument({
        filePath: res.tempFilePath,
        fileType: 'pptx',
        showMenu: true
      })
    })
    // #endif
  })
}

/* ==================== 本地用户信息 ==================== */

export function getUser() {
  return uni.getStorageSync('h5_user') || null
}

export function setUser(user) {
  uni.setStorageSync('h5_user', user)
}

/* ==================== 通用工具 ==================== */

export function formatTime(ts) {
  const d = new Date(ts || Date.now())
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

export function copyText(text) {
  return new Promise((resolve, reject) => {
    uni.setClipboardData({ data: text, success: resolve, fail: reject })
  })
}

// AI 调用失败统一处理：code 2 余额不足 → 弹窗引导充值
export function handleAIError(err) {
  const message = (err && err.message) || '操作失败，请稍后重试'
  if (err && err.code === 2) {
    uni.showModal({
      title: '积分不足',
      content: '当前积分余额不足，是否前往充值中心？',
      confirmText: '去充值',
      cancelText: '取消',
      success: res => {
        if (res.confirm) uni.navigateTo({ url: '/pages/recharge/recharge' })
      }
    })
    return
  }
  uni.showToast({ title: message, icon: 'none' })
}

export { setUserId, getUserId }

// 默认导出：兼容页面里 `import api from '../../utils/api.js'` 的写法（api.xxx 调用）
export default {
  login,
  getWallet,
  redeemCode,
  getUserStats,
  getTextbooks,
  getInspiration,
  generateLessonPlan,
  generatePPTOutline,
  generateExercises,
  analyzeStudentProfile,
  generateCourseware,
  generateWords,
  generateVariants,
  generateImage,
  generateSlideImages,
  generateLectureScript,
  generateCloze,
  generateVideoTask,
  queryVideoTask,
  exportPPTX,
  addRecord,
  toHttp,
  toHttpList,
  openPPTX,
  getUser,
  setUser,
  formatTime,
  copyText,
  handleAIError
}
