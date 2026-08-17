// pages/recharge/recharge.js - 充值中心
// 功能：查看积分余额、兑换码充值、微信支付套餐入口（个人主体仅提示）、积分明细
const { RECHARGE_PACKAGES } = require('../../utils/constants')
const { getWallet, redeemCode, formatTime } = require('../../utils/api')

Page({
  data: {
    balance: 0,           // 当前积分余额
    totalRecharge: 0,     // 累计充值积分
    totalConsume: 0,      // 累计消耗积分
    transactions: [],     // 积分明细（已预计算展示字段）
    code: '',             // 兑换码输入框内容
    redeeming: false,     // 兑换中标记（防连点）
    redeemText: '立即兑换', // 兑换按钮文字
    redeemBtnClass: 'btn btn-primary redeem-btn', // 兑换按钮样式
    packages: RECHARGE_PACKAGES // 充值套餐列表
  },

  // 页面显示时刷新钱包信息
  onShow() {
    this.loadWallet()
  },

  // 加载钱包信息：余额 + 累计充值/消耗 + 积分明细
  loadWallet() {
    getWallet()
      .then(w => {
        // 预计算每一条明细的展示字段（tag 颜色、符号、格式化时间）
        const transactions = (w.transactions || []).map((t, i) => {
          const isRecharge = t.type === 'recharge'
          return {
            key: i,                                  // 列表渲染唯一 key
            remark: t.remark || (isRecharge ? '积分充值' : '积分消耗'),
            time: formatTime(t.createTime),
            creditsText: isRecharge ? '+' + (t.credits || 0) : '' + (t.credits || 0),
            tagClass: isRecharge ? 'tag-green' : 'tag-gray'
          }
        })
        this.setData({
          balance: w.balance || 0,
          totalRecharge: w.totalRecharge || 0,
          totalConsume: w.totalConsume || 0,
          transactions
        })
      })
      .catch(err => {
        // 失败保留旧值
        wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      })
  },

  // 兑换码输入
  onCodeInput(e) {
    this.setData({ code: e.detail.value })
  },

  // 兑换码充值
  onRedeem() {
    const code = (this.data.code || '').trim()
    if (!code) {
      wx.showToast({ title: '请输入兑换码', icon: 'none' })
      return
    }
    if (this.data.redeeming) return // 兑换中防连点
    this.setData({
      redeeming: true,
      redeemText: '兑换中...',
      redeemBtnClass: 'btn btn-primary redeem-btn btn-disabled'
    })
    redeemCode(code)
      .then(res => {
        wx.showModal({
          title: '兑换成功',
          content: '获得 ' + res.credits + ' 积分，当前余额 ' + res.balance,
          showCancel: false
        })
        this.setData({ code: '' }) // 兑换成功后清空输入
        this.loadWallet()          // 刷新钱包信息
      })
      .catch(err => {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' })
      })
      .then(() => {
        // 无论成败都复位兑换按钮状态（兼容低版本基础库，不用 finally）
        this.setData({
          redeeming: false,
          redeemText: '立即兑换',
          redeemBtnClass: 'btn btn-primary redeem-btn'
        })
      })
  },

  // 微信支付（个人主体小程序暂不支持，弹出提示）
  onPay() {
    wx.showModal({
      title: '提示',
      content: '微信支付需要企业主体小程序才能开通。当前为个人主体，请使用兑换码充值（兑换码可联系管理员获取）。',
      showCancel: false
    })
  }
})
