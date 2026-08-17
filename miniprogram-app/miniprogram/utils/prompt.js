// prompt.js - AI 提示词构建与结果纯文本格式化
// 本文件负责两件事：
// 1. buildXxxPrompt：把表单数据拼成豆包大模型的 user prompt（要求严格 JSON 输出）
// 2. formatText：把 JSON 结果格式化为纯文本，用于「复制全文」

/* ==================== 提示词构建 ==================== */

// 生成完整教案的提示词（PRO 模型）
function buildLessonPlanPrompt(form) {
  return `请以资深教研员的身份，为以下课程生成一份完整、规范的教案：
【学科】${form.subject}
【年级】${form.grade}
【课题】${form.topic}
【教材】${form.textbook || '通用教材'}
【课时】第${form.hours}课时
【课型】${form.lessonType}
【学情】${form.studentInfo || '无特殊说明'}
【风格】${form.style}

要求：
1. 严格按照以下 JSON 结构输出，不要输出任何 JSON 之外的说明文字：
{
  "title": "教案标题",
  "textbookAnalysis": "教材分析（200字左右）",
  "studentAnalysis": "学情分析（150字左右）",
  "objectives": ["知识与技能目标", "过程与方法目标", "情感态度与价值观目标"],
  "keyPoints": { "key": "教学重点", "difficult": "教学难点" },
  "preparation": "教学准备（教具、学具、多媒体资源等）",
  "process": [
    { "step": "一、导入新课", "teacher": "教师活动描述", "student": "学生活动描述", "intent": "设计意图" }
  ],
  "boardDesign": "板书设计（用文字描述结构）",
  "reflection": "反思预设（可能出现的问题及应对策略）"
}
2. 教学过程至少包含导入、新授、巩固、小结四个环节，每环节具体、可操作。
3. 教学目标要符合该年级课程标准，难度适中，语言规范。`
}

// 生成课件大纲的提示词（32K 模型）
function buildPPTOutlinePrompt(form) {
  return `请为以下课题生成一份课件大纲：
【课题】${form.topic}
【页数】${form.pages}页
【风格】${form.style}

要求：
1. 严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字，数组元素结构如下：
{"title": "本页标题", "content": "本页内容要点（1-3条，用换行分隔）", "visual": "配图建议", "animation": "动画建议"}
2. 第一页为封面页（包含课题名），最后一页为总结页；内容循序渐进、逻辑清晰。
3. 配图建议与动画建议要具体可执行。`
}

// 生成分层习题的提示词（32K 模型）
function buildExercisesPrompt(form) {
  return `请为以下知识点设计分层习题：
【学科】${form.subject}
【年级】${form.grade}
【知识点】${form.knowledge}
【题型】${form.questionTypes}

要求：
1. 严格按照以下 JSON 结构输出，不要输出任何 JSON 之外的说明文字：
{
  "basic": [
    { "content": "题目内容", "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"], "answer": "正确答案", "analysis": "解析", "difficulty": "基础巩固" }
  ],
  "improve": [
    { "content": "题目内容", "options": [], "answer": "正确答案", "analysis": "解析", "difficulty": "能力提升" }
  ],
  "challenge": [
    { "content": "题目内容", "options": [], "answer": "正确答案", "analysis": "解析", "difficulty": "拓展创新" }
  ]
}
2. 三层各出3题：基础巩固（面向全体学生）、能力提升（面向中等及以上学生）、拓展创新（面向学有余力的学生）。
3. 选择题的 options 为选项数组，非选择题 options 为空数组 []。
4. 解析要讲清解题思路，避免只给结论。`
}

// 学情诊断的提示词（PRO 模型）
function buildAnalysisPrompt(form) {
  return `请对以下学生测验情况进行学情诊断：
【学科】${form.subject}
【年级】${form.grade}
【课题】${form.topic}
【测验得分】${form.score}分
【常见错误】${form.errors || '无'}

要求：
1. 严格按照以下 JSON 结构输出，不要输出任何 JSON 之外的说明文字：
{
  "radar": {
    "max": 100,
    "dimensions": [
      { "name": "知识掌握", "score": 0到100的整数 },
      { "name": "解题能力", "score": 0到100的整数 },
      { "name": "思维方法", "score": 0到100的整数 },
      { "name": "表达规范", "score": 0到100的整数 },
      { "name": "学习习惯", "score": 0到100的整数 }
    ]
  },
  "weakPoints": ["薄弱点1", "薄弱点2", "薄弱点3"],
  "overall": "整体学情评述（150字左右）",
  "suggestions": [
    { "level": "基础巩固层", "content": "针对该层的教学建议" },
    { "level": "能力提升层", "content": "针对该层的教学建议" },
    { "level": "拓展创新层", "content": "针对该层的教学建议" }
  ]
}
2. 雷达图各维度分值要结合测验得分与常见错误合理推断，最高不超过95分。
3. 薄弱点最多3条；教学建议要分层、具体、可执行。`
}

