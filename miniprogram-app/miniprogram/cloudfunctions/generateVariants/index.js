/**
 * generateVariants 云函数：错题变式题生成
 * - 调用火山方舟（OpenAI 兼容）DeepSeek 文本模型
 * - 根据错题生成 3 道难度梯度的同类变式题
 * - 生成成功后扣除积分并写入流水
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const ARK_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// 环境变量读取（process.env 优先，env.local.js 兜底）
let LOCAL_ENV = {}
try { LOCAL_ENV = require('./env.local.js') || {} } catch (e) { LOCAL_ENV = {} }
function getEnv(name) { return process.env[name] || LOCAL_ENV[name] || '' }

// 本函数每次成功调用消耗的积分
const CREDIT_COST = 10

// 余额校验：用户不存在→code1；余额不足→code2
async function ensureBalance(openid) {
  const db = cloud.database()
  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = res.data && res.data[0]
    if (!user) return { ok: false, code: 1, message: '请先登录后再使用' }
    if ((user.balance || 0) < CREDIT_COST) return { ok: false, code: 2, message: '积分余额不足，请先充值', user }
    return { ok: true, user }
  } catch (e) {
    console.error('查询用户余额失败', e)
    return { ok: false, code: 1, message: '账户服务暂不可用，请稍后重试' }
  }
}

// 扣费+流水（尽力而为，失败仅记日志）
async function chargeCredits(user, remark) {
  const db = cloud.database()
  try {
    await db.collection('users').doc(user._id).update({
      data: { balance: db.command.inc(-CREDIT_COST), totalConsume: db.command.inc(CREDIT_COST) }
    })
  } catch (e) { console.error('扣除积分失败', e) }
  try {
    await db.collection('transactions').add({
      data: { _openid: user._openid, type: 'consume', credits: -CREDIT_COST, remark, createTime: Date.now() }
    })
  } catch (e) { console.error('写入积分流水失败', e) }
}

// api_logs 记录（尽力而为）
async function logApi(func, tokens, success, message) {
  try {
    await cloud.database().collection('api_logs').add({
      data: { func, tokens: tokens || 0, success: !!success, message: message || '', createTime: Date.now() }
    })
  } catch (e) { console.error('写入 api_logs 失败', e) }
}

// JSON 解析（剥离 ```json 包裹 + 截取首尾括号兜底）
function parseJSON(text) {
  let str = String(text).trim()
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(str) } catch (e) {}
  const firstBrace = str.indexOf('{'); const firstBracket = str.indexOf('[')
  let start = -1
  if (firstBrace === -1) start = firstBracket
  else if (firstBracket === -1) start = firstBrace
  else start = Math.min(firstBrace, firstBracket)
  if (start === -1) throw new Error('AI 返回内容中未找到 JSON')
  const end = Math.max(str.lastIndexOf('}'), str.lastIndexOf(']'))
  if (end === -1 || end <= start) throw new Error('AI 返回内容中未找到 JSON')
  return JSON.parse(str.slice(start, end + 1))
}

// 调用 DeepSeek 文本模型
async function callDoubao({ model, messages, temperature, maxTokens, timeout }) {
  if (!getEnv('ARK_API_KEY')) throw new Error('缺少 ARK_API_KEY')
  let response
  try {
    response = await axios.post(ARK_URL, { model, messages, temperature, max_tokens: maxTokens }, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getEnv('ARK_API_KEY') },
      timeout
    })
  } catch (e) { console.error('DeepSeek 调用失败', e); throw new Error('AI 服务暂时不可用，请稍后重试') }
  const content = response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content
  if (!content) throw new Error('AI 服务暂时不可用，请稍后重试')
  const tokens = (response.data.usage && response.data.usage.total_tokens) || 0
  return { content, tokens }
}

// ==================== 本函数配置 ====================
const SYSTEM_PROMPT = '你是一位资深命题专家，擅长根据错题生成同类变式练习题。你必须严格按照用户要求的 JSON 数组格式输出。'
const TEMPERATURE = 0.7
const MAX_TOKENS = 2048
const TIMEOUT = 30000
const MAX_ITEMS = 3

exports.main = async (event) => {
  try {
    // ① 校验环境变量，缺失则直接返回，不抛异常
    if (!getEnv('ARK_API_KEY') || !getEnv('ARK_ENDPOINT_ID_TEXT')) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_TEXT' }
    }

    // ② 用户提示词：event.prompt 优先，为空则用字段兜底拼接
    let userPrompt = String(event.prompt || '').trim()
    if (!userPrompt) {
      const subject = String(event.subject || '').trim()
      const knowledge = String(event.knowledge || '').trim()
      const content = String(event.content || '').trim()
      // 原题内容为空则视为缺少生成要求
      if (!content) {
        return { code: 1, message: '请填写错题内容' }
      }
      userPrompt = '请根据下面这道错题，生成 3 道同类变式练习题，帮助学生巩固薄弱点：\n' +
        '【学科】' + (subject || '通用') + '\n' +
        '【知识点】' + (knowledge || '未注明') + '\n' +
        '【原题】' + content + '\n\n' +
        '要求：\n' +
        '1. 变式题保持原题考点不变：第 1 道与原题难度相同，第 2 道稍难，第 3 道综合运用。\n' +
        '2. 题目表述与原题有变化（换数字/换情境/换问法），避免简单重复。\n' +
        '3. 严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：\n' +
        '[{"content":"题目内容","answer":"答案","analysis":"解析（讲清解题思路）"}]'
    }

    // ③ 余额校验（余额不足返回 code 2，由前端引导充值）
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
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

    // ⑤ 解析并校验：必须是数组且 ≥1 项
    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('generateVariants', result.tokens, false, 'AI 返回的变式题格式异常')
      return { code: 1, message: 'AI 返回的变式题格式异常，请重试' }
    }
    if (!Array.isArray(parsed) || parsed.length < 1) {
      await logApi('generateVariants', result.tokens, false, 'AI 返回的变式题格式异常')
      return { code: 1, message: 'AI 返回的变式题格式异常，请重试' }
    }

    // ⑥ 规范化三个字段（缺省补空串），过滤 content 为空，最多保留 3 项
    const str = v => (v == null ? '' : String(v))
    const variants = parsed
      .map(item => ({
        content: str(item && item.content),
        answer: str(item && item.answer),
        analysis: str(item && item.analysis)
      }))
      .filter(item => item.content !== '')
      .slice(0, MAX_ITEMS)

    // ⑦ 成功：扣费 + 记录日志
    await chargeCredits(bal.user, '生成变式题')
    await logApi('generateVariants', result.tokens, true, 'ok')

    return { code: 0, data: variants, message: 'ok' }
  } catch (e) {
    console.error('generateVariants 执行异常', e)
    await logApi('generateVariants', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: '变式题生成失败，请稍后重试' }
  }
}
