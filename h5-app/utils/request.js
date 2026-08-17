// request.js - 统一 HTTP 请求封装（uni-app 跨端通用：H5 / App 均可用）
// 全部后端调用都走 h5gateway 云函数（HTTP 触发器），不再依赖 wx.cloud
import config from './config.js'

let userId = ''

// 设置当前用户匿名 ID（App.vue onLaunch 时注入）
export function setUserId(uid) {
  userId = uid
}

export function getUserId() {
  return userId
}

// 统一网关请求（自动注入 userId，返回 {code, data, message}）
export function gateway(action, payload) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: config.GATEWAY_URL,
      method: 'POST',
      timeout: 65000,
      data: Object.assign({ action }, payload || {}, { userId }),
      success(res) {
        let result = res.data
        // H5 的 uni.request 返回字符串，需手动解析；App 端为对象
        if (typeof result === 'string') {
          try {
            result = JSON.parse(result)
          } catch (e) {
            result = {}
          }
        }
        if (result && result.code === 0) return resolve(result)
        const err = new Error((result && result.message) || '服务异常，请稍后重试')
        err.code = result ? result.code : 1
        reject(err)
      },
      fail() {
        const err = new Error('网络连接失败，请检查网络或网关配置')
        err.code = 1
        reject(err)
      }
    })
  })
}

// 调用云函数（经网关转发，自动注入 userId）
export function callCloud(name, data) {
  return gateway('call', { name, data: data || {} }).then(res => res.data)
}

// 批量把云存储 fileID 转成 https 临时链接（H5 无法使用 cloud:// 协议）
export function tempUrls(fileIDs) {
  return gateway('tempUrls', { fileIDs }).then(res => res.data)
}
