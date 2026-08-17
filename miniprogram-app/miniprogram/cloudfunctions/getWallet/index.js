/**
 * getWallet 云函数：获取钱包信息
 * - 返回余额、累计充值、累计消费及最近 20 条流水
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid

    // 查询用户
    const userRes = await db.collection('users').where({ _openid: userId }).limit(1).get()

    if (!userRes.data || userRes.data.length === 0) {
      // 无用户记录：返回空钱包
      return {
        code: 0,
        data: { balance: 0, totalRecharge: 0, totalConsume: 0, transactions: [] },
        message: 'ok'
      }
    }

    const user = userRes.data[0]

    // 查询最近 20 条流水（按时间倒序）
    const txRes = await db.collection('transactions')
      .where({ _openid: userId })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()

    return {
      code: 0,
      data: {
        balance: user.balance || 0,
        totalRecharge: user.totalRecharge || 0,
        totalConsume: user.totalConsume || 0,
        transactions: txRes.data
      },
      message: 'ok'
    }
  } catch (err) {
    console.error('getWallet 云函数执行失败：', err)
    return { code: 1, message: '获取钱包信息失败，请重试' }
  }
}