// 热门课题推荐的提示词（DeepSeek 文本模型）
function buildInspirationPrompt(subject) {
  return `请围绕${subject}学科，推荐3个当前热门的备课课题。严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：
[{"title": "课题名称", "reason": "推荐理由（30字以内）"}]`
}

// 课件封面图的提示词（豆包生图模型）
function buildImagePrompt(form) {
  const topic = form.topic || '教学课件'
  const subject = form.subject || '通用'
  const style = form.style || '清新现代'
  return `请为教学课件设计一张封面图：课题《${topic}》，学科：${subject}，风格：${style}。要求：画面包含课题标题文字，扁平插画风格，色彩明快，简洁美观，适合课堂教学投屏使用。`
}

// 完整课件模板选项（AI 课件页的模板 chips）——教学模式轴（参考 ppt-master 的 modes）
const COURSEWARE_TEMPLATES = ['标准结构', '探究式', '情境导入', '大单元教学', '项目式学习', '复习课']

// 课件视觉风格选项——视觉风格轴（参考 ppt-master 的 visual-styles）
const VISUAL_STYLES = ['清新现代', '黑板手绘', '卡通可爱', '极简学术', '国风水墨', '科技蓝']

// 视觉风格 → 配图风格要求（拼进提示词与生图调用）
const VISUAL_STYLE_GUIDE = {
  '清新现代': '清新扁平插画风，柔和渐变底色，圆角元素，色彩明快',
  '黑板手绘': '黑板粉笔手绘风，深绿/深灰底，白色粉笔线条与涂鸦箭头，手写感字体',
  '卡通可爱': 'Q 版卡通风，圆润角色与图标，高饱和度暖色，活泼可爱',
  '极简学术': '极简学术风，大量留白，黑白灰 + 单一强调色，细线条图表',
  '国风水墨': '国风水墨风，宣纸纹理，水墨晕染与毛笔笔触，朱砂点缀',
  '科技蓝': '科技感深蓝渐变风，发光线条与数据可视化元素，网格纹理'
}

// 各课件模板的教学设计说明（拼进提示词）
const TEMPLATE_GUIDE = {
  '标准结构': '采用"导入→新授→巩固→小结→作业"的经典结构，环节完整、稳扎稳打',
  '探究式': '以问题链驱动：每节先抛出一个探究问题，再引导学生在观察/实验/讨论中发现规律，教师最后归纳',
  '情境导入': '每节从一个真实生活情境切入，让学生感受到"知识有用"，再进入知识讲解',
  '大单元教学': '先给出本单元知识地图，再逐节推进，每节都回扣单元大概念，帮助学生建立体系',
  '项目式学习': '以一个小项目/任务为主线，把知识点融入完成任务的过程，末尾给出成果展示页',
  '复习课': '以"知识树→典例精讲→易错辨析→综合演练"为主线，重点查漏补缺'
}

