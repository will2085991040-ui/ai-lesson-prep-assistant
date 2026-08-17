/**
 * generateImage 云函数：豆包生图 + 上传云存储 + 扣费
 * - 调用火山方舟豆包生图接口生成图片
 * - 上传至云存储并扣除积分
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 豆包生图接口地址
const ARK_IMAGE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

// 环境变量读取块：优先 process.env，兜底读 env.local.js
let LOCAL_ENV = {}
try { LOCAL_ENV = require('./env.local.js') || {} } catch (e) { LOCAL_ENV = {} }
function getEnv(name) { return process.env[name] || LOCAL_ENV[name] || '' }

// 生图扣费积分
const CREDIT_COST = 25

/**
 * 校验余额是否充足
 * 返回 { ok: true, user } 或 { ok: false, code, message }
 */
async function ensureBalance(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const user = userRes.data && userRes.data[0]
  if (!user || (Number(user.balance) || 0) < CREDIT_COST) {
    return { ok: false, code: 2, message: '积分余额不足，请先充值' }
  }
  return { ok: true, user }
}

/**
 * 扣费：更新用户余额并写入消费流水（尽力而为：失败仅记日志，不影响返回结果）
 */
async function chargeCredits(user, remark) {
  try {
    await db.collection('users').doc(user._id).update({
      data: {
        balance: _.inc(-CREDIT_COST),
        totalConsume: _.inc(CREDIT_COST)
      }
    })
  } catch (e) {
    console.error('扣除积分失败：', e)
  }
  try {
    await db.collection('transactions').add({
      data: {
        _openid: user._openid,
        type: 'consume',
        credits: -CREDIT_COST,
        remark: remark || '生成封面图',
        createTime: Date.now()
      }
    })
  } catch (e) {
    console.error('写入积分流水失败：', e)
  }
}

/**
 * 记录接口调用日志（生图接口无 usage，tokens 记 0）
 */
async function logApi(userId, func, tokens, success, message) {
  try {
    await db.collection('api_logs').add({
      data: {
        _openid: userId,
        func,
        tokens: tokens || 0,
        success: !!success,
        message: message || '',
        createTime: Date.now()
      }
    })
  } catch (e) {
    console.error('写入 api_logs 失败：', e)
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
  try {

    // ① 校验环境变量
    const apiKey = getEnv('ARK_API_KEY')
    const endpointId = getEnv('ARK_ENDPOINT_ID_IMAGE')
    if (!apiKey || !endpointId) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_IMAGE' }
    }

    // ② 校验图片描述
    const prompt = String(event.prompt || '').trim()
    if (!prompt) {
      return { code: 1, message: '缺少图片描述' }
    }

    // ③ 余额校验（余额不足返回 code 2）
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    // ④ 调用豆包生图接口
    let imageResp
    try {
      imageResp = await axios.post(
        ARK_IMAGE_URL,
        {
          model: endpointId,
          prompt,
          size: '1024x1024',
          response_format: 'b64_json',
          watermark: false
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey
          },
          timeout: 30000
        }
      )
    } catch (e) {
      console.error('豆包生图接口调用失败：', e && e.message)
      await logApi(userId, 'generateImage', 0, false, '接口调用失败')
      return { code: 1, message: '图片生成失败，请稍后重试' }
    }

    // ⑤ 提取 base64 图片数据
    const b64 = imageResp.data && imageResp.data.data && imageResp.data.data[0] && imageResp.data.data[0].b64_json
    if (!b64) {
      await logApi(userId, 'generateImage', 0, false, '接口未返回图片数据')
      return { code: 1, message: '图片生成失败，请稍后重试' }
    }

    // ⑥ 上传云存储
    const buffer = Buffer.from(b64, 'base64')
    const cloudPath = 'covers/' + userId + '-' + Date.now() + '.png'
    let uploadRes
    try {
      uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    } catch (e) {
      console.error('云存储上传失败：', e)
      await logApi(userId, 'generateImage', 0, false, '上传失败')
      return { code: 1, message: '图片生成失败，请稍后重试' }
    }

    // ⑦ 成功后扣费 + 记录日志
    await chargeCredits(bal.user, '生成封面图')
    await logApi(userId, 'generateImage', 0, true, 'ok')

    // ⑧ 返回 fileID
    return { code: 0, data: { fileID: uploadRes.fileID }, message: 'ok' }
  } catch (err) {
    console.error('generateImage 云函数执行失败：', err)
    await logApi(userId, 'generateImage', 0, false, '异常')
    return { code: 1, message: '图片生成失败，请稍后重试' }
  }
}
