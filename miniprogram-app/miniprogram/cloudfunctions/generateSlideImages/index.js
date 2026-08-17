/**
 * generateSlideImages 云函数：批量生成课件页面配图
 * - 调用火山方舟豆包生图接口（images/generations）
 * - 单张失败不影响其他张；成功后按实际成功张数扣费并写入流水
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 豆包生图接口地址
const ARK_IMAGE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'

// 环境变量读取（process.env 优先，env.local.js 兜底）
let LOCAL_ENV = {}
try { LOCAL_ENV = require('./env.local.js') || {} } catch (e) { LOCAL_ENV = {} }
function getEnv(name) { return process.env[name] || LOCAL_ENV[name] || '' }

// 每张配图消耗的积分
const CREDIT_PER_IMAGE = 25
// 单次最多生成配图的页数
const MAX_BATCH = 6

// 余额预检：余额低于单张价格 → code 2；用户不存在 → code 1
async function ensureBalance(openid) {
  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = res.data && res.data[0]
    if (!user) return { ok: false, code: 1, message: '请先登录后再使用' }
    if ((user.balance || 0) < CREDIT_PER_IMAGE) {
      return { ok: false, code: 2, message: '积分余额不足，请先充值', user }
    }
    return { ok: true, user }
  } catch (e) {
    console.error('查询用户余额失败', e)
    return { ok: false, code: 1, message: '账户服务暂不可用，请稍后重试' }
  }
}

// 成功后按实际成功张数扣费 + 写流水（尽力而为，失败仅记日志）
async function chargeCredits(user, count) {
  const cost = CREDIT_PER_IMAGE * count
  try {
    await db.collection('users').doc(user._id).update({
      data: { balance: _.inc(-cost), totalConsume: _.inc(cost) }
    })
  } catch (e) { console.error('扣除积分失败', e) }
  try {
    await db.collection('transactions').add({
      data: { _openid: user._openid, type: 'consume', credits: -cost, remark: '生成课件配图×' + count, createTime: Date.now() }
    })
  } catch (e) { console.error('写入积分流水失败', e) }
}

// api_logs 记录（生图接口无 usage，tokens 记 0；尽力而为）
async function logApi(func, tokens, success, message) {
  try {
    await db.collection('api_logs').add({
      data: { func, tokens: tokens || 0, success: !!success, message: message || '', createTime: Date.now() }
    })
  } catch (e) { console.error('写入 api_logs 失败', e) }
}

// 生成单张配图：调用生图接口（失败则用 1024x1024 重试一次），成功后上传云存储
async function genOne(i, prompt, openid, apiKey, endpointId) {
  // ① 调用生图接口（16:9 横版 1280x720）
  let resp
  try {
    resp = await axios.post(
      ARK_IMAGE_URL,
      { model: endpointId, prompt, size: '1280x720', response_format: 'b64_json', watermark: false },
      { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, timeout: 40000 }
    )
  } catch (e) {
    console.error('第' + (i + 1) + '张配图接口调用失败', e && e.message)
  }
  let b64 = resp && resp.data && resp.data.data && resp.data.data[0] && resp.data.data[0].b64_json
  // ② 请求失败或未返回 b64_json → 用 1024x1024 重试一次
  if (!b64) {
    try {
      resp = await axios.post(
        ARK_IMAGE_URL,
        { model: endpointId, prompt, size: '1024x1024', response_format: 'b64_json', watermark: false },
        { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, timeout: 40000 }
      )
    } catch (e) {
      console.error('第' + (i + 1) + '张配图重试失败', e && e.message)
    }
    b64 = resp && resp.data && resp.data.data && resp.data.data[0] && resp.data.data[0].b64_json
  }
  // ③ 仍失败 → 返回单张失败标记（不影响其他张）
  if (!b64) return { index: i, error: 'fail' }
  // ④ 上传云存储，返回 fileID
  try {
    const buffer = Buffer.from(b64, 'base64')
    const cloudPath = 'covers/slides/' + openid + '-' + Date.now() + '-' + i + '.png'
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    return { index: i, fileID: uploadRes.fileID }
  } catch (e) {
    console.error('第' + (i + 1) + '张配图上传失败', e)
    return { index: i, error: 'fail' }
  }
}

exports.main = async (event) => {
  try {
    // ① 校验环境变量，缺失则直接返回，不抛异常
    const apiKey = getEnv('ARK_API_KEY')
    const endpointId = getEnv('ARK_ENDPOINT_ID_IMAGE')
    if (!apiKey || !endpointId) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_IMAGE' }
    }

    // ② 校验 slides（最多 MAX_BATCH 张）
    const slides = Array.isArray(event.slides) ? event.slides.slice(0, MAX_BATCH) : []
    if (slides.length < 1) {
      return { code: 1, message: '没有需要生成配图的页面' }
    }

    // ③ 余额预检（余额低于单张价格 → code 2，由前端引导充值）
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    // ④ 逐张拼接配图提示词
    const prompts = slides.map(s => {
      const item = s || {}
      return '请为课件页面生成一张配图（16:9 横版，适合课堂投屏展示）：\n' +
        '【页面主题】' + String(item.title || '') + '\n' +
        '【页面要点】' + String(item.content || '').slice(0, 100) + '\n' +
        '【配图要求】' + String(item.imagePrompt || item.visual || '清新扁平插画') + '\n' +
        '【排版布局】' + String(item.layout || '标题居上，内容居左，插画居右') + '\n' +
        '【整体风格】' + String(event.style || '清新扁平插画风') + '，配色明快、界面简洁、文字清晰可读。'
    })

    // ⑤ 并发调用（每张独立，单张失败不影响其他）
    const results = await Promise.all(
      prompts.map((prompt, i) => genOne(i, prompt, userId, apiKey, endpointId))
    )

    // ⑥ 汇总：成功 = 返回了 fileID 的结果
    const success = results.filter(r => r && r.fileID)
    if (success.length === 0) {
      await logApi('generateSlideImages', 0, false, '配图生成失败')
      return { code: 1, message: '配图生成失败，请稍后重试' }
    }

    // ⑦ 按实际成功张数扣费 + 记录日志
    await chargeCredits(bal.user, success.length)
    await logApi('generateSlideImages', 0, true, 'ok')

    return { code: 0, data: success, message: 'ok' }
  } catch (e) {
    console.error('generateSlideImages 执行异常', e)
    await logApi('generateSlideImages', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: '配图生成失败，请稍后重试' }
  }
}
