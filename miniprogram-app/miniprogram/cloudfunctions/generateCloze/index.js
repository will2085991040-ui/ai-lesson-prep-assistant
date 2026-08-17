/**
 * generateCloze 云函数
 * 功能：调用豆包大模型（DeepSeek 文本模型）根据课件内容生成随堂挖空练习
 * - event.prompt 优先；兜底用学科/年级/课题 + 课件内容 slidesText 拼提示词
 * - AI 返回 JSON 数组，逐项规范化并过滤空项，最多保留 10 项
 * - 成功后扣除 15 积分并写入流水与 api_logs
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
 * 1. 去除首尾空白与 ```json / ``` 代码块包裹
 * 2. 直接 JSON.parse
 * 3. 失败则截取首个 { 或 [ 到最后一个 } 或 ] 再解析
 * 4. 再失败抛出异常
 * @param {string} text AI 返回的原始文本
 * @returns {*} 解析后的 JSON 对象/数组
 */
function parseJSON(text) {
  let str = String(text).trim()
  // 去除开头的 ```json 或 ``` 与结尾的 ```
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(str)
  } catch (e) {
    // 直接解析失败，进入兜底解析
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
  // 截取首个 { 或 [ 到最后一个 } 或 ] 后再解析
  return JSON.parse(str.slice(start, end + 1))
}

/**
 * 调用豆包大模型
 * @param {object} params 参数对象
 * @param {string} params.model Endpoint ID（环境变量）
 * @param {Array} params.messages 消息数组
 * @param {number} params.temperature 温度
 * @param {number} params.maxTokens 最大 token 数
 * @param {number} params.timeout 超时毫秒数
 * @returns {Promise<{content: string, tokens: number}>} 返回内容与消耗 token 数
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
 * @param {string} func 函数名
 * @param {number} tokens 消耗 token 数（失败为 0）
 * @param {boolean} success 是否成功
 * @param {string} message 说明信息
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

// ==================== 本函数配置 ====================
const SYSTEM_PROMPT = '你是一位资深命题专家，擅长根据课件内容设计随堂练习（挖空/选择题）。你必须严格按照用户要求的 JSON 数组格式输出。'
const TEMPERATURE = 0.7
const MAX_TOKENS = 3000
const TIMEOUT = 60000
const MAX_ITEMS = 10 // 最多返回的练习数量

exports.main = async (event) => {
  try {
    // ① 检查所需环境变量，缺失则直接返回，不抛异常
    if (!getEnv('ARK_API_KEY') || !getEnv('ARK_ENDPOINT_ID_TEXT')) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_TEXT' }
    }

    // ② 积分余额校验（余额不足直接返回 code 2，由前端引导充值）
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    // ③ 用户 prompt：event.prompt 优先，为空则用学科/年级/课题 + 课件内容 slidesText 兜底拼接
    let userPrompt = String(event.prompt || '').trim()
    if (!userPrompt) {
      const subject = String(event.subject || '').trim()
      const grade = String(event.grade || '').trim()
      const topic = String(event.topic || '').trim()
      const slidesText = String(event.slidesText || '').trim()
      userPrompt = '请根据以下课件内容设计随堂练习（挖空/选择题）：\n' +
        '【学科】' + subject + '\n' +
        '【年级】' + grade + '\n' +
        '【课题】' + (topic || '未提供') + '\n' +
        '【课件内容】\n' + (slidesText || '未提供') + '\n\n' +
        '设计要求：\n' +
        '1. 题目紧扣课件知识点，难度适中，适合课堂随堂检测。\n' +
        '2. 挖空题用 ____ 表示填空处；选择题提供 4 个选项。\n' +
        '3. 每题附答案与解析。\n' +
        '请严格按照以下 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：\n' +
        '[{"type":"blank","content":"含有____的题目内容","answer":"答案","options":[],"analysis":"解析"},{"type":"choice","content":"选择题题目内容","answer":"A","options":["选项A","选项B","选项C","选项D"],"analysis":"解析"}]'
    }

    // ④ 调用 DeepSeek 文本模型
    const result = await callDoubao({
      model: getEnv('ARK_ENDPOINT_ID_TEXT'),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      timeout: TIMEOUT
    })

    // ⑤ 解析 AI 返回的 JSON 数组
    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('generateCloze', result.tokens, false, 'AI 返回的练习内容格式异常')
      return { code: 1, message: 'AI 返回的练习内容格式异常，请重试' }
    }
    // 必须为数组且至少 1 项
    if (!Array.isArray(parsed) || parsed.length < 1) {
      await logApi('generateCloze', result.tokens, false, 'AI 返回的练习内容格式异常')
      return { code: 1, message: 'AI 返回的练习内容格式异常，请重试' }
    }

    // ⑥ 规范化每一项：type/content/answer/options/analysis 缺省兜底，过滤空 content，最多 10 项
    const data = parsed
      .map(function (q) {
        const obj = (q && typeof q === 'object' && !Array.isArray(q)) ? q : {}
        return {
          type: obj.type === 'choice' ? 'choice' : 'blank',
          content: String(obj.content == null ? '' : obj.content),
          answer: String(obj.answer == null ? '' : obj.answer),
          options: Array.isArray(obj.options) ? obj.options.map(function (o) { return String(o) }) : [],
          analysis: String(obj.analysis == null ? '' : obj.analysis)
        }
      })
      .filter(function (q) { return q.content !== '' })
      .slice(0, MAX_ITEMS)

    // 规范化后仍为空则视为格式异常
    if (data.length < 1) {
      await logApi('generateCloze', result.tokens, false, 'AI 返回的练习内容格式异常')
      return { code: 1, message: 'AI 返回的练习内容格式异常，请重试' }
    }

    // ⑦ 成功：扣费 + 记录日志
    await chargeCredits(bal.user, '生成挖空练习')
    await logApi('generateCloze', result.tokens, true, 'ok')
    return { code: 0, data: data, message: 'ok' }
  } catch (e) {
    console.error('generateCloze 执行异常', e)
    await logApi('generateCloze', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: '练习生成失败，请稍后重试' }
  }
}
