/**
 * exportPPTX 云函数（v3 版式设计引擎版）
 * - 使用 pptxgenjs 生成 16:9 宽屏 PPTX
 * - 【配图修复】addImage 统一传 base64 data URI（'data:image/png;base64,...'），
 *   解决导出到 WPS / PowerPoint 后配图消失的问题（旧版传 Buffer 裸对象导致图片嵌入失败）
 * - 【8 版式设计引擎】按 slide.slideType 分发到独立布局函数：
 *   cover / section / concept / steps / compare / example / practice / summary（缺省 concept），
 *   全部使用 pptxgenjs 原生形状，颜色取自主题色：T 主色 / TL 浅底 / TBG 交替背景 / DARK 标题 / GRAY 次要 / BODY 正文
 * - 每页保留：页码胶囊（右下角）、页脚「AI备课助手 · 智能课件」、speakerNotes → addNotes
 * - 交替背景仅 concept / example / practice 使用；cover / section / summary 使用固定底色
 * - 配图规则：cover / section 不配图；concept / example 有 imageFileID 才放右图；steps / compare / practice / summary 不放图
 * - 生成后调用 anim.js 注入动画（每页淡入切换 + 形状依次入场淡入，注入失败自动回退无动画版）
 * - 导出成功后扣除 20 积分并写入流水
 */
