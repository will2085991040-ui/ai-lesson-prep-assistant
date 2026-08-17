// pages/lesson-plan/lesson-plan.js - 智能备课
// 表单填写 → AI 生成完整教案 → 折叠面板展示 → 保存/生成课件/复制
const {
  SUBJECTS, GRADES, LESSON_TYPES, TEACH_STYLES, STORAGE_KEYS, COLLECTIONS
} = require('../../utils/constants')
const { buildLessonPlanPrompt, formatText } = require('../../utils/prompt')
const api = require('../../utils/api')

// 根据年级判断学段：小学/初中/高中
function stageOf(grade) {
  const n = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'].indexOf(grade)
  if (n >= 0) return '小学'
  const j = ['七年级', '八年级', '九年级'].indexOf(grade)
  if (j >= 0) return '初中'
  const h = ['高一', '高二', '高三'].indexOf(grade)
  if (h >= 0) return '高中'
  return ''
}

Page({
  data: {
    subjects: SUBJECTS,       // 学科选项
    grades: GRADES,           // 年级选项
    lessonTypes: LESSON_TYPES, // 课型选项
    styles: TEACH_STYLES,     // 教学风格选项
    allTextbooks: [],         // 教材完整对象数组（全量，picker 展示时按学科/学段过滤）
    textbookNames: [],        // 教材名称（picker range）
    form: {
      subject: '',
      grade: '',
      textbook: '',
      topic: '',
      hours: '1',
      lessonType: '新授课',
      studentInfo: '',
      style: '常规严谨'
    },
    indexes: {
      subjectIndex: -1,
      gradeIndex: -1,
      textbookIndex: -1,
      lessonTypeIndex: 0,
      styleIndex: 0
    },
    generating: false,        // AI 生成中标志
    result: null,             // AI 生成结果
    sections: [],             // 折叠面板数据
    saving: false             // 保存防连点标志
  },

  onLoad(options) {
    // 教材列表加载（教材可选填，失败静默）
    this.loadTextbooks()

    // ① query 预填
    if (options.subject) {
      this.applyField('subject', decodeURIComponent(options.subject))
    }
    if (options.topic) {
      this.applyField('topic', decodeURIComponent(options.topic))
    }

    // ② PREFILL 缓存回填（「重新生成」场景）
    const prefill = wx.getStorageSync(STORAGE_KEYS.PREFILL)
    if (prefill && prefill.type === 'lesson_plan' && prefill.meta) {
      this.applyForm(prefill.meta)
      wx.removeStorageSync(STORAGE_KEYS.PREFILL)
    }

    // ③ 草稿恢复
    const draft = api.getDraft(STORAGE_KEYS.DRAFT_LESSON_PLAN)
    if (draft && draft.topic) {
      wx.showModal({
        title: '发现草稿',
        content: '检测到上次未完成的备课草稿，是否恢复？',
        confirmText: '恢复',
        cancelText: '放弃',
        success: res => {
          if (res.confirm) {
            this.applyForm(draft)
          } else {
            api.clearDraft(STORAGE_KEYS.DRAFT_LESSON_PLAN)
          }
        }
      })
    }
  },

  // 加载教材列表（教材可选填，失败静默）
  loadTextbooks() {
    api.getTextbooks()
      .then(list => {
        this.setData({ allTextbooks: list })
        this.refreshTextbookPicker()
      })
      .catch(() => {})
  },

  // 依据当前学科/年级过滤教材，重建教材 picker 选项并同步索引
  refreshTextbookPicker() {
    const { form } = this.data
    const stage = stageOf(form.grade)
    const list = this.data.allTextbooks.filter(t =>
      (!form.subject || t.subject === form.subject) && (!stage || t.stage === stage)
    )
    const textbookNames = list.map(t => t.bookName)
    let textbook = form.textbook
    let textbookIndex = -1
    if (textbook && textbookNames.indexOf(textbook) === -1) textbook = '' // 当前教材不在过滤结果中则重置
    else textbookIndex = textbookNames.indexOf(textbook)
    this.setData({ textbookNames, 'form.textbook': textbook, 'indexes.textbookIndex': textbookIndex })
  },

  // 更新单个字段并同步对应 picker 索引
  applyField(key, value) {
    const patch = { ['form.' + key]: value }
    if (key === 'subject') patch['indexes.subjectIndex'] = SUBJECTS.indexOf(value)
    if (key === 'grade') patch['indexes.gradeIndex'] = GRADES.indexOf(value)
    this.setData(patch)
  },

  // 用一份 meta 数据覆盖表单（subject/grade/topic/textbook/hours/lessonType/studentInfo/style）
  applyForm(meta) {
    const form = Object.assign({}, this.data.form)
    const keys = ['subject', 'grade', 'topic', 'textbook', 'hours', 'lessonType', 'studentInfo', 'style']
    keys.forEach(k => {
      if (meta[k] !== undefined && meta[k] !== null) form[k] = meta[k]
    })
    this.setData({
      form,
      indexes: {
        subjectIndex: SUBJECTS.indexOf(form.subject),
        gradeIndex: GRADES.indexOf(form.grade),
        textbookIndex: 0, // 占位：随后 refreshTextbookPicker 会按过滤结果纠正
        lessonTypeIndex: LESSON_TYPES.indexOf(form.lessonType),
        styleIndex: TEACH_STYLES.indexOf(form.style)
      }
    })
    // 教材索引需基于过滤后的教材列表计算，交由 refreshTextbookPicker 统一处理
    this.refreshTextbookPicker()
  },

  // picker：学科
  onSubjectChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.subject': SUBJECTS[index],
      'indexes.subjectIndex': index
    })
    this.scheduleDraft()
    this.refreshTextbookPicker() // 学科变化后重新过滤教材
  },

  // picker：年级
  onGradeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.grade': GRADES[index],
      'indexes.gradeIndex': index
    })
    this.scheduleDraft()
    this.refreshTextbookPicker() // 年级变化后重新过滤教材
  },

  // picker：教材
  onTextbookChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.textbook': this.data.textbookNames[index],
      'indexes.textbookIndex': index
    })
    this.scheduleDraft()
  },

  // picker：课型
  onLessonTypeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.lessonType': LESSON_TYPES[index],
      'indexes.lessonTypeIndex': index
    })
    this.scheduleDraft()
  },

  // picker：教学风格
  onStyleChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.style': TEACH_STYLES[index],
      'indexes.styleIndex': index
    })
    this.scheduleDraft()
  },

  // input：课题
  onTopicInput(e) {
    this.setData({ 'form.topic': e.detail.value })
    this.scheduleDraft()
  },

  // input：课时
  onHoursInput(e) {
    this.setData({ 'form.hours': e.detail.value })
    this.scheduleDraft()
  },

  // textarea：学情
  onStudentInput(e) {
    this.setData({ 'form.studentInfo': e.detail.value })
    this.scheduleDraft()
  },

  // 表单变更后防抖保存草稿（300ms）
  scheduleDraft() {
    clearTimeout(this._draftTimer)
    this._draftTimer = setTimeout(() => {
      api.saveDraft(STORAGE_KEYS.DRAFT_LESSON_PLAN, this.data.form)
    }, 300)
  },

  // 生成完整教案
  onGenerate() {
    const form = this.data.form
    // 必填校验
    if (!form.subject) {
      wx.showToast({ title: '请选择学科', icon: 'none' })
      return
    }
    if (!form.grade) {
      wx.showToast({ title: '请选择年级', icon: 'none' })
      return
    }
    if (!form.topic || !form.topic.trim()) {
      wx.showToast({ title: '请输入课题', icon: 'none' })
      return
    }

    this.setData({ generating: true })

    const payload = Object.assign({}, form, {
      prompt: buildLessonPlanPrompt(form)
    })

    api.generateLessonPlan(payload)
      .then(data => {
        const result = data || {}
        this.setData({
          result,
          sections: this.buildSections(result),
          generating: false
        })
        // 生成成功后清除草稿
        api.clearDraft(STORAGE_KEYS.DRAFT_LESSON_PLAN)
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 将教案结果构建为折叠面板所需的 sections 数组（8 大模块）
  buildSections(result) {
    const objectives = Array.isArray(result.objectives)
      ? `目标一：${result.objectives[0] || ''}\n目标二：${result.objectives[1] || ''}\n目标三：${result.objectives[2] || ''}`
      : ''
    const kp = result.keyPoints || {}
    const keyPoints = `教学重点：${kp.key || ''}\n教学难点：${kp.difficult || ''}`
    const process = Array.isArray(result.process)
      ? result.process
          .map(p => `${p.step || ''}\n教师活动：${p.teacher || ''}\n学生活动：${p.student || ''}\n设计意图：${p.intent || ''}`)
          .join('\n\n')
      : ''

    const items = [
      { title: '教材分析', text: result.textbookAnalysis || '' },
      { title: '学情分析', text: result.studentAnalysis || '' },
      { title: '教学目标', text: objectives },
      { title: '重难点', text: keyPoints },
      { title: '教学准备', text: result.preparation || '' },
      { title: '教学过程', text: process },
      { title: '板书设计', text: result.boardDesign || '' },
      { title: '反思预设', text: result.reflection || '' }
    ]

    return items.map((item, i) => ({
      number: i < 9 ? '0' + (i + 1) : '' + (i + 1),
      title: item.title,
      text: item.text,
      open: i === 0 // 第一项默认展开
    }))
  },

  // 保存教案到备课库
  onSave() {
    if (this.data.saving) return
    const { form, result } = this.data
    if (!result) return
    this.setData({ saving: true })

    api.addRecord(COLLECTIONS.LESSON_PLANS, {
      subject: form.subject,
      grade: form.grade,
      textbook: form.textbook,
      topic: form.topic,
      hours: form.hours,
      lessonType: form.lessonType,
      studentInfo: form.studentInfo,
      style: form.style,
      content: JSON.stringify(result)
    })
      .then(res => {
        api.pushHistory({
          type: 'lesson_plan',
          title: result.title || form.topic,
          id: res._id,
          createTime: Date.now()
        })
        wx.showToast({ title: '已保存到备课库', icon: 'success' })
      })
      .catch(err => {
        wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      })
      .then(() => {
        this.setData({ saving: false })
      })
  },

  // 生成课件：携带课题跳转课件大纲页
  onGoPPT() {
    const topic = this.data.form.topic
    if (!topic) {
      wx.showToast({ title: '请先输入课题', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/ppt-outline/ppt-outline?topic=' + encodeURIComponent(topic)
    })
  },

  // 复制全文
  onCopy() {
    const { result } = this.data
    if (!result) return
    api.copyText(formatText('lesson_plan', result))
      .then(() => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  }
})
