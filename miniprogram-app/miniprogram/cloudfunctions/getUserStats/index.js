/**
 * getUserStats 云函数
 * 功能：统计当前用户的备课数据量（不调用豆包，无需 ARK 环境变量）
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const db = cloud.database()

    // 对五个集合分别执行 count，每个单独 try-catch，失败记 0
    const collections = ['lesson_plans', 'ppt_outlines', 'coursewares', 'exercises', 'analysis']
    const counts = {}

    for (let i = 0; i < collections.length; i++) {
      const name = collections[i]
      try {
        const res = await db.collection(name).where({ _openid: userId }).count()
        counts[name] = res.total
      } catch (e) {
        console.error('统计集合 ' + name + ' 失败', e)
        counts[name] = 0
      }
    }

    const lessonPlans = counts['lesson_plans']
    const pptOutlines = counts['ppt_outlines']
    const coursewares = counts['coursewares']
    const exercises = counts['exercises']
    const analyses = counts['analysis']
    const total = lessonPlans + pptOutlines + coursewares + exercises + analyses

    return {
      code: 0,
      data: {
        lessonPlans: lessonPlans,
        pptOutlines: pptOutlines,
        coursewares: coursewares,
        exercises: exercises,
        analyses: analyses,
        total: total
      },
      message: 'ok'
    }
  } catch (e) {
    console.error('getUserStats 执行异常', e)
    return { code: 1, message: '获取统计数据失败，请重试' }
  }
}
