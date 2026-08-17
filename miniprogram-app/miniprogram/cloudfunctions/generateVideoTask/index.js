/**
 * generateVideoTask 云函数：提交豆包视频生成任务（异步任务模式）
 * - 调用火山方舟视频生成接口（seedance 等）提交任务，返回任务 ID
 * - 视频生成耗时 1-5 分钟，超过云函数 60 秒上限，因此拆分为两个函数：
 *   本函数（提交任务）+ queryVideoTask（轮询查询、成功后下载上传并扣费）
 * - 提交前仅预检余额，不扣费；扣费在 queryVideoTask 视频生成成功后执行
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 火山方舟视频生成任务提交接口地址
const ARK_VIDEO_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'

// 视频生成成功后扣除的积分（实际扣费在 queryVideoTask 中执行）
const CREDIT_COST = 120

// 环境变量读取块：优先 process.env，兜底读 env.local.js
let LOCAL_ENV = {}
try { LOCAL_ENV = require('./env.local.js') || {} } catch (e) { LOCAL_ENV = {} }
function getEnv(name) { return process.env[name] || LOCAL_ENV[name] || '' }

/**
 * 预检余额是否充足（只校验不扣费）
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
 * 记录接口调用日志（视频接口无 usage，tokens 记 0）
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
    // ① 校验环境变量：API Key 与视频接入点
    const apiKey = getEnv('ARK_API_KEY')
    const endpointId = getEnv('ARK_ENDPOINT_ID_VIDEO')
    if (!apiKey || !endpointId) {
      return { code: 1, message: '视频模型尚未开通配置，请先在方舟开通豆包视频模型（seedance）并创建接入点后填入 ARK_ENDPOINT_ID_VIDEO' }
    }

    // ② 校验视频描述
    const prompt = String(event.prompt || '').trim()
    if (!prompt) {
      return { code: 1, message: '缺少视频描述' }
    }

    // ③ 预检余额（积分 ≥ 50 才允许提交；只预检不扣费，扣费在 queryVideoTask 成功后执行）
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    // ④ 调用火山方舟视频生成接口提交任务
    let taskResp
    try {
      taskResp = await axios.post(
        ARK_VIDEO_URL,
        {
          model: endpointId,
          content: [{ type: 'text', text: prompt }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey
          },
          timeout: 20000
        }
      )
    } catch (e) {
      console.error('视频任务提交接口调用失败：', e && e.message)
      await logApi(userId, 'generateVideoTask', 0, false, '接口调用失败')
      return { code: 1, message: '视频任务提交失败，请稍后重试' }
    }

    // 提取任务 ID；接口未返回 id 视为提交失败
    const taskId = taskResp.data && taskResp.data.id
    if (!taskId) {
      await logApi(userId, 'generateVideoTask', 0, false, '接口未返回任务ID')
      return { code: 1, message: '视频任务提交失败，请稍后重试' }
    }

    // ⑤ 把任务记录写入 video_tasks 集合（写库失败仅记日志，不影响返回）
    try {
      await db.collection('video_tasks').add({
        data: {
          _openid: userId,
          taskId,
          topic: String(event.topic || ''),
          createTime: Date.now(),
          status: 'queued',
          fileID: ''
        }
      })
    } catch (e) {
      console.error('写入 video_tasks 失败：', e)
    }

    // ⑥ 返回任务 ID
    await logApi(userId, 'generateVideoTask', 0, true, 'ok')
    return { code: 0, data: { taskId }, message: 'ok' }
  } catch (err) {
    console.error('generateVideoTask 云函数执行失败：', err)
    await logApi(userId, 'generateVideoTask', 0, false, '异常')
    return { code: 1, message: '视频任务提交失败，请稍后重试' }
  }
}