// 一键生成完整课件（10-50 页）的提示词（DeepSeek 文本模型）
// 采用「6 步教研流程」提示词体系（教师社区验证）：
// 单元整体分析 → 定教学目标 → 设大问题+任务活动 → 衔接语+分层评价语 → 分层作业+板书 → 课件页面+配图提示词
function buildCoursewarePrompt(form) {
  const template = form.template || '标准结构'
  const guide = TEMPLATE_GUIDE[template] || TEMPLATE_GUIDE['标准结构']
  const visualStyle = form.visualStyle || '清新现代'
  const styleGuide = VISUAL_STYLE_GUIDE[visualStyle] || VISUAL_STYLE_GUIDE['清新现代']
  const pages = Number(form.pages) || 20
  const subject = form.subject || ''
  const grade = form.grade || ''
  return `你是一名拥有二十年教龄的资深${subject}特级教师，同时是专业课件设计师。请严格按照以下 6 步教研流程，为以下课题制作一套「图文并茂、可直接课堂投屏讲授」的完整课件：
【学科】${subject}
【年级】${grade}
【教材】${form.textbook || '通用教材'}
【课题】${form.topic}
【课件页数】${pages}页
【课件模板】${template}（${guide}）
【视觉风格】${visualStyle}（${styleGuide}）
【学生水平假设】${form.studentLevel || '中等'}
【老师补充要求】${form.requirements || '无'}

第 1 步 单元整体分析：结合课标与教材，从【课标要求】【教材内容】【学情分析】【教学重难点】4 个维度分析本课。
第 2 步 定教学目标：目标必须具体、可观察、可检测，不写笼统的"理解课文"；按学科核心素养维度分解（如语言能力/思维品质/文化意识），每个目标标注核心素养培养方向；贴合${grade}学生实际水平（${form.studentLevel || '中等'}），不拔高不偏低。
第 3 步 设大问题+任务活动：设计一个统摄全课的大问题（开放不空泛、有思维深度、能串联全部环节）；围绕它设计 3-5 个层层递进的课堂任务链，每个任务标注建议时长，40 分钟课堂内可完整落地。
第 4 步 衔接语+分层评价语：每个环节之间写一句自然过渡语（禁用"接下来""下面我们"等生硬衔接词）；写 3 组分层评价语：基础层（学困生，鼓励肯定建自信）/提升层（中等生，引导深化拓思路）/拓展层（尖子生，思维拔高深度探究），全部具体有针对性，拒绝套话。
第 5 步 分层作业+板书：3 层作业（基础层必做巩固核心知识/提升层读写结合中等以上完成/拓展层同主题拓展学有余力选做），总量 ≤5 题；板书分主板书与副板书两区，逻辑清晰、一眼抓住课堂核心。
第 6 步 课件页面与配图提示词：把以上内容拆成 ${pages} 页课件，每页遵守「单页单断言」原则（一页只讲一个知识点，标题写成"本页学什么"的陈述句），每页给出：slideType（版式类型，从以下 8 种中选择最合适的一种：cover 封面 / section 章节过渡页 / concept 概念讲解 / steps 分步教学 / compare 对比归纳 / example 例题精讲 / practice 随堂练习 / summary 小结作业；第 1 页必须是 cover，最后 1 页必须是 summary，课件中途至少 1 页 section）、title（≤15字，陈述句）、content（2-4条要点，每条≤25字；compare 页用"【对比项A】xxx\\n【对比项B】xxx"格式分行）、speakerNotes（教师讲解词60-100字，先定义后举例，含互动话术）、visual/animation（配图与动画建议，必须与视觉风格一致）、imagePrompt（该页 AI 配图提示词，必须包含【页面主题】【视觉元素】【排版布局】【风格要求】四要素，其中【风格要求】必须落实"${styleGuide}"）、layout（排版布局描述）。

第 1 页为封面页（课题/学科/年级/教材），最后 1 页为「课堂小结+作业」页；所有页面配图比例 16:9 横版，视觉风格全书统一为「${visualStyle}」。

严格按照以下 JSON 结构输出，不要输出任何 JSON 之外的说明文字：
{
  "pack": {
    "unitAnalysis": "单元整体分析（含课标要求/教材内容/学情分析/教学重难点）",
    "objectives": ["目标1（标注核心素养）", "目标2", "目标3"],
    "bigQuestion": "统摄全课的大问题",
    "taskChain": [{"task": "任务名", "activity": "学生活动", "minutes": "建议时长"}],
    "transitions": ["过渡语1", "过渡语2"],
    "evaluation": [{"level": "基础层", "content": "评价语"}, {"level": "提升层", "content": "评价语"}, {"level": "拓展层", "content": "评价语"}],
    "homework": [{"level": "基础层", "items": "题目"}, {"level": "提升层", "items": "题目"}, {"level": "拓展层", "items": "题目"}],
    "boardDesign": "板书方案（主板书/副板书分区）"
  },
  "slides": [{"slideType": "concept", "title": "页标题", "content": "要点", "visual": "配图建议", "animation": "动画建议", "speakerNotes": "讲解词", "imagePrompt": "该页配图提示词（含页面主题/视觉元素/排版布局/风格要求）", "layout": "排版布局"}]
}`
}

// 生成单词表的提示词（DeepSeek 文本模型）
function buildWordsPrompt(form) {
  return `请为英语教学生成一份单词表：
【主题】${form.theme}
【数量】${form.count}个
【年级】${form.grade || '不限'}

要求：
1. 单词紧扣主题、实用常见，难度匹配年级。
2. 严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：
[{"word":"单词","phonetic":"英式音标","meaning":"中文释义","example":"英文例句（不超过12个词）","exampleCn":"例句中文翻译"}]`
}

