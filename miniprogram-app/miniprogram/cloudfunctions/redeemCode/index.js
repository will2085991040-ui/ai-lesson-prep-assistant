/**
 * redeemCode 云函数：兑换码充值
 * - 校验兑换码有效性并充值到用户余额
 * - 用户不存在时自动注册（含注册赠送 200 积分）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid

    // 兑换码：去空格、转大写
    const code = String(event.code || '').trim().toUpperCase()
    if (!code) {
      return { code: 1, message: '请输入兑换码' }
    }

    // 查询兑换码
    const codeRes = await db.collection('redeem_codes').where({ code }).limit(1).get()
    if (!codeRes.data || codeRes.data.length === 0) {
      return { code: 1, message: '兑换码不存在，请检查后重试' }
    }

    const rec = codeRes.data[0]
    if (rec.used === true) {
      return { code: 1, message: '该兑换码已被使用' }
    }

    const credits = Number(rec.credits) || 0
    const now = Date.now()

    // 标记兑换码已使用
    await db.collection('redeem_codes').doc(rec._id).update({
      data: { used: true, usedBy: userId, usedAt: now }
    })

    // 查询用户
    const userRes = await db.collection('users').where({ _openid: userId }).limit(1).get()
    let finalBalance

    if (userRes.data && userRes.data.length > 0) {
      // 已存在用户：累加余额
      const user = userRes.data[0]
      await db.collection('users').doc(user._id).update({
        data: {
          balance: _.inc(credits),
          totalRecharge: _.inc(credits)
        }
      })
      finalBalance = (Number(user.balance) || 0) + credits
    } else {
      // 不存在用户：自动注册（注册赠送 200 + 本次兑换）
      const newUser = {
        _openid: userId,
        nickname: '新老师',
        avatarFileID: '',
        balance: 200 + credits,
        totalRecharge: credits,
        totalConsume: 0,
        createdAt: now,
        lastLoginAt: now
      }
      await db.collection('users').add({ data: newUser })

      // 注册赠送流水
      await db.collection('transactions').add({
        data: {
          _openid: userId,
          type: 'recharge',
          credits: 200,
          remark: '新用户注册赠送',
          createTime: now
        }
      })
      finalBalance = 200 + credits
    }

    // 写兑换充值流水
    await db.collection('transactions').add({
      data: {
        _openid: userId,
        type: 'recharge',
        credits,
        remark: '兑换码充值：' + code,
        createTime: now
      }
    })

    return { code: 0, data: { credits, balance: finalBalance }, message: 'ok' }
  } catch (err) {
    console.error('redeemCode 云函数执行失败：', err)
    return { code: 1, message: '兑换失败，请稍后重试' }
  }
}
