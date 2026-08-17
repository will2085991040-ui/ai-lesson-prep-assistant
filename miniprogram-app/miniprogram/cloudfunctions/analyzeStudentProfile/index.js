/**
 * analyzeStudentProfile 云函数
 * 功能：调用豆包大模型（PRO 模型）进行学情诊断
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
const CREDIT_COST = 30 // 本函数每次成功调用消耗的积分

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

    const systemPrompt = '你是一位教育测量与评价专家，擅长根据测验得分与常见错误诊断学情，并给出分层教学建议。你必须严格按照用户要求的 JSON 结构输出。'

    // 用户 prompt：event.prompt 优先，为空则用 subject/grade/topic/score/errors 兜底拼接
    let userPrompt = event.prompt
    if (!userPrompt) {
      const subject = event.subject || ''
      const grade = event.grade || ''
      const topic = event.topic || ''
      const score = event.score == null ? '' : String(event.score)
      const errors = event.errors || ''
      userPrompt = '请根据以下测验数据进行学情诊断：\n' +
        '学科：' + subject + '\n' +
        '年级：' + grade + '\n' +
        '知识点/课题：' + topic + '\n' +
        '得分：' + score + '\n' +
        '常见错误：' + errors + '\n' +
        '请严格按照以下 JSON 结构输出，不要输出任何 JSON 之外的说明文字：\n' +
        '{"radar":{"max":100,"dimensions":[{"name":"维度名称","score":分数}]},"weakPoints":["薄弱点1","薄弱点2","薄弱点3"],"overall":"整体评价","suggestions":[{"level":"基础巩固层","content":"建议内容"},{"level":"能力提升层","content":"建议内容"},{"level":"拓展创新层","content":"建议内容"}]}'
    }

    const result = await callDoubao({
      model: getEnv('ARK_ENDPOINT_ID_TEXT'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      maxTokens: 4096,
      timeout: 15000
    })

    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('analyzeStudentProfile', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    // 解析结果必须为对象
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await logApi('analyzeStudentProfile', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    const radar = (parsed.radar && typeof parsed.radar === 'object' && !Array.isArray(parsed.radar)) ? parsed.radar : {}
    const radarMax = Number(radar.max) || 100

    // radar.dimensions 必须是数组且长度 ≥ 3
    const dims = radar.dimensions
    if (!Array.isArray(dims) || dims.length < 3) {
      await logApi('analyzeStudentProfile', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }
    const dimensions = dims.map(function (d) {
      const obj = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}
      let score = Number(obj.score)
      if (isNaN(score)) {
        score = 0
      }
      // clamp 到 0 ~ radar.max
      score = Math.max(0, Math.min(radarMax, score))
      return {
        name: String(obj.name == null ? '' : obj.name),
        score: score
      }
    })

    // weakPoints 数组，每项转字符串，最多 3 条
    let weakPoints = Array.isArray(parsed.weakPoints) ? parsed.weakPoints : []
    weakPoints = weakPoints.map(function (w) { return String(w == null ? '' : w) }).slice(0, 3)

    // overall 字符串，缺省 ''
    const overall = parsed.overall == null ? '' : String(parsed.overall)

    // suggestions 数组，每项 {level,content} 字符串化
    let suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    suggestions = suggestions.map(function (s) {
      const obj = (s && typeof s === 'object' && !Array.isArray(s)) ? s : {}
      return {
        level: String(obj.level == null ? '' : obj.level),
        content: String(obj.content == null ? '' : obj.content)
      }
    })
    // 为空时兜底三条
    if (suggestions.length === 0) {
      suggestions = [
        { level: '基础巩固层', content: '' },
        { level: '能力提升层', content: '' },
        { level: '拓展创新层', content: '' }
      ]
    }

    const data = {
      radar: { max: radarMax, dimensions: dimensions },
      weakPoints: weakPoints,
      overall: overall,
      suggestions: suggestions
    }

    await chargeCredits(bal.user, '学情诊断')
    await logApi('analyzeStudentProfile', result.tokens, true, 'ok')
    return { code: 0, data: data, message: 'ok' }
  } catch (e) {
    console.error('analyzeStudentProfile 执行异常', e)
    await logApi('analyzeStudentProfile', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: (e && e.message) || '服务异常，请重试' }
  }
}
