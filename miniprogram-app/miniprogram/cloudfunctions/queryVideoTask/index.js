/**
 * queryVideoTask 云函数：轮询查询视频生成任务 + 成功后下载上传 + 扣费
 * - 配合 generateVideoTask 使用：任务提交后由前端定时调用本函数查询状态
 * - 视频生成耗时 1-5 分钟，超过云函数 60 秒上限，因此查询与下载拆到独立函数
 * - 状态流转：queued / running → 返回 processing 供前端继续轮询；
 *   succeeded → 下载视频、上传云存储、扣费、更新任务记录；
 *   failed → 更新任务记录并返回失败
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 火山方舟视频生成任务查询接口地址前缀
const ARK_VIDEO_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'

// 视频生成成功后扣除的积分
const CREDIT_COST = 120

// 环境变量读取块：优先 process.env，兜底读 env.local.js
let LOCAL_ENV = {}
try { LOCAL_ENV = require('./env.local.js') || {} } catch (e) { LOCAL_ENV = {} }
function getEnv(name) { return process.env[name] || LOCAL_ENV[name] || '' }

/**
 * 扣费：更新用户余额并写入消费流水（尽力而为：失败仅记日志，不影响返回结果）
 * @param {string} openid 用户 openid
 * @param {string} remark 消费流水备注
 */
async function chargeCredits(openid, remark) {
  try {
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = userRes.data && userRes.data[0]
    if (user) {
      await db.collection('users').doc(user._id).update({
        data: {
          balance: _.inc(-CREDIT_COST),
          totalConsume: _.inc(CREDIT_COST)
        }
      })
    }
  } catch (e) {
    console.error('扣除积分失败：', e)
  }
  try {
    await db.collection('transactions').add({
      data: {
        _openid: openid,
        type: 'consume',
        credits: -CREDIT_COST,
        remark: remark || '生成课件小视频',
        createTime: Date.now()
      }
    })
  } catch (e) {
    console.error('写入积分流水失败：', e)
  }
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
    // ① 校验任务 ID
    const taskId = String(event.taskId || '').trim()
    if (!taskId) {
      return { code: 1, message: '缺少任务ID' }
    }

    // ② 校验 API Key（查询仅需 Key，无需视频接入点）
    const apiKey = getEnv('ARK_API_KEY')
    if (!apiKey) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY' }
    }

    // ③ 查询火山方舟视频生成任务状态
    let queryResp
    try {
      queryResp = await axios.get(
        ARK_VIDEO_URL + '/' + encodeURIComponent(taskId),
        {
          headers: { Authorization: 'Bearer ' + apiKey },
          timeout: 20000
        }
      )
    } catch (e) {
      console.error('视频任务查询接口调用失败：', e && e.message)
      await logApi(userId, 'queryVideoTask', 0, false, '接口调用失败')
      return { code: 1, message: '查询失败，请稍后重试' }
    }

    const status = queryResp.data && queryResp.data.status

    // ④-1 生成失败：更新任务记录并返回失败
    if (status === 'failed') {
      try {
        await db.collection('video_tasks').where({ taskId }).update({
          data: { status: 'failed' }
        })
      } catch (e) {
        console.error('更新 video_tasks 失败：', e)
      }
      await logApi(userId, 'queryVideoTask', 0, false, '视频生成失败')
      return { code: 1, message: '视频生成失败，请重试' }
    }

    // ④-2 排队中 / 生成中：返回 processing，由前端继续轮询
    if (status === 'queued' || status === 'running') {
      await logApi(userId, 'queryVideoTask', 0, true, 'processing')
      return { code: 0, data: { status: 'processing' }, message: 'ok' }
    }

    // ④-3 生成成功：下载视频 → 上传云存储 → 扣费 → 更新任务记录
    if (status === 'succeeded') {
      // 防重复：若该任务已成功处理过，直接返回已有 fileID，避免重复下载/重复扣费
      try {
        const existRes = await db.collection('video_tasks').where({ taskId }).limit(1).get()
        const exist = existRes.data && existRes.data[0]
        if (exist && exist.status === 'succeeded' && exist.fileID) {
          return { code: 0, data: { status: 'succeeded', fileID: exist.fileID }, message: 'ok' }
        }
      } catch (e) {
        console.error('查询 video_tasks 失败：', e)
      }

      // 取视频下载地址
      const videoUrl = queryResp.data.content && queryResp.data.content[0] && queryResp.data.content[0].video_url
      if (!videoUrl) {
        await logApi(userId, 'queryVideoTask', 0, false, '接口未返回视频地址')
        return { code: 1, message: '视频下载失败，请稍后重试' }
      }

      // 下载视频：responseType 为 arraybuffer，Node 环境下 data 为 Buffer；
      // 若个别网关返回的是包装对象，则取 data.data
      let buffer
      try {
        const dlResp = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 })
        buffer = Buffer.isBuffer(dlResp.data) ? dlResp.data : Buffer.from(dlResp.data.data || dlResp.data)
      } catch (e) {
        console.error('视频下载失败：', e && e.message)
        await logApi(userId, 'queryVideoTask', 0, false, '视频下载失败')
        return { code: 1, message: '视频下载失败，请稍后重试' }
      }

      // 上传云存储
      let uploadRes
      try {
        const cloudPath = 'videos/' + userId + '-' + Date.now() + '.mp4'
        uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer })
      } catch (e) {
        console.error('云存储上传失败：', e)
        await logApi(userId, 'queryVideoTask', 0, false, '上传失败')
        return { code: 1, message: '视频下载失败，请稍后重试' }
      }

      // 成功后扣费（尽力而为，失败不影响返回）
      await chargeCredits(userId, '生成课件小视频')

      // 更新 video_tasks 记录
      try {
        await db.collection('video_tasks').where({ taskId }).update({
          data: { status: 'succeeded', fileID: uploadRes.fileID }
        })
      } catch (e) {
        console.error('更新 video_tasks 失败：', e)
      }

      await logApi(userId, 'queryVideoTask', 0, true, 'ok')
      return { code: 0, data: { status: 'succeeded', fileID: uploadRes.fileID }, message: 'ok' }
    }

    // ④-4 未知状态
    await logApi(userId, 'queryVideoTask', 0, false, '未知状态: ' + String(status))
    return { code: 1, message: '查询失败，请稍后重试' }
  } catch (err) {
    console.error('queryVideoTask 云函数执行失败：', err)
    await logApi(userId, 'queryVideoTask', 0, false, '异常')
    return { code: 1, message: '查询失败，请稍后重试' }
  }
}