const cloud = require('wx-server-sdk')
const { injectAnimations } = require('./anim.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 本函数每次成功调用消耗的积分
const CREDIT_COST = 20

// ==================== 设计系统 ====================
const DARK = '1F2329' // 标题深色
const GRAY = '86909C' // 次要文字（页脚）
const BODY = '4E5969' // 正文

// 视觉风格 → 导出配色映射（与课件页 6 种视觉风格联动）
const STYLE_THEMES = {
  '清新现代': { primary: '1677FF', light: 'E8F3FF', bg: 'F5F7FA' },
  '黑板手绘': { primary: '3D5A5C', light: 'EAF0E8', bg: 'F2F0E9' },
  '卡通可爱': { primary: 'FF7D00', light: 'FFF3E8', bg: 'FFF9F0' },
  '极简学术': { primary: '1F2329', light: 'F2F3F5', bg: 'FFFFFF' },
  '国风水墨': { primary: '8C6D46', light: 'F5EFE6', bg: 'FAF7F2' },
  '科技蓝': { primary: '0E7490', light: 'E0F2FE', bg: 'F0F9FF' }
}

// 根据视觉风格取主题色（未命中用默认清新现代）
function getTheme(visualStyle) {
  return STYLE_THEMES[visualStyle] || STYLE_THEMES['清新现代']
}

// 8 种版式合法值（与 generateCourseware 的 slideType 归一化保持一致）
const SLIDE_TYPES = ['cover', 'section', 'concept', 'steps', 'compare', 'example', 'practice', 'summary']

// slideType 归一化：非法值 / 缺省一律回退 'concept'
function getSlideType(s) {
  const t = String((s && s.slideType) || '').trim()
  return SLIDE_TYPES.indexOf(t) >= 0 ? t : 'concept'
}

// ==================== 通用工具 ====================

// 余额校验：用户不存在→code1；余额不足→code2
async function ensureBalance(openid) {
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

// 扣费+流水（尽力而为，失败仅记日志）
async function chargeCredits(user, remark) {
  try {
    await db.collection('users').doc(user._id).update({
      data: { balance: _.inc(-CREDIT_COST), totalConsume: _.inc(CREDIT_COST) }
    })
  } catch (e) { console.error('扣除积分失败', e) }
  try {
    await db.collection('transactions').add({
      data: { _openid: user._openid, type: 'consume', credits: -CREDIT_COST, remark, createTime: Date.now() }
    })
  } catch (e) { console.error('写入积分流水失败', e) }
}

// 按行拆分正文并过滤空行
function contentLines(content) {
  return String(content || '').split('\n').map(t => t.trim()).filter(Boolean)
}

// ==================== 通用装饰元素 ====================

// 标题区：标题 + 标题下主色小色条（concept/steps/compare/example/practice 共用）
function addTitleBar(slide, s, idx, theme) {
  const T = theme.primary
  slide.addText(String((s && s.title) || '第' + (idx + 1) + '页'), { x: 0.55, y: 0.35, w: 8.4, h: 0.75, fontSize: 24, bold: true, color: DARK })
  slide.addShape('rect', { x: 0.58, y: 1.15, w: 1.1, h: 0.05, fill: { color: T }, line: { type: 'none' } })
}

// 左侧主题竖条（内容页统一装饰，与 v2 一致）
function addSideBar(slide, theme) {
  slide.addShape('rect', { x: 0, y: 0, w: 0.16, h: 5.625, fill: { color: theme.primary }, line: { type: 'none' } })
}

// 页脚
function addFooter(slide) {
  slide.addText('AI备课助手 · 智能课件', { x: 0.55, y: 5.25, w: 3, h: 0.3, fontSize: 9, color: GRAY })
}

// 页码胶囊（右下角）
function addPagination(slide, idx, theme) {
  slide.addShape('roundRect', { x: 9.05, y: 4.9, w: 0.6, h: 0.42, rectRadius: 0.2, fill: { color: theme.primary }, line: { type: 'none' } })
  slide.addText(String(idx + 1), { x: 9.05, y: 4.9, w: 0.6, h: 0.42, fontSize: 11, color: 'FFFFFF', align: 'center', valign: 'middle' })
}

// 内容页通用页脚装饰：页脚 + 页码胶囊
function addPageChrome(slide, idx, theme) {
  addFooter(slide)
  addPagination(slide, idx, theme)
}

/**
 * 配图嵌入（关键修复）：下载图片 → Buffer 转 base64 → 拼成 data URI 再 addImage。
 * pptxgenjs 的 addImage({ data }) 要求 base64 数据 URI，直接传 Buffer 会导致
 * WPS / PowerPoint 打开后图片嵌入失败、配图消失。
 * 下载失败或无图时自动画「浅底圆角卡 + 书本 emoji + 提示文字」占位，杜绝只剩文字观感。
 */
async function addSlideImage(slide, s, theme, x, y, w, h) {
  const T = theme.primary
  const TL = theme.light
  let placed = false
  if (s && s.imageFileID) {
    try {
      const dl = await cloud.downloadFile({ fileID: s.imageFileID })
      const buf = dl && dl.fileContent
      // 生图接口返回的都是 PNG，统一用 image/png 声明
      const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : String(buf)
      if (b64) {
        slide.addImage({ data: 'data:image/png;base64,' + b64, x, y, w, h })
        placed = true
      }
    } catch (e) {
      console.error('下载配图失败，改用画风占位', e)
    }
  }
  if (!placed) {
    // 画风占位（随区域尺寸自适应）
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: TL }, line: { type: 'none' } })
    const emojiH = Math.min(0.9, Math.max(0.4, h * 0.32))
    const emojiY = y + (h - emojiH - 0.5) / 2
    slide.addText('📚', { x, y: emojiY, w, h: emojiH, fontSize: Math.min(34, emojiH * 38), align: 'center', color: T })
    slide.addText('本页知识要点', { x, y: emojiY + emojiH + 0.08, w, h: 0.42, fontSize: Math.max(9, Math.min(12, h * 4)), align: 'center', color: T })
  }
  return placed
}

// ==================== 8 版式布局函数 ====================

/**
 * 版式 1：cover 封面（照抄现有封面实现）
 * T 底 + 两个白色 85% 透明装饰圆 + 36 号白主标题居中 + 副标题 + 白色 40% 透明细线 + 底部品牌署名
 */
