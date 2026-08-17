// app.js - 小程序全局入口
// 引入全局常量配置
const { CLOUD_ENV_ID, STORAGE_KEYS } = require('./utils/constants')

App({
  onLaunch() {
    // 初始化微信云开发环境
    if (!wx.cloud) {
      console.error('当前微信基础库版本过低，请使用 2.2.3 及以上版本以使用云开发能力')
    } else {
      wx.cloud.init({
        // 云环境 ID：在云开发控制台查看，留空则使用默认环境
        env: CLOUD_ENV_ID || undefined,
        // 将用户访问记录到用户管理中，方便排查问题
        traceUser: true
      })
    }
    this.globalData = {
      user: null // 当前登录用户信息
    }
    // 静默登录注册：微信 openid 一键登录，新用户自动注册并赠送体验积分
    this.silentLogin()
  },

  // 静默登录：失败不打扰用户（登录失败时 AI 调用会提示）
  silentLogin() {
    // 延迟到云初始化完成后再加载 api 模块（api 模块加载时会创建数据库句柄）
    const api = require('./utils/api')
    api.login()
      .then(user => {
        api.setUser(user)
        this.globalData.user = user
      })
      .catch(err => {
        console.warn('静默登录失败', err)
      })
  }
})
