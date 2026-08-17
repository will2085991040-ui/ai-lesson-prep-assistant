/**
 * getInspiration 云函数
 * 功能：调用豆包大模型（32K 模型）推荐热门备课课题
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

    const subject = String(event.subject || '语文')

    // 用户 prompt：event.prompt 优先，否则用学科兜底拼接
    let userPrompt = event.prompt
    if (!userPrompt) {
      userPrompt = '请围绕' + subject + '学科，推荐3个当前热门的备课课题。严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：[{"title":"课题名称","reason":"推荐理由（30字以内）"}]'
    }

    const result = await callDoubao({
      model: getEnv('ARK_ENDPOINT_ID_TEXT'),
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      maxTokens: 1024,
      timeout: 15000
    })

    let parsed
    try {
      parsed = parseJSON(result.content)
    } catch (e) {
      await logApi('getInspiration', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    // 解析结果必须为数组
    if (!Array.isArray(parsed)) {
      await logApi('getInspiration', result.tokens, false, 'AI 返回内容格式异常')
      return { code: 1, message: 'AI 返回内容格式异常，请重试' }
    }

    // 每项规范化 {title, reason}，缺省补空字符串，过滤 title 为空的项，最多保留 3 项
    const topics = parsed
      .map(function (item) {
        const obj = (item && typeof item === 'object' && !Array.isArray(item)) ? item : {}
        return {
          title: String(obj.title == null ? '' : obj.title),
          reason: String(obj.reason == null ? '' : obj.reason)
        }
      })
      .filter(function (t) { return t.title !== '' })
      .slice(0, 3)

    await logApi('getInspiration', result.tokens, true, 'ok')
    return { code: 0, data: { topics: topics }, message: 'ok' }
  } catch (e) {
    console.error('getInspiration 执行异常', e)
    await logApi('getInspiration', 0, false, (e && e.message) || '服务异常')
    return { code: 1, message: (e && e.message) || '服务异常，请重试' }
  }
}
