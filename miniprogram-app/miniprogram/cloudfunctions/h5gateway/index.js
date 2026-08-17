const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 允许 H5 调用的云函数白名单（防任意调用）
const ALLOWED = ['login','getWallet','redeemCode','getUserStats','getTextbooks','getInspiration',
  'generateLessonPlan','generatePPTOutline','generateExercises','analyzeStudentProfile',
  'generateCourseware','generateWords','generateVariants','generateImage','generateSlideImages',
  'generateLectureScript','generateCloze','generateVideoTask','queryVideoTask','exportPPTX']

// 允许 H5 直接读写的集合白名单（保存备课记录用）
const ALLOWED_COLLECTIONS = ['lesson_plans','ppt_outlines','coursewares','exercises','analysis']

// 统一 CORS 响应
function respond(body) {
  return {
    isBase64Encoded: false,
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond({ code: 0, message: 'ok' })
  try {
    const raw = typeof event.body === 'string' ? (event.body || '{}') : JSON.stringify(event.body || {})
    const body = JSON.parse(raw)
    const action = body.action || 'call'
    // ① fileID 转 https 临时链接（H5 无法使用 cloud:// 协议）
    if (action === 'tempUrls') {
      const fileIDs = Array.isArray(body.fileIDs) ? body.fileIDs.filter(f => f && typeof f === 'string').slice(0, 50) : []
      if (!fileIDs.length) return respond({ code: 1, message: '缺少文件ID' })
      const res = await cloud.getTempFileURL({ fileList: fileIDs })
      const list = (res.fileList || []).map(f => ({ fileID: f.fileID, tempFileURL: f.tempFileURL || '' }))
      return respond({ code: 0, data: list, message: 'ok' })
    }
    // ② 新增备课记录（H5 直接写库，userId 作为 _openid 存储）
    if (action === 'add') {
      const collection = String(body.collection || '')
      if (ALLOWED_COLLECTIONS.indexOf(collection) === -1) return respond({ code: 1, message: '不支持的集合' })
      const data = body.data && typeof body.data === 'object' ? body.data : {}
      data._openid = String(body.userId || '')
      data.createTime = data.createTime || Date.now()
      const addRes = await cloud.database().collection(collection).add({ data })
      return respond({ code: 0, data: { _id: addRes._id }, message: 'ok' })
    }
    // ③ 默认：转发调用云函数（自动注入 userId）
    const name = String(body.name || '')
    if (ALLOWED.indexOf(name) === -1) return respond({ code: 1, message: '不允许调用的函数' })
    const data = body.data && typeof body.data === 'object' ? body.data : {}
    data.userId = String(body.userId || data.userId || '')
    const result = await cloud.callFunction({ name, data })
    return respond(result.result || { code: 1, message: '服务异常' })
  } catch (e) {
    console.error('h5gateway 异常', e)
    return respond({ code: 1, message: '网关服务异常，请稍后重试' })
  }
}
