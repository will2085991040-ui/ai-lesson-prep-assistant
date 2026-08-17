// constants.js - 全局常量配置

// 云开发环境 ID：在微信开发者工具「云开发」控制台可查看
// 留空表示使用默认云环境（适合只有一个环境的项目）
const CLOUD_ENV_ID = ''

// 本地缓存键名
const STORAGE_KEYS = {
  DRAFT_LESSON_PLAN: 'draft_lesson_plan', // 教案表单草稿
  DRAFT_PPT_OUTLINE: 'draft_ppt_outline', // 课件大纲表单草稿
  DRAFT_EXERCISES: 'draft_exercises', // 习题表单草稿
  DRAFT_ANALYSIS: 'draft_analysis', // 学情诊断表单草稿
  HISTORY: 'recent_records', // 最近备课记录
  FAVORITES: 'favorites', // 收藏列表
  REMINDER: 'reminder_setting', // 提醒设置
  DETAIL_CACHE: 'detail_cache', // 详情页数据缓存（未入库结果跳转详情用）
  PREFILL: 'prefill_cache', // 「重新生成」回填表单缓存
  USER: 'current_user', // 当前登录用户信息
  WORDS: 'word_book', // 单词本（本地）
  MISTAKES: 'mistake_book', // 错题本（本地）
  SCHEDULE: 'my_schedule', // 我的课表（本地）
  KNOWLEDGE: 'knowledge_base' // 个人知识库（本地）
}

// 云数据库集合名
const COLLECTIONS = {
  LESSON_PLANS: 'lesson_plans', // 教案
  PPT_OUTLINES: 'ppt_outlines', // 课件大纲
  EXERCISES: 'exercises', // 习题集
  ANALYSIS: 'analysis', // 学情诊断
  API_LOGS: 'api_logs', // API 调用日志（云函数写入）
  USER_STATS: 'user_stats', // 用户统计（预留）
  USERS: 'users', // 用户（积分余额/昵称头像）
  ORDERS: 'orders', // 充值订单（预留微信支付）
  TRANSACTIONS: 'transactions', // 积分流水
  REDEEM_CODES: 'redeem_codes', // 兑换码
  TEXTBOOKS: 'textbooks', // 教材库
  COURSEWARES: 'coursewares' // AI 完整课件
}

// 业务类型与集合的映射
const TYPE_COLLECTION = {
  lesson_plan: 'lesson_plans',
  ppt_outline: 'ppt_outlines',
  courseware: 'coursewares',
  exercises: 'exercises',
  analysis: 'analysis'
}

// 业务类型的中文名
const TYPE_NAMES = {
  lesson_plan: '教案',
  ppt_outline: '课件大纲',
  courseware: 'AI课件',
  exercises: '习题',
  analysis: '学情'
}

// 学科
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '科学', '道德与法治', '音乐', '美术', '体育', '信息技术']

// 年级
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三']

// 课型
const LESSON_TYPES = ['新授课', '复习课', '练习课', '实验课', '讲评课', '活动课']

// 教学风格
const TEACH_STYLES = ['常规严谨', '生动活泼', '互动探究', '情境导入', '自主合作']

// 题型
const QUESTION_TYPES = ['选择题', '填空题', '解答题', '简答题', '应用题']

// 学生水平假设（课件生成用）
const STUDENT_LEVELS = ['基础薄弱', '中等', '中等偏上']

// 列表每页查询条数
const PAGE_SIZE = 20

// 积分规则（每次 AI 调用消耗的积分；1元 ≈ 100积分）
const CREDITS = {
  WELCOME_BONUS: 200, // 新用户注册赠送积分
  LESSON_PLAN: 30, // 生成教案
  PPT_OUTLINE: 15, // 生成课件大纲
  COURSEWARE: 40, // 生成完整课件（10-50页）
  EXERCISES: 20, // 生成分层习题
  ANALYSIS: 30, // 学情诊断
  IMAGE: 25, // 生成封面图
  WORDS: 10, // 生成单词表
  VARIANTS: 10, // 生成错题变式题
  SLIDE_IMAGE: 25, // 生成课件单页配图
  EXPORT_PPTX: 20, // 导出 PPTX 文件
  LECTURE_SCRIPT: 15, // 生成说课稿
  CLOZE: 15, // 生成随堂挖空练习
  VIDEO: 120 // 生成课件开场视频
  CLOZE: 15 // 生成随堂挖空练习
}

// 充值套餐（微信支付需企业主体；个人主体当前使用兑换码充值）
const RECHARGE_PACKAGES = [
  { price: 6, credits: 600 },
  { price: 30, credits: 3200 },
  { price: 98, credits: 11000 }
]

// 每日备课小提示（首页按日期轮换展示）
const DAILY_TIPS = [
  '备课时先定「一节课只解决一个核心问题」，课件围绕它展开，学生才记得住。',
  '课件每页只放一个知识点，字数不超过 40 字，剩下的交给老师的嘴。',
  '在课件里预设 2-3 个提问点，比整页知识点更让学生专注。',
  '新课导入控制在 3 分钟内，用一个生活场景或小悬念最有效。',
  '重难点页建议配合一道随堂练习，讲完立刻练，效果翻倍。',
  '课件正文字号建议 28 号以上，最后一排的学生也能看清。',
  '配色不要超过 3 种，重点内容用主色高亮即可。',
  '每 15 分钟设计一次师生互动（提问/讨论/小练习），防止走神。',
  '板书和课件分工：课件展示素材，板书留核心结构。',
  '给学有余力的学生准备 1 道拓展题，让课堂有弹性。',
  '使用 AI 生成课件时，把教材版本和课题写进要求，内容会更贴合课本。',
  'AI 生成的讲解词是「初稿」，结合自己班情改一改，才是你的课。',
  '分层习题三层各 3 题最合适：基础过关、能力提升、思维拓展。',
  '讲评错题时先让学生说错因，再讲正确解法，记忆更深刻。',
  '每周整理一次学生的共性错题，录进错题本，期中期末复习直接用。',
  '单词教学配合例句记忆，比单独背单词效率高 3 倍。',
  '课件最后一页放「课堂小结+作业」，学生和家长都清楚。',
  '课前 2 分钟用上节课的 1 道小题复习导入，衔接自然。',
  '教学反思不用写长，三句话：哪里好、哪里卡、下次怎么改。',
  '把 AI 当助教：先让它出 3 版思路，你挑一版再细化，效率最高。',
  '情境导入选学生身边的事例（食堂、游戏、天气），代入感最强。',
  '实验课课件提前放安全注意事项页，避免课堂事故。',
  '复习课用「知识树/思维导图」页收尾，帮助学生建立体系。',
  '别忘了：最好的课件是「留白」，给学生思考和提问的空间。'
]

module.exports = {
  CLOUD_ENV_ID,
  STORAGE_KEYS,
  COLLECTIONS,
  TYPE_COLLECTION,
  TYPE_NAMES,
  SUBJECTS,
  GRADES,
  LESSON_TYPES,
  TEACH_STYLES,
  QUESTION_TYPES,
  STUDENT_LEVELS,
  PAGE_SIZE,
  CREDITS,
  RECHARGE_PACKAGES,
  DAILY_TIPS
}
