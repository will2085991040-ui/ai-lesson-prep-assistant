/**
 * generateCourseware 云函数：一键生成完整课件（10-50 页，含讲解词）
 * - 调用火山方舟（OpenAI 兼容）DeepSeek 文本模型
 * - AI 返回结构：{pack:{...教学设计信息...}, slides:[{title,content,visual,animation,speakerNotes,imagePrompt,layout}]}
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
const CREDIT_COST = 40

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

// ==================== 数据结构规范化辅助函数 ====================
// 字符串化：null/undefined → 空串，其余转字符串
const str = v => (v == null ? '' : String(v))

// 转字符串数组：过滤空串（数组逐项字符串化；非数组非空则包成单元素数组）
function toStrArray(v) {
  if (Array.isArray(v)) return v.map(item => str(item)).filter(t => t !== '')
  if (v == null) return []
  const s = str(v)
  return s === '' ? [] : [s]
}

// 任务链规范化：每项 {task, activity, minutes} 逐项字符串化
function toTaskChain(v) {
  if (!Array.isArray(v)) return []
  return v.map(item => {
    if (item == null || typeof item !== 'object') return { task: str(item), activity: '', minutes: '' }
    return {
      task: str(item.task),
      activity: str(item.activity),
      minutes: item.minutes == null ? '' : String(item.minutes)
    }
  })
}

// 评价设计规范化：每项 {level, content} 逐项字符串化
function toEvaluation(v) {
  if (!Array.isArray(v)) return []
  return v.map(item => {
    if (item == null || typeof item !== 'object') return { level: str(item), content: '' }
    return { level: str(item.level), content: str(item.content) }
  })
}

// 分层作业规范化：每项 {level, items} 逐项字符串化（items 转字符串数组）
function toHomework(v) {
  if (!Array.isArray(v)) return []
  return v.map(item => {
    if (item == null || typeof item !== 'object') return { level: str(item), items: [] }
    return { level: str(item.level), items: toStrArray(item.items) }
  })
}

// pack 字段逐项兜底：unitAnalysis/boardDesign 字符串化，objectives/transitions 转字符串数组，taskChain/evaluation/homework 逐项字符串化
function normalizePack(pack) {
  const p = (pack && typeof pack === 'object') ? pack : {}
  return {
    unitAnalysis: str(p.unitAnalysis),
    objectives: toStrArray(p.objectives),
    bigQuestion: str(p.bigQuestion),
    taskChain: toTaskChain(p.taskChain),
    transitions: toStrArray(p.transitions),
    evaluation: toEvaluation(p.evaluation),
    homework: toHomework(p.homework),
    boardDesign: str(p.boardDesign)
  }
}

// 8 种 slideType 合法值（与 exportPPTX 版式引擎对齐）
const SLIDE_TYPES = ['cover', 'section', 'concept', 'steps', 'compare', 'example', 'practice', 'summary']

// slideType 归一化：不在 8 种合法值内或缺省一律回退 'concept'
function normalizeSlideType(v) {
  const t = String(v == null ? '' : v).trim()
  return SLIDE_TYPES.indexOf(t) >= 0 ? t : 'concept'
}

// ==================== 本函数配置 ====================
const SYSTEM_PROMPT = '你是一位拥有二十年教龄的国家级特级教师，同时是专业课件设计师，精通中小学各学科课程标准和课堂教学设计。你必须严格按照用户要求的 JSON 对象格式输出（包含 pack 与 slides 两个字段），不输出任何 JSON 之外的说明文字。'
const TEMPERATURE = 0.6
const MAX_TOKENS = 8000
const TIMEOUT = 60000
const MAX_PAGES = 50

exports.main = async (event) => {
  try {
    // ① 校验环境变量，缺失则直接返回，不抛异常
    if (!getEnv('ARK_API_KEY') || !getEnv('ARK_ENDPOINT_ID_TEXT')) {
      return { code: 1, message: '云函数未配置环境变量，请检查 ARK_API_KEY / ARK_ENDPOINT_ID_TEXT' }
    }

    // ② 用户提示词：event.prompt 优先，为空则用字段兜底拼接（含学生学情 studentLevel，可选）
    let userPrompt = String(event.prompt || '').trim()
    if (!userPrompt) {
      const subject = String(event.subject || '').trim()
      const grade = String(event.grade || '').trim()
      const textbook = String(event.textbook || '').trim()
      const topic = String(event.topic || '').trim()
      const pages = Number(event.pages) || 20
      const template = String(event.template || '').trim() || '标准结构'
      const studentLevel = String(event.studentLevel || '').trim()
      const requirements = String(event.requirements || '').trim()
      // 关键字段全为空则视为缺少生成要求
      if (!subject && !topic) {
        return { code: 1, message: '请填写课件生成要求' }
      }
      userPrompt = '请为以下课题制作一份可直接用于课堂投屏的完整课件：\n' +
        '【学科】' + subject + '\n' +
        '【年级】' + grade + '\n' +
        '【教材】' + (textbook || '通用教材') + '\n' +
        '【课题】' + topic + '\n' +
        '【总页数】' + pages + '页\n' +
        '【课件模板】' + template + '\n' +
        '【学生学情】' + (studentLevel || '未提供') + '\n' +
        '【老师补充要求】' + (requirements || '无') + '\n\n' +
        '设计规范（务必遵守）：\n' +
        '1. 内容紧扣教材知识点与课程标准，由浅入深编排，并结合学生学情适当调整讲解深度与互动难度。\n' +
        '2. 第 1 页为封面页（课题/学科/年级/教材），最后 1 页为「课堂小结 + 课后作业」页。\n' +
        '3. 每页内容要点 2-4 条，每条不超过 30 字，一页只聚焦一个知识点。\n' +
        '4. 每页都要有互动设计，讲解词（speakerNotes）是该页教师的授课话术，60-120 字，具体可讲。\n' +
        '5. pack 字段填写本课教学设计信息（单元分析、教学目标、核心大问题、任务链、过渡语、评价设计、分层作业、板书设计）。\n\n' +
        '严格按照如下 JSON 对象格式输出（共 ' + pages + ' 个 slides 元素，不要输出任何 JSON 之外的说明文字）：\n' +
        '{"pack":{"unitAnalysis":"单元整体分析","objectives":["教学目标1","教学目标2"],"bigQuestion":"核心大问题","taskChain":[{"task":"任务名称","activity":"活动设计","minutes":10}],"transitions":["过渡语"],"evaluation":[{"level":"评价层次","content":"评价内容"}],"homework":[{"level":"作业层次","items":["作业项"]}],"boardDesign":"板书设计"},"slides":[{"title":"本页标题","content":"要点1\\n要点2","visual":"配图/图表建议","animation":"动画建议","speakerNotes":"该页讲解词","imagePrompt":"配图生成提示词","layout":"页面排版建议"}]}'
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

    // ⑤ 解析并校验：兼容新格式对象 {pack, slides} 与旧格式数组（旧格式 pack 为空对象）
    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('generateCourseware', result.tokens, false, 'AI 返回的课件内容格式异常')
      return { code: 1, message: 'AI 返回的课件内容格式异常，请重试' }
    }
    let pack = {}
    let slides = []
    if (Array.isArray(parsed)) {
      // 旧格式：AI 直接返回 slides 数组
      slides = parsed
    } else if (parsed && typeof parsed === 'object') {
      // 新格式：{pack, slides}
      slides = Array.isArray(parsed.slides) ? parsed.slides : []
      pack = (parsed.pack && typeof parsed.pack === 'object') ? parsed.pack : {}
    }
    // slides 必须为数组且 ≥1 项
    if (!Array.isArray(slides) || slides.length < 1) {
      await logApi('generateCourseware', result.tokens, false, 'AI 返回的课件内容格式异常')
      return { code: 1, message: 'AI 返回的课件内容格式异常，请重试' }
    }

    // ⑥ 规范化 pack 与 slides 各字段（缺省补空串），并过滤 title 与 content 均为空的项
    pack = normalizePack(pack)
    slides = slides
      .map(item => ({
        title: str(item && item.title),
        slideType: normalizeSlideType(item && item.slideType),
        content: str(item && item.content),
        visual: str(item && item.visual),
        animation: str(item && item.animation),
        speakerNotes: str(item && item.speakerNotes),
        imagePrompt: str(item && item.imagePrompt),
        layout: str(item && item.layout)
      }))
      .filter(item => item.title !== '' || item.content !== '')

    // ⑦ 按页数截断（默认 20，最多 50）
    let pageLimit = Number(event.pages) || 20
    if (!(pageLimit >= 1)) pageLimit = 20
    if (pageLimit > MAX_PAGES) pageLimit = MAX_PAGES
    slides = slides.slice(0, pageLimit)

    // ⑧ 成功：扣费 + 记录日志
    await chargeCredits(bal.user, '生成完整课件')
    await logApi('generateCourseware', result.tokens, true, 'ok')

    return { code: 0, data: { pack, slides }, message: 'ok' }
  } catch (e) {
    console.error('generateCourseware 执行异常', e)
    await logApi('generateCourseware', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: '课件生成失败，请稍后重试' }
  }
}