// 生成错题变式题的提示词（DeepSeek 文本模型）
function buildVariantsPrompt(item) {
  return `请根据下面这道错题，生成 3 道同类变式练习题，帮助学生巩固薄弱点：
【学科】${item.subject || '通用'}
【知识点】${item.knowledge || '未注明'}
【原题】${item.content}

要求：
1. 变式题保持原题考点不变：第 1 道与原题难度相同，第 2 道稍难，第 3 道综合运用。
2. 题目表述与原题有变化（换数字/换情境/换问法），避免简单重复。
3. 严格按照 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：
[{"content":"题目内容","answer":"答案","analysis":"解析（讲清解题思路）"}]`
}

// 生成说课稿的提示词（DeepSeek 文本模型）
function buildLectureScriptPrompt(form, pack) {
  const packText = pack
    ? '\n【课件教研包】\n单元整体分析：' + (pack.unitAnalysis || '') +
      '\n教学目标：' + (pack.objectives || []).join('；') +
      '\n大问题：' + (pack.bigQuestion || '') +
      '\n任务链：' + (pack.taskChain || []).map(t => t.task + '（' + (t.minutes || '') + '）').join('、') +
      '\n板书设计：' + (pack.boardDesign || '')
    : ''
  return '你是一位多次获得省级教学竞赛一等奖的资深教师，请为以下课题撰写一份规范、生动的【说课稿】（面向评委/教研组的现场说课，时长约 8-10 分钟）：\n' +
    '【学科】' + (form.subject || '') + '\n' +
    '【年级】' + (form.grade || '') + '\n' +
    '【教材】' + (form.textbook || '通用教材') + '\n' +
    '【课题】' + (form.topic || '') + '\n' +
    packText + '\n' +
    '【老师补充要求】' + (form.requirements || '无') + '\n\n' +
    '要求：\n' +
    '1. 按标准说课结构分节撰写，每节使用「一、说教材」「二、说学情」「三、说教学目标」「四、说重难点」「五、说教法学法」「六、说教学过程」「七、说板书设计」「八、说教学反思」格式的小标题；\n' +
    '2. 语言口语化、有感染力，适合现场脱稿演说，不要写成教案；\n' +
    '3. 教学过程部分要有清晰的环节时间线（导入→新授→巩固→小结）；\n' +
    '4. 严格输出纯文本，不要输出 JSON，不要任何多余说明文字。'
}

// 生成随堂挖空练习的提示词（DeepSeek 文本模型）
function buildClozePrompt(form, slidesText) {
  return '请基于下面的课件内容，为课堂设计一组随堂练习（以挖空/填空题为主）：\n' +
    '【学科】' + (form.subject || '') + '\n' +
    '【年级】' + (form.grade || '') + '\n' +
    '【课题】' + (form.topic || '') + '\n' +
    '【课件内容要点】\n' + String(slidesText || '').slice(0, 2000) + '\n\n' +
    '要求：\n' +
    '1. 出 5 道挖空填空题（句子中留 ____ 空）+ 2 道选择题，全部紧扣课件中的知识点；\n' +
    '2. 挖空题的答案必须是课件中出现过的关键概念/公式/词语；\n' +
    '3. 选择题 4 个选项，附 1 句解析；\n' +
    '4. 严格按照以下 JSON 数组格式输出，不要输出任何 JSON 之外的说明文字：\n' +
    '[{"type":"blank","content":"含 ____ 的句子","answer":"答案"},{"type":"choice","content":"题干","options":["A. 选项","B. 选项","C. 选项","D. 选项"],"answer":"答案","analysis":"解析"}]'
}

// 生成课件开场小视频的提示词（豆包视频模型）
function buildVideoPrompt(form) {
  const topic = form.topic || '教学课件'
  const subject = form.subject || '通用'
  const visualStyle = form.visualStyle || '清新现代'
  return `生成一个 5 秒的课堂教学开场小动画：主题《${topic}》，学科${subject}，风格：${visualStyle}。画面要求：开场出现课程标题文字，配合轻快的动态元素（书本翻开/粉笔书写/知识粒子汇聚等），色彩明快，无人物对白，适合课堂投屏播放。`
}

/* ==================== 结果纯文本格式化 ==================== */

