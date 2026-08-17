/**
 * generatePPTOutline 云函数
 * 功能：调用豆包大模型（32K 模型）生成课件大纲
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ==================== 环境变量读取（优先云函数环境变量，其次本地 env.local.js 兜底） ====================
let LOCAL_ENV = {}
try {
  LOCAL_ENV = require('./env.local.js') || {}
} catch (e) {
  LOCAL_ENV = {}
}
// 读取环境变量：优先 process.env，缺失时回退到本地配置文件
function getEnv(name) {
  return process.env[name] || LOCAL_ENV[name] || ''
}

// ==================== 积分计费（每次 AI 调用消耗固定积分） ====================
const CREDIT_COST = 15 // 本函数每次成功调用消耗的积分

// 余额校验：余额不足返回 code 2（前端会引导跳转充值页）
async function ensureBalance(openid) {
  const db = cloud.database()
  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = res.data && res.data[0]
    if (!user) return { ok: false, code: 1, message: '请先登录后再使用' }
    if ((user.balance || 0) < CREDIT_COST) {
      return { ok: false, code: 2, message: '积分余额不足，请先充值', user }
    }
    return { ok: true, user }
  } catch (e) {
    console.error('查询用户余额失败', e)
    return { ok: false, code: 1, message: '账户服务暂不可用，请稍后重试' }
  }
}

// 扣费并写流水（生成成功后调用；失败仅记日志，不影响主流程）
async function chargeCredits(user, remark) {
  const db = cloud.database()
  try {
    await db.collection('users').doc(user._id).update({
      data: {
        balance: db.command.inc(-CREDIT_COST),
        totalConsume: db.command.inc(CREDIT_COST)
      }
    })
  } catch (e) {
    console.error('扣除积分失败', e)
  }
  try {
    await db.collection('transactions').add({
      data: {
        _openid: user._openid,
        type: 'consume',
        credits: -CREDIT_COST,
        remark: remark,
        createTime: Date.now()
      }
    })
  } catch (e) {
    console.error('写入积分流水失败', e)
  }
}

// 火山引擎方舟平台 OpenAI 兼容接口地址
const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

/**
 * 解析 AI 返回的 JSON 字符串
 * @param {string} text AI 返回的原始文本
 * @returns {*} 解析后的 JSON 对象/数组
 */
function parseJSON(text) {
  let str = String(text).trim()
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(str)
  } catch (e) {
  }
  const firstBrace = str.indexOf('{')
  const firstBracket = str.indexOf('[')
  let start = -1
  if (firstBrace === -1) {
    start = firstBracket
  } else if (firstBracket === -1) {
    start = firstBrace
  } else {
    start = Math.min(firstBrace, firstBracket)
  }
  if (start === -1) {
    throw new Error('AI 返回内容中未找到 JSON')
  }
  const lastBrace = str.lastIndexOf('}')
  const lastBracket = str.lastIndexOf(']')
  const end = Math.max(lastBrace, lastBracket)
  if (end === -1 || end <= start) {
    throw new Error('AI 返回内容中未找到 JSON')
  }
  return JSON.parse(str.slice(start, end + 1))
}

/**
 * 调用豆包大模型
 * @returns {Promise<{content: string, tokens: number}>}
 */
async function callDoubao({ model, messages, temperature, maxTokens, timeout }) {
  if (!getEnv('ARK_API_KEY')) {
    throw new Error('缺少 ARK_API_KEY')
  }
  let response
  try {
    response = await axios.post(ARK_URL, {
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getEnv('ARK_API_KEY')
      },
      timeout: timeout
    })
  } catch (e) {
    console.error('豆包模型服务调用失败', e)
    throw new Error('豆包模型服务调用失败')
  }
  const content = response.data &&
    response.data.choices &&
    response.data.choices[0] &&
    response.data.choices[0].message &&
    response.data.choices[0].message.content
  if (!content) {
    throw new Error('豆包模型服务调用失败')
  }
  const tokens = (response.data.usage && response.data.usage.total_tokens) || 0
  return { content: content, tokens: tokens }
}

/**
 * 写入 api_logs 集合（失败仅打印日志，绝不影响主流程）
 */
async function logApi(func, tokens, success, message) {
  try {
    await cloud.database().collection('api_logs').add({
      data: {
        func: func,
        tokens: tokens,
        success: success,
        message: message,
        createTime: Date.now()
      }
    })
  } catch (e) {
    console.error('写入 api_logs 失败', e)
  }
}

exports.main = async (event) => {
  try {
    if (!getEnv('ARK_API_KEY') || !getEnv('ARK_ENDPOINT_ID_TEXT')) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_TEXT' }
    }

    // 积分余额校验（余额不足直接返回 code 2，由前端引导充值）
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    const systemPrompt = '你是一位专业的课件设计师，擅长把教学内容拆解成清晰、美观的课件页面大纲。你必须严格按照用户要求的 JSON 格式输出。'

    // 用户 prompt：event.prompt 优先，为空则用 topic/pages/style 兜底拼接
    let userPrompt = event.prompt
    if (!userPrompt) {
      const topic = event.topic || ''
      const pages = event.pages || 20
      const style = event.style || ''
      userPrompt = '请围绕主题「' + topic + '」，设计一份课件大纲，共约 ' + pages + ' 页，风格：' + (style || '简洁美观') + '。\n' +
        '请严格按照以下 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：\n' +
        '[{"title":"页面标题","content":"页面内容要点","visual":"视觉/配图建议","animation":"动画建议"}]'
    }

    const result = await callDoubao({
      model: getEnv('ARK_ENDPOINT_ID_TEXT'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 15000
    })

    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('generatePPTOutline', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    // 解析结果必须为数组且至少 1 项
    if (!Array.isArray(parsed) || parsed.length === 0) {
      await logApi('generatePPTOutline', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    // 每项规范化，缺省字段补空字符串，只保留前 Number(event.pages)||20 项
    const maxPages = Number(event.pages) || 20
    const data = parsed.slice(0, maxPages).map(function (item) {
      const obj = (item && typeof item === 'object' && !Array.isArray(item)) ? item : {}
      return {
        title: String(obj.title == null ? '' : obj.title),
        content: String(obj.content == null ? '' : obj.content),
        visual: String(obj.visual == null ? '' : obj.visual),
        animation: String(obj.animation == null ? '' : obj.animation)
      }
    })

    await chargeCredits(bal.user, '生成课件大纲')
    await logApi('generatePPTOutline', result.tokens, true, 'ok')
    return { code: 0, data: data, message: 'ok' }
  } catch (e) {
    console.error('generatePPTOutline 执行异常', e)
    await logApi('generatePPTOutline', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: (e && e.message) || '服务异常，请重试' }
  }
}
