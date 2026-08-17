/**
 * login 云函数：微信一键登录 / 注册
 * - 已注册用户：更新最后登录时间（可选更新昵称、头像）
 * - 新用户：自动注册并赠送 200 积分，同时记录注册赠送流水
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  try {
    // 获取当前调用者的 openid
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    if (!userId) {
      return { code: 1, message: '登录失败，请重试' }
    }

    // 用户昵称（截断到 24 个字符）
    const nickname = String(event.nickname || '').slice(0, 24)
    // 头像云存储 fileID
    const avatarFileID = String(event.avatarFileID || '')

    // 查询用户是否已存在
    const userRes = await db.collection('users').where({ _openid: userId }).limit(1).get()

    if (userRes.data && userRes.data.length > 0) {
      // 已存在用户：更新最后登录时间及可选资料
      const user = userRes.data[0]
      const updateData = { lastLoginAt: Date.now() }
      if (nickname) updateData.nickname = nickname
      if (avatarFileID) updateData.avatarFileID = avatarFileID

      await db.collection('users').doc(user._id).update({ data: updateData })

      // 合并返回最新用户对象
      const merged = Object.assign({}, user, updateData)
      return { code: 0, data: merged, message: 'ok' }
    }

    // 不存在：注册新用户，赠送 200 积分
    const now = Date.now()
    const newUser = {
      _openid: userId,
      nickname: nickname || '新老师',
      avatarFileID: avatarFileID || '',
      balance: 200,           // 注册赠送积分
      totalRecharge: 0,
      totalConsume: 0,
      createdAt: now,
      lastLoginAt: now
    }
    const addRes = await db.collection('users').add({ data: newUser })

    // 记录注册赠送流水
    await db.collection('transactions').add({
      data: {
        _openid: userId,
        type: 'recharge',
        credits: 200,
        remark: '新用户注册赠送',
        createTime: now
      }
    })

    return { code: 0, data: Object.assign({}, newUser, { _id: addRes._id }), message: 'ok' }
  } catch (err) {
    console.error('login 云函数执行失败：', err)
    return { code: 1, message: '登录失败，请重试' }
  }
}
