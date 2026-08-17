/**
 * generateLectureScript 云函数
 * 功能：调用豆包大模型（DeepSeek 文本模型）生成规范生动的说课稿
 * - event.prompt 优先；兜底用学科/年级/教材/课题/要求 + 课件教研包 pack 拼提示词
 * - AI 返回纯文本（无需 JSON 解析），空内容判失败，超长截断 8000 字
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

// 把课件教研包 pack 对象拼成可读文本（缺省字段自动跳过，用于兜底提示词）
function formatPack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return ''
  const str = function (v) { return String(v == null ? '' : v) }
  const lines = []
  if (str(pack.unitAnalysis)) lines.push('单元分析：' + str(pack.unitAnalysis))
  if (Array.isArray(pack.objectives) && pack.objectives.length) {
    lines.push('教学目标：' + pack.objectives.map(str).join('；'))
  }
  if (str(pack.bigQuestion)) lines.push('核心大问题：' + str(pack.bigQuestion))
  if (Array.isArray(pack.taskChain) && pack.taskChain.length) {
    lines.push('任务链：' + pack.taskChain.map(function (t) {
      if (!t || typeof t !== 'object') return ''
      return str(t.task) + (Number(t.minutes) ? '（' + t.minutes + '分钟）' : '')
    }).filter(Boolean).join('；'))
  }
  if (Array.isArray(pack.transitions) && pack.transitions.length) {
    lines.push('过渡语：' + pack.transitions.map(str).join('；'))
  }
  if (Array.isArray(pack.evaluation) && pack.evaluation.length) {
    lines.push('评价设计：' + pack.evaluation.map(function (e) {
      if (!e || typeof e !== 'object') return ''
      return str(e.level) + '：' + str(e.content)
    }).filter(Boolean).join('；'))
  }
  if (Array.isArray(pack.homework) && pack.homework.length) {
    lines.push('分层作业：' + pack.homework.map(function (h) {
      if (!h || typeof h !== 'object') return ''
      const items = Array.isArray(h.items) ? h.items.map(str).join('、') : str(h.items)
      return (str(h.level) ? str(h.level) + '：' : '') + items
    }).filter(Boolean).join('；'))
  }
  if (str(pack.boardDesign)) lines.push('板书设计：' + str(pack.boardDesign))
  return lines.join('\n')
}

// ==================== 本函数配置 ====================
const SYSTEM_PROMPT = '你是一位多次获得省级教学竞赛一等奖的资深教师，擅长撰写规范生动的说课稿。'
const TEMPERATURE = 0.7
const MAX_TOKENS = 4000
const TIMEOUT = 60000
const MAX_LENGTH = 8000 // 说课稿最大长度（字）

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

    // ③ 用户 prompt：event.prompt 优先，为空则用字段 + 课件教研包 pack 兜底拼接
    let userPrompt = String(event.prompt || '').trim()
    if (!userPrompt) {
      const subject = String(event.subject || '').trim()
      const grade = String(event.grade || '').trim()
      const textbook = String(event.textbook || '').trim()
      const topic = String(event.topic || '').trim()
      const requirements = String(event.requirements || '').trim()
      const packText = formatPack(event.pack)
      userPrompt = '请为以下课题撰写一份规范生动的说课稿：\n' +
        '【学科】' + subject + '\n' +
        '【年级】' + grade + '\n' +
        '【教材】' + (textbook || '通用教材') + '\n' +
        '【课题】' + (topic || '未提供') + '\n' +
        '【老师补充要求】' + (requirements || '无') + '\n' +
        (packText ? '【课件教研包】\n' + packText + '\n' : '') +
        '\n写作要求：\n' +
        '1. 说课稿结构完整，一般包含说教材、说学情、说教学目标、说教学重难点、说教法学法、说教学过程、说板书设计等环节。\n' +
        '2. 语言规范生动，符合口语表达习惯，能直接用于说课展示。\n' +
        '3. 教学目标表述准确，教学环节设计紧扣课题内容，重难点突出。'
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

    // ⑤ 校验返回内容：必须为非空字符串（纯文本，无需 JSON 解析）
    let content = String(result.content == null ? '' : result.content).trim()
    if (!content) {
      await logApi('generateLectureScript', result.tokens, false, 'AI 返回内容为空')
      return { code: 1, message: '说课稿生成失败，请重试' }
    }
    // 超长截断，防止返回过大
    if (content.length > MAX_LENGTH) {
      content = content.slice(0, MAX_LENGTH)
    }

    // ⑥ 成功：扣费 + 记录日志
    await chargeCredits(bal.user, '生成说课稿')
    await logApi('generateLectureScript', result.tokens, true, 'ok')
    return { code: 0, data: { content: content }, message: 'ok' }
  } catch (e) {
    console.error('generateLectureScript 执行异常', e)
    await logApi('generateLectureScript', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: '说课稿生成失败，请稍后重试' }
  }
}