function paintCover(slide, title, subtitle, theme) {
  const T = theme.primary
  slide.background = { color: T }
  // 右上装饰大圆（白色 85% 透明，部分超出画布）
  slide.addShape('ellipse', { x: 7.6, y: -0.8, w: 3, h: 3, fill: { color: 'FFFFFF', transparency: 85 }, line: { type: 'none' } })
  // 左下装饰小圆
  slide.addShape('ellipse', { x: -0.5, y: 4.5, w: 1.6, h: 1.6, fill: { color: 'FFFFFF', transparency: 85 }, line: { type: 'none' } })
  // 主标题
  slide.addText(String(title || 'AI课件'), { x: 0.8, y: 1.5, w: 8.4, h: 1.5, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center' })
  // 副标题
  slide.addText(String(subtitle || ''), { x: 0.8, y: 3.15, w: 8.4, h: 0.6, fontSize: 18, color: 'FFFFFF', align: 'center' })
  // 中部一条白色 40% 透明细线
  slide.addShape('line', { x: 3, y: 4.15, w: 4, h: 0, line: { color: 'FFFFFF', transparency: 40, width: 0.75 } })
  // 底部品牌署名
  slide.addText('AI备课助手 · 豆包大模型驱动', { x: 0.8, y: 4.9, w: 8.4, h: 0.3, fontSize: 12, color: 'FFFFFF', align: 'center' })
}

// 新建一页封面（默认封面入口，带讲解词备注）
function buildCover(pptx, opts, theme) {
  const slide = pptx.addSlide()
  paintCover(slide, opts.title, opts.subtitle, theme)
  if (opts.speakerNotes) slide.addNotes(String(opts.speakerNotes))
  return slide
}

// slides 中出现 cover 版式页时，把封面设计画到该页上（主分发 case 'cover' 使用）
function addCoverDesign(slide, s, theme) {
  const title = String((s && s.title) || 'AI课件')
  const subtitle = s && s.content ? String(s.content).split('\n')[0] : ''
  paintCover(slide, title, subtitle, theme)
}

/**
 * 版式 2：section 章节过渡页
 * TBG 底 + 左侧大竖条（T）+ 竖条内白色大号章节号「0X」+ 右侧居中大标题 + 标题下 T 色条 + 副文（content 第一行）
 */
function addSectionSlide(slide, s, idx, theme) {
  const T = theme.primary
  const TBG = theme.bg
  slide.background = { color: TBG }
  // 左侧大竖条（全高主色）
  slide.addShape('rect', { x: 0, y: 0, w: 2.2, h: 5.625, fill: { color: T }, line: { type: 'none' } })
  // 竖条内白色大号章节号「0X」（取 slide.number，缺省用 idx）
  const num = s && s.number != null ? Number(s.number) : idx + 1
  const label = num >= 10 ? String(num) : '0' + num
  slide.addText(label, { x: 0, y: 1.75, w: 2.2, h: 1.6, fontSize: 72, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  // 右侧居中大标题
  slide.addText(String((s && s.title) || '章节'), { x: 2.7, y: 1.9, w: 6.8, h: 0.85, fontSize: 30, bold: true, color: DARK, align: 'center', valign: 'middle' })
  // 标题下主色条（居中）
  slide.addShape('rect', { x: 4.85, y: 2.9, w: 1.5, h: 0.06, fill: { color: T }, line: { type: 'none' } })
  // 副文（content 第一行）
  const sub = s && s.content ? String(s.content).split('\n')[0].trim() : ''
  if (sub) slide.addText(sub, { x: 2.7, y: 3.25, w: 6.8, h: 0.5, fontSize: 14, color: BODY, align: 'center' })
  addPageChrome(slide, idx, theme)
}

/**
 * 版式 3：concept 概念讲解（沿用 v2 布局）
 * 左侧要点区 + 右侧配图区（有图放 base64 配图，无图/失败画占位）+ 要点上方「核心概念」胶囊
 */
async function addConceptSlide(slide, s, idx, theme) {
  const T = theme.primary
  const TL = theme.light
  const TBG = theme.bg
  slide.background = { color: idx % 2 === 0 ? 'FFFFFF' : TBG }
  addSideBar(slide, theme)
  addTitleBar(slide, s, idx, theme)
  // 「核心概念」胶囊（要点上方，浅底 + 主色文字）
  slide.addShape('roundRect', { x: 0.55, y: 1.42, w: 1.6, h: 0.42, rectRadius: 0.21, fill: { color: TL }, line: { type: 'none' } })
  slide.addText('核心概念', { x: 0.55, y: 1.42, w: 1.6, h: 0.42, fontSize: 12, bold: true, color: T, align: 'center', valign: 'middle' })
  // 要点 bullet
  const bullets = contentLines(s && s.content).map(t => ({ text: t, options: { bullet: { code: '2022' }, color: BODY, fontSize: 15, breakLine: true } }))
  if (bullets.length) slide.addText(bullets, { x: 0.55, y: 2.05, w: 5.4, h: 2.8, valign: 'top' })
  // 右侧配图 / 占位
  await addSlideImage(slide, s, theme, 6.25, 1.45, 3.3, 2.8)
  addPageChrome(slide, idx, theme)
}

/**
 * 版式 4：steps 分步教学
 * 标题区后把 content 按行拆成步骤（最多 4 步），横向排列步骤卡：
 * 每张浅底圆角卡 + 顶部主色小圆内白色序号 ①②③④ + 下方 12 号 DARK 步骤文字（底部不设讲解词区）
 */
function addStepsSlide(slide, s, idx, theme) {
  const T = theme.primary
  const TL = theme.light
  slide.background = { color: 'FFFFFF' }
  addSideBar(slide, theme)
  addTitleBar(slide, s, idx, theme)
  // 步骤：按 \n 拆分，最多 4 步
  let steps = contentLines(s && s.content).slice(0, 4)
  if (!steps.length) steps = ['（本页暂无步骤内容）']
  const N = steps.length
  const gap = 0.3
  const areaW = 8.9 // 可用宽度 0.55 ~ 9.45
  const cardW = (areaW - (N - 1) * gap) / N
  const nums = ['①', '②', '③', '④']
  for (let i = 0; i < N; i++) {
    const x = 0.55 + i * (cardW + gap)
    // 步骤卡：浅底圆角矩形
    slide.addShape('roundRect', { x, y: 1.8, w: cardW, h: 3.2, rectRadius: 0.12, fill: { color: TL }, line: { type: 'none' } })
    // 顶部小圆 + 白色序号
    slide.addShape('ellipse', { x: x + (cardW - 0.5) / 2, y: 1.98, w: 0.5, h: 0.5, fill: { color: T }, line: { type: 'none' } })
    slide.addText(nums[i], { x: x + (cardW - 0.5) / 2, y: 1.98, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    // 步骤文字
    slide.addText(steps[i], { x: x + 0.2, y: 2.7, w: cardW - 0.4, h: 2.1, fontSize: 12, color: DARK, align: 'center', valign: 'top' })
  }
  addPageChrome(slide, idx, theme)
}

// 对比列标签：从首行前缀提取（【对比项A】/A/左 → 对比 A；【对比项B】/B/右 → 对比 B），否则用默认
function compareLabel(lines, side) {
  const first = lines && lines[0] ? lines[0] : ''
  const wantA = side === 'left'
  if (wantA && /^【对比项A】/.test(first)) return '对比 A'
  if (!wantA && /^【对比项B】/.test(first)) return '对比 B'
  const m = first.match(new RegExp('^(' + (wantA ? 'A|左' : 'B|右') + ')[：:、.．\\s]'))
  if (m) return '对比 ' + m[1]
  return wantA ? '对比 A' : '对比 B'
}

// 对比内容拆列：以「A」/「B」或「左」/「右」（含【对比项A】【对比项B】）开头分列；
// 剩余无前缀行按前半行进左列、后半行进右列兜底
function splitCompare(content) {
  const lines = contentLines(content)
  const left = []
  const right = []
  const rest = []
  lines.forEach(line => {
    if (/^(A|左|【对比项A】)/.test(line)) left.push(line)
    else if (/^(B|右|【对比项B】)/.test(line)) right.push(line)
    else rest.push(line)
  })
  // 无前缀行：前半行进左列、后半行进右列
  const half = Math.ceil(rest.length / 2)
  rest.forEach((line, i) => {
    if (i < half) left.push(line)
    else right.push(line)
  })
  if (!left.length) left.push('（无对比内容）')
  if (!right.length) right.push('（无对比内容）')
  return { left, right }
}

/**
 * 版式 5：compare 对比归纳
 * 标题区后两个并排浅底圆角卡，两列顶部各放主色小胶囊标题，列内 13 号 BODY 分行
 */
function addCompareSlide(slide, s, idx, theme) {
  const T = theme.primary
  const TL = theme.light
  slide.background = { color: 'FFFFFF' }
  addSideBar(slide, theme)
  addTitleBar(slide, s, idx, theme)
  const { left, right } = splitCompare(s && s.content)
  const cardW = 4.1
  const cardH = 3.2
  const cardY = 1.8
  const cardXs = [0.55, 4.85]
  const columns = [['left', left], ['right', right]]
  columns.forEach((pair, i) => {
    const side = pair[0]
    const lines = pair[1]
    const x = cardXs[i]
    // 并排圆角卡（浅底）
    slide.addShape('roundRect', { x, y: cardY, w: cardW, h: cardH, rectRadius: 0.12, fill: { color: TL }, line: { type: 'none' } })
    // 顶部小胶囊标题（骑在卡片上边缘）
    const label = compareLabel(lines, side)
    const pillW = Math.max(1.3, label.length * 0.24 + 0.3)
    slide.addShape('roundRect', { x: x + (cardW - pillW) / 2, y: cardY - 0.22, w: pillW, h: 0.44, rectRadius: 0.22, fill: { color: T }, line: { type: 'none' } })
    slide.addText(label, { x: x + (cardW - pillW) / 2, y: cardY - 0.22, w: pillW, h: 0.44, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    // 列内 13 号 BODY 分行
    const texts = lines.map(t => ({ text: t, options: { color: BODY, fontSize: 13, breakLine: true } }))
    slide.addText(texts, { x: x + 0.25, y: cardY + 0.45, w: cardW - 0.5, h: cardH - 0.65, valign: 'top' })
  })
  addPageChrome(slide, idx, theme)
}

/**
 * 版式 6：example 例题精讲
 * 左侧「例题」框（白底 + 主色描边）+ 框上「例题」主色胶囊 + 右下「解析」框（浅底，内容取 analysis 或 visual）
 * 有配图时右上放配图、右下放解析框；无配图时右侧整列为解析框
 */
async function addExampleSlide(slide, s, idx, theme) {
  const T = theme.primary
  const TL = theme.light
  const TBG = theme.bg
  slide.background = { color: idx % 2 === 0 ? 'FFFFFF' : TBG }
  addSideBar(slide, theme)
  addTitleBar(slide, s, idx, theme)
  const hasImage = !!(s && s.imageFileID)
  // 左侧「例题」框：白底圆角矩形 + 主色描边
  slide.addShape('roundRect', { x: 0.55, y: 1.7, w: 5.2, h: 2.9, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: T, width: 1.25 } })
  // 框上「例题」胶囊：主色底 + 白字
  slide.addShape('roundRect', { x: 0.75, y: 1.48, w: 1.0, h: 0.44, rectRadius: 0.22, fill: { color: T }, line: { type: 'none' } })
  slide.addText('例题', { x: 0.75, y: 1.48, w: 1.0, h: 0.44, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  // 例题内容（13 号 DARK）
  const contentTexts = contentLines(s && s.content).length
    ? contentLines(s && s.content).map(t => ({ text: t, options: { color: DARK, fontSize: 13, breakLine: true } }))
    : [{ text: '（暂无例题内容）', options: { color: DARK, fontSize: 13 } }]
  slide.addText(contentTexts, { x: 0.8, y: 2.05, w: 4.7, h: 2.35, valign: 'top' })
  // 解析内容：优先 analysis 字段，其次 visual 字段
  const analysis = String((s && (s.analysis || s.visual)) || '（暂无解析）')
  const analysisTexts = contentLines(analysis).map(t => ({ text: t, options: { color: BODY, fontSize: 13, breakLine: true } }))
  if (hasImage) {
    // 有配图：右上配图（base64）+ 右下解析框
    await addSlideImage(slide, s, theme, 6.05, 1.7, 3.4, 1.35)
    slide.addShape('roundRect', { x: 6.05, y: 3.25, w: 3.4, h: 1.35, rectRadius: 0.08, fill: { color: TL }, line: { type: 'none' } })
    slide.addText('解析', { x: 6.2, y: 3.33, w: 1, h: 0.32, fontSize: 12, bold: true, color: T })
    slide.addText(analysisTexts, { x: 6.2, y: 3.65, w: 3.1, h: 0.85, valign: 'top' })
  } else {
    // 无配图：右侧整列为解析框
    slide.addShape('roundRect', { x: 6.05, y: 1.7, w: 3.4, h: 2.9, rectRadius: 0.08, fill: { color: TL }, line: { type: 'none' } })
    slide.addText('解析', { x: 6.2, y: 1.85, w: 1, h: 0.32, fontSize: 12, bold: true, color: T })
    slide.addText(analysisTexts, { x: 6.2, y: 2.2, w: 3.1, h: 2.2, valign: 'top' })
  }
  addPageChrome(slide, idx, theme)
}

/**
 * 版式 7：practice 随堂练习
 * 标题区后大圆角卡（浅底）内左侧大「✍️」36 号 + 右侧 content 14 号 DARK，底部灰色提示条
 */
function addPracticeSlide(slide, s, idx, theme) {
  const TL = theme.light
  const TBG = theme.bg
  slide.background = { color: idx % 2 === 0 ? 'FFFFFF' : TBG }
  addSideBar(slide, theme)
  addTitleBar(slide, s, idx, theme)
  // 大圆角卡（浅底）
  slide.addShape('roundRect', { x: 0.55, y: 1.6, w: 8.9, h: 2.9, rectRadius: 0.15, fill: { color: TL }, line: { type: 'none' } })
  // 左侧大「✍️」
  slide.addText('✍️', { x: 1.0, y: 2.3, w: 1.4, h: 1.5, fontSize: 36, align: 'center', valign: 'middle' })
  // 右侧练习内容（14 号 DARK）
  const texts = contentLines(s && s.content).length
    ? contentLines(s && s.content).map(t => ({ text: t, options: { color: DARK, fontSize: 14, breakLine: true } }))
    : [{ text: '（暂无练习内容）', options: { color: DARK, fontSize: 14 } }]
  slide.addText(texts, { x: 2.7, y: 1.9, w: 6.4, h: 2.3, valign: 'middle' })
  // 底部提示条（12 号 GRAY）
  slide.addText('请同学们先独立思考，再对答案', { x: 0.55, y: 4.75, w: 8.9, h: 0.35, fontSize: 12, color: GRAY, align: 'center' })
  addPageChrome(slide, idx, theme)
}

/**
 * 版式 8：summary 小结作业
 * TBG 底 + 顶部「本课小结」主色胶囊 + content 每条前画主色 ✓ + 底部「课后作业」区（homework 行 12 号 BODY）
 */
function addSummarySlide(slide, s, idx, theme) {
  const T = theme.primary
  const TBG = theme.bg
  slide.background = { color: TBG }
  addSideBar(slide, theme)
  // 顶部「本课小结」胶囊（主色底 + 白字）
  slide.addShape('roundRect', { x: 0.55, y: 0.45, w: 1.7, h: 0.5, rectRadius: 0.25, fill: { color: T }, line: { type: 'none' } })
  slide.addText('本课小结', { x: 0.55, y: 0.45, w: 1.7, h: 0.5, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  // content 每条前画 ✓（主色）+ 文本
  const lines = contentLines(s && s.content).slice(0, 5)
  lines.forEach((line, i) => {
    const y = 1.25 + i * 0.55
    slide.addText('✓', { x: 0.75, y, w: 0.4, h: 0.45, fontSize: 14, bold: true, color: T, align: 'center', valign: 'middle' })
    slide.addText(line, { x: 1.2, y, w: 8.0, h: 0.45, fontSize: 14, color: DARK, valign: 'middle' })
  })
  // 底部「课后作业」区（homework 行，12 号 BODY）
  const homework = contentLines(s && s.homework).slice(0, 3)
  if (homework.length) {
    slide.addText('课后作业', { x: 0.75, y: 4.25, w: 2, h: 0.35, fontSize: 14, bold: true, color: T })
    const hwTexts = homework.map(t => ({ text: t, options: { color: BODY, fontSize: 12, breakLine: true } }))
    slide.addText(hwTexts, { x: 0.75, y: 4.6, w: 8.4, h: 0.55, valign: 'top' })
  }
  addPageChrome(slide, idx, theme)
}

// ==================== 版式主分发 ====================

/**
 * addContentSlide 主分发：按 slideType 选择版式布局函数（缺省按 concept）
 * @param {object} slide pptxgenjs 幻灯片对象（已由 pptx.addSlide() 创建）
 * @param {object} s 幻灯片数据 { title, content, slideType, imageFileID, speakerNotes, ... }
 * @param {number} idx 页序号（0 起）
 * @param {object} theme 主题色 { primary, light, bg }
 */
async function addContentSlide(slide, s, idx, theme) {
  switch (getSlideType(s)) {
    case 'section': return addSectionSlide(slide, s, idx, theme)
    case 'steps': return addStepsSlide(slide, s, idx, theme)
    case 'compare': return addCompareSlide(slide, s, idx, theme)
    case 'example': return addExampleSlide(slide, s, idx, theme)
    case 'practice': return addPracticeSlide(slide, s, idx, theme)
    case 'summary': return addSummarySlide(slide, s, idx, theme)
    case 'cover': return addCoverDesign(slide, s, theme)
    case 'concept':
    default: return addConceptSlide(slide, s, idx, theme)
  }
}

// ==================== 主入口 ====================

exports.main = async (event) => {
  try {
    // ① 余额校验（余额不足返回 code 2，由前端引导充值）
    const { OPENID } = cloud.getWXContext()
    const userId = String(event.userId || OPENID || '') // H5 网页版使用前端匿名 userId，小程序使用 openid
    const bal = await ensureBalance(userId)
    if (!bal.ok) {
      return { code: bal.code, message: bal.message }
    }

    // ② 校验 slides（最多 60 页）
    const slides = Array.isArray(event.slides) ? event.slides.slice(0, 60) : []
    if (slides.length < 1) {
      return { code: 1, message: '没有可导出的课件内容' }
    }

    // ③ 生成 PPTX（8 版式设计引擎）
    const pptxgen = require('pptxgenjs')
    const pptx = new pptxgen()
    pptx.defineLayout({ name: 'WIDE', width: 10, height: 5.625 })
    pptx.layout = 'WIDE'
    pptx.author = 'AI备课助手'
    pptx.title = String(event.title || 'AI课件')

    // 视觉风格主题（与课件页 6 种视觉风格联动）
    const theme = getTheme(String(event.visualStyle || '清新现代'))

    // 封面：slides[0] 为 cover 版式时直接消费为封面（避免重复封面页）；
    // 否则沿用事件级标题/副标题构建默认封面（照抄 v2 封面实现）
    let contentSlides = slides
    const first = slides[0] || {}
    if (getSlideType(first) === 'cover') {
      buildCover(pptx, {
        title: String(first.title || event.title || 'AI课件'),
        subtitle: String(first.content || '').split('\n')[0].trim() || String(event.subtitle || ''),
        speakerNotes: first.speakerNotes
      }, theme)
      contentSlides = slides.slice(1)
    } else {
      buildCover(pptx, { title: event.title, subtitle: event.subtitle }, theme)
    }

    // 内容页：按 slideType 分发到各版式布局函数
    for (let i = 0; i < contentSlides.length; i++) {
      const s = contentSlides[i] || {}
      const slide = pptx.addSlide()
      await addContentSlide(slide, s, i, theme)
      // 讲解词备注（每页保留）
      if (s.speakerNotes) slide.addNotes(String(s.speakerNotes))
    }

    // ④ 生成二进制（优先 nodebuffer，兜底 base64 字符串再转 Buffer）
    let buf
    try {
      buf = await pptx.write({ outputType: 'nodebuffer' })
    } catch (e) {
      console.warn('nodebuffer 输出失败，改用 base64', e)
      const b64 = await pptx.write('base64')
      buf = Buffer.from(b64, 'base64')
    }
    if (typeof buf === 'string') buf = Buffer.from(buf, 'base64')

    // ⑤ 注入动画（anim.js：每页淡入切换 + 形状依次入场淡入，注入失败自动回退原文件）
    const finalBuf = await injectAnimations(buf)

    // ⑥ 上传云存储
    const cloudPath = 'exports/' + userId + '-' + Date.now() + '.pptx'
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: finalBuf })

    // ⑦ 成功后扣费（remark '导出PPTX文件'）
    await chargeCredits(bal.user, '导出PPTX文件')

    return { code: 0, data: { fileID: uploadRes.fileID }, message: 'ok' }
  } catch (e) {
    console.error('exportPPTX 执行异常', e)
    return { code: 1, message: '导出失败，请稍后重试' }
  }
}
