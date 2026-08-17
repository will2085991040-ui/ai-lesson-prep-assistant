/**
 * getTextbooks 云函数：教材库查询
 * - 首次调用（集合为空）时程序化生成 200+ 本教材并播种
 * - 支持按 subject / stage（小学/初中/高中）过滤
 * - 返回按学段（小学<初中<高中）、书名（中文 localeCompare）排序的结果
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// ==================== 学科计划表（学段 → 教材版本列表） ====================
const PLAN = [
  { subject: '语文', stages: { 小学: ['部编版'], 初中: ['部编版'], 高中: ['部编版'] } },
  { subject: '数学', stages: { 小学: ['人教版', '北师大版'], 初中: ['人教版', '北师大版', '沪科版'], 高中: ['人教版', '北师大版'] } },
  { subject: '英语', stages: { 小学: ['人教PEP版'], 初中: ['人教版', '外研版'], 高中: ['人教版', '外研版'] } },
  { subject: '物理', stages: { 初中: ['人教版', '沪科版'], 高中: ['人教版', '沪科版'] } },
  { subject: '化学', stages: { 初中: ['人教版', '沪科版'], 高中: ['人教版'] } },
  { subject: '生物', stages: { 初中: ['人教版'], 高中: ['人教版'] } },
  { subject: '历史', stages: { 初中: ['部编版'], 高中: ['部编版'] } },
  { subject: '地理', stages: { 初中: ['人教版'], 高中: ['人教版'] } },
  { subject: '道德与法治', stages: { 小学: ['部编版'], 初中: ['部编版'] } },
  { subject: '科学', stages: { 小学: ['教科版'] } },
  { subject: '音乐', stages: { 小学: ['人音版'], 初中: ['人音版'] } },
  { subject: '美术', stages: { 小学: ['人美版'], 初中: ['人美版'] } },
  { subject: '信息技术', stages: { 初中: ['人教版'], 高中: ['人教版'] } }
]

// ==================== 年级 / 册别常量 ====================
// 小学：一年级~六年级
const PRIMARY_GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']
// 初中：七年级~九年级
const JUNIOR_GRADES = ['七年级', '八年级', '九年级']
// 上/下册
const HALVES = ['上册', '下册']
// 高中教材册名
const SENIOR_BOOKS = ['必修第一册', '必修第二册', '选择性必修第一册', '选择性必修第二册', '选择性必修第三册']

// ==================== 版本名 → 出版社映射 ====================
const PUBLISHER_MAP = {
  '人音版': '人民音乐出版社',
  '人美版': '人民美术出版社',
  '教科版': '教育科学出版社',
  '外研版': '外语教学与研究出版社',
  '北师大版': '北京师范大学出版社',
  '沪科版': '上海科技出版社',
  '部编版': '人民教育出版社',
  '人教版': '人民教育出版社',
  '人教PEP版': '人民教育出版社'
}

// 学段排序权重：小学 < 初中 < 高中
const STAGE_ORDER = { '小学': 1, '初中': 2, '高中': 3 }

// 根据版本名取出版社（未命中时默认人民教育出版社）
function getPublisher(version) {
  return PUBLISHER_MAP[version] || '人民教育出版社'
}

/**
 * 程序化生成全量教材矩阵
 * - 小学/初中书名格式：${version}${subject}${gradeName}${half}
 * - 高中书名格式：${version}高中${subject}${book}
 * - 物理初中仅八/九年级，化学初中仅九年级
 * @returns {Array<{subject, bookName, publisher, stage, sort}>} 教材数组
 */
function buildTextbooks() {
  const list = []
  PLAN.forEach(plan => {
    const subject = plan.subject
    const stages = plan.stages || {}

    // 小学
    if (stages['小学']) {
      stages['小学'].forEach(version => {
        PRIMARY_GRADES.forEach(grade => {
          HALVES.forEach(half => {
            list.push({
              subject: subject,
              bookName: version + subject + grade + half,
              publisher: getPublisher(version),
              stage: '小学'
            })
          })
        })
      })
    }

    // 初中
    if (stages['初中']) {
      stages['初中'].forEach(version => {
        JUNIOR_GRADES.forEach(grade => {
          // 物理仅八/九年级，化学仅九年级
          if (subject === '物理' && grade === '七年级') return
          if (subject === '化学' && (grade === '七年级' || grade === '八年级')) return
          HALVES.forEach(half => {
            list.push({
              subject: subject,
              bookName: version + subject + grade + half,
              publisher: getPublisher(version),
              stage: '初中'
            })
          })
        })
      })
    }

    // 高中
    if (stages['高中']) {
      stages['高中'].forEach(version => {
        SENIOR_BOOKS.forEach(book => {
          list.push({
            subject: subject,
            bookName: version + '高中' + subject + book,
            publisher: getPublisher(version),
            stage: '高中'
          })
        })
      })
    }
  })

  // 依次赋予递增 sort 序号
  list.forEach((item, index) => { item.sort = index + 1 })
  return list
}

/**
 * 播种：教材库为空时生成全量数据
 * 优先批量插入，失败则逐条插入
 */
async function seedTextbooks() {
  const countRes = await db.collection('textbooks').count()
  if (countRes.total > 0) return

  const list = buildTextbooks()
  try {
    // 优先批量插入（一次性写入整个数组）
    await db.collection('textbooks').add({ data: list })
  } catch (e) {
    // 批量插入失败（如超出单次写入上限）则循环逐条插入
    console.error('批量播种教材失败，改为逐条插入', e)
    for (let i = 0; i < list.length; i++) {
      await db.collection('textbooks').add({ data: list[i] })
    }
  }
}

exports.main = async (event) => {
  try {
    const subject = String(event.subject || '').trim()
    const stage = String(event.stage || '').trim()

    // 播种：教材库为空时程序化生成全量数据
    await seedTextbooks()

    // 查询：按 subject / stage 过滤（均为空则查询全部），limit 500
    let queryRes
    if (subject && stage) {
      queryRes = await db.collection('textbooks').where({ subject, stage }).limit(500).get()
    } else if (subject) {
      queryRes = await db.collection('textbooks').where({ subject }).limit(500).get()
    } else if (stage) {
      queryRes = await db.collection('textbooks').where({ stage }).limit(500).get()
    } else {
      queryRes = await db.collection('textbooks').limit(500).get()
    }

    // 在 JS 中按学段顺序（小学<初中<高中）、书名（中文 localeCompare）排序
    const list = queryRes.data.slice()
    list.sort((a, b) => {
      const stageDiff = (STAGE_ORDER[a.stage] || 0) - (STAGE_ORDER[b.stage] || 0)
      if (stageDiff !== 0) return stageDiff
      return String(a.bookName).localeCompare(String(b.bookName), 'zh')
    })

    return { code: 0, data: list, message: 'ok' }
  } catch (err) {
    console.error('getTextbooks 云函数执行失败：', err)
    return { code: 1, message: '获取教材库失败，请重试' }
  }
}