// 将 AI 结果格式化为纯文本（复制全文用）
function formatText(type, data) {
  if (!data) return ''
  const line = '--------------------------------'

  // 教案
  if (type === 'lesson_plan') {
    const kp = data.keyPoints || {}
    const objectives = Array.isArray(data.objectives)
      ? data.objectives.map((o, i) => `目标${i + 1}：${o}`).join('\n')
      : data.objectives
    const process = Array.isArray(data.process)
      ? data.process
          .map(p => `${p.step}\n教师活动：${p.teacher}\n学生活动：${p.student}\n设计意图：${p.intent}`)
          .join('\n\n')
      : data.process
    return [
      `【教案】${data.title || ''}`,
      '',
      '一、教材分析',
      data.textbookAnalysis || '',
      '',
      '二、学情分析',
      data.studentAnalysis || '',
      '',
      '三、教学目标',
      objectives || '',
      '',
      '四、教学重难点',
      `教学重点：${kp.key || ''}\n教学难点：${kp.difficult || ''}`,
      '',
      '五、教学准备',
      data.preparation || '',
      '',
      '六、教学过程',
      process || '',
      '',
      '七、板书设计',
      data.boardDesign || '',
      '',
      '八、反思预设',
      data.reflection || ''
    ].join('\n')
  }

  // 课件大纲
  if (type === 'ppt_outline') {
    const slides = Array.isArray(data) ? data : data.slides || []
    return slides
      .map((s, i) => `第${i + 1}页：${s.title}\n内容要点：${s.content}\n配图建议：${s.visual}\n动画建议：${s.animation}`)
      .join('\n' + line + '\n')
  }

  // 完整课件（教学研究包 + 逐页内容 + 配图提示词）
  if (type === 'courseware') {
    const pack = data.pack || {}
    const slides = Array.isArray(data.slides) ? data.slides : (Array.isArray(data) ? data : [])
    const taskChain = (pack.taskChain || []).map(t => `· ${t.task}（${t.minutes || ''}）：${t.activity || ''}`).join('\n')
    const evaluation = (pack.evaluation || []).map(e => `【${e.level}】${e.content}`).join('\n')
    const homework = (pack.homework || []).map(h => `【${h.level}】${h.items}`).join('\n')
    return [
      `【完整课件】${data.topic || ''}`,
      '',
      '一、单元整体分析',
      pack.unitAnalysis || '',
      '',
      '二、教学目标',
      (pack.objectives || []).map((o, i) => `目标${i + 1}：${o}`).join('\n'),
      '',
      '三、大问题',
      pack.bigQuestion || '',
      '',
      '四、课堂任务链',
      taskChain,
      '',
      '五、环节过渡语',
      (pack.transitions || []).join('\n'),
      '',
      '六、分层评价语',
      evaluation,
      '',
      '七、分层作业',
      homework,
      '',
      '八、板书设计',
      pack.boardDesign || '',
      '',
      '九、课件逐页内容',
      slides.map((s, i) => `第${i + 1}页：${s.title}\n内容要点：${s.content}\n配图建议：${s.visual}\n动画建议：${s.animation}\n讲解词：${s.speakerNotes || ''}\n配图提示词：${s.imagePrompt || ''}`).join('\n' + line + '\n')
    ].join('\n')
  }

  // 分层习题
  if (type === 'exercises') {
    const levelNames = { basic: '基础巩固', improve: '能力提升', challenge: '拓展创新' }
    const parts = []
    ;['basic', 'improve', 'challenge'].forEach(level => {
      const list = data[level] || []
      if (!list.length) return
      parts.push(`【${levelNames[level]}】`)
      list.forEach((q, i) => {
        parts.push(`${i + 1}. ${q.content}`)
        if (Array.isArray(q.options) && q.options.length) parts.push(q.options.join('\n'))
        parts.push(`答案：${q.answer || '略'}`)
        parts.push(`解析：${q.analysis || '略'}`)
      })
    })
    return parts.join('\n' + line + '\n')
  }

  // 学情诊断
  if (type === 'analysis') {
    const dims = (data.radar && data.radar.dimensions) || []
    return [
      `【学情诊断】${data.topic || ''}`,
      '',
      '一、能力雷达',
      dims.map(d => `${d.name}：${d.score}分`).join('\n'),
      '',
      '二、整体评述',
      data.overall || '',
      '',
      '三、薄弱点',
      (data.weakPoints || []).map((w, i) => `${i + 1}. ${w}`).join('\n'),
      '',
      '四、分层教学建议',
      (data.suggestions || []).map(s => `【${s.level}】${s.content}`).join('\n\n')
    ].join('\n')
  }

  return ''
}

module.exports = {
  buildLessonPlanPrompt,
  buildPPTOutlinePrompt,
  buildExercisesPrompt,
  buildAnalysisPrompt,
  buildInspirationPrompt,
  buildImagePrompt,
  buildCoursewarePrompt,
  buildWordsPrompt,
  buildVariantsPrompt,
  buildLectureScriptPrompt,
  buildClozePrompt,
  buildVideoPrompt,
  COURSEWARE_TEMPLATES,
  VISUAL_STYLES,
  formatText
}
