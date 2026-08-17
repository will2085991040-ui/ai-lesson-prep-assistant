// pages/exercises/exercises.js - 分层习题
// 表单填写 → AI 生成三层分层习题 → tab 切换 → 查看答案 → 保存/复制
const { SUBJECTS, GRADES, QUESTION_TYPES, STORAGE_KEYS, COLLECTIONS } = require('../../utils/constants')
const { buildExercisesPrompt, formatText } = require('../../utils/prompt')
const api = require('../../utils/api')

Page({
  data: {
    subjects: SUBJECTS,        // 学科选项
    grades: GRADES,            // 年级选项
    questionTypes: QUESTION_TYPES, // 题型选项（原始）
    typeChips: [],             // 题型 chips（含选中状态，预先算好）
    form: {
      subject: '',
      grade: '',
      knowledge: '',
      questionTypes: []        // 已选题型数组
    },
    indexes: {
      subjectIndex: -1,
      gradeIndex: -1
    },
    generating: false,         // AI 生成中标志
    result: null,              // 习题结果（basic/improve/challenge）
    activeKey: 'basic',        // 当前激活层级
    currentList: [],           // 当前层题目列表（预先算好）
    currentTag: 'tag-green',   // 当前层 tag 颜色
    saving: false,             // 保存防连点标志
    tabs: [
      { key: 'basic', name: '基础巩固', tag: 'tag-green' },
      { key: 'improve', name: '能力提升', tag: 'tag-blue' },
      { key: 'challenge', name: '拓展创新', tag: 'tag-orange' }
    ]
  },

  onLoad() {
    // 初始化题型 chips（默认全部未选中）
    this.setData({ typeChips: QUESTION_TYPES.map(name => ({ name, active: false })) })

    // PREFILL 缓存回填（「重新生成」场景）
    const prefill = wx.getStorageSync(STORAGE_KEYS.PREFILL)
    if (prefill && prefill.type === 'exercises' && prefill.meta) {
      const meta = prefill.meta
      const form = Object.assign({}, this.data.form)
      if (meta.subject !== undefined && meta.subject !== null) form.subject = meta.subject
      if (meta.grade !== undefined && meta.grade !== null) form.grade = meta.grade
      if (meta.knowledge !== undefined && meta.knowledge !== null) form.knowledge = meta.knowledge
      if (typeof meta.questionTypes === 'string') {
        // 字符串按 '、' 拆分并映射回 QUESTION_TYPES 数组
        form.questionTypes = meta.questionTypes.split('、').filter(t => QUESTION_TYPES.indexOf(t) >= 0)
      }
      this.setData({
        form,
        indexes: {
          subjectIndex: SUBJECTS.indexOf(form.subject),
          gradeIndex: GRADES.indexOf(form.grade)
        },
        typeChips: QUESTION_TYPES.map(name => ({ name, active: form.questionTypes.indexOf(name) >= 0 }))
      })
      wx.removeStorageSync(STORAGE_KEYS.PREFILL)
    }
  },

  // picker：学科
  onSubjectChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.subject': SUBJECTS[index],
      'indexes.subjectIndex': index
    })
  },

  // picker：年级
  onGradeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'form.grade': GRADES[index],
      'indexes.gradeIndex': index
    })
  },

  // input：知识点
  onKnowledgeInput(e) {
    this.setData({ 'form.knowledge': e.detail.value })
  },

  // 题型 chip 多选切换
  onTypeToggle(e) {
    const name = e.currentTarget.dataset.name
    const list = this.data.form.questionTypes.slice()
    const idx = list.indexOf(name)
    if (idx >= 0) {
      list.splice(idx, 1)
    } else {
      list.push(name)
    }
    this.setData({
      'form.questionTypes': list,
      typeChips: QUESTION_TYPES.map(n => ({ name: n, active: list.indexOf(n) >= 0 }))
    })
  },

  // 切换 tab 层级
  onTabTap(e) {
    this.setActiveTab(e.currentTarget.dataset.key)
  },

  // 设置当前激活层级（同步 currentList / currentTag）
  setActiveTab(key) {
    const tab = this.data.tabs.find(t => t.key === key)
    const result = this.data.result || {}
    this.setData({
      activeKey: key,
      currentList: result[key] || [],
      currentTag: tab ? tab.tag : 'tag-green'
    })
  },

  // 查看/收起答案解析
  onShowAnswer(e) {
    const idx = e.currentTarget.dataset.idx
    const key = this.data.activeKey
    const list = this.data.result[key]
    if (!list || !list[idx]) return
    const value = !list[idx].showAnswer
    this.setData({
      ['result.' + key + '[' + idx + '].showAnswer']: value,
      ['currentList[' + idx + '].showAnswer']: value
    })
  },

  // 生成分层习题
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
    if (!form.knowledge || !form.knowledge.trim()) {
      wx.showToast({ title: '请输入知识点', icon: 'none' })
      return
    }

    // 题型转为字符串，未选则「不限」
    const questionTypes = form.questionTypes.length ? form.questionTypes.join('、') : '不限'
    this.setData({ generating: true })

    api.generateExercises({
      subject: form.subject,
      grade: form.grade,
      knowledge: form.knowledge,
      questionTypes,
      prompt: buildExercisesPrompt(Object.assign({}, form, { questionTypes }))
    })
      .then(data => {
        const result = data || {}
        // 归一化：确保三层均为数组，并给每题注入 showAnswer / options / qid
        ;['basic', 'improve', 'challenge'].forEach(level => {
          const list = Array.isArray(result[level]) ? result[level] : []
          result[level] = list.map((q, i) => Object.assign({}, q, {
            options: Array.isArray(q.options) ? q.options : [],
            showAnswer: false,
            qid: i
          }))
        })
        // 构建带题数角标的 tabs
        const tabs = this.data.tabs.map(t => Object.assign({}, t, { count: result[t.key].length }))
        this.setData({
          result,
          tabs,
          activeKey: 'basic',
          currentList: result.basic,
          currentTag: 'tag-green',
          generating: false
        })
      })
      .catch(err => {
        this.setData({ generating: false })
        api.handleAIError(err)
      })
  },

  // 保存习题到备课库
  onSave() {
    if (this.data.saving) return
    const { form, result } = this.data
    if (!result) return
    this.setData({ saving: true })

    const questionTypes = form.questionTypes.length ? form.questionTypes.join('、') : '不限'
    api.addRecord(COLLECTIONS.EXERCISES, {
      subject: form.subject,
      grade: form.grade,
      knowledge: form.knowledge,
      questionTypes,
      content: JSON.stringify(result)
    })
      .then(res => {
        api.pushHistory({
          type: 'exercises',
          title: form.knowledge,
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

  // 复制全文
  onCopy() {
    const { result } = this.data
    if (!result) return
    api.copyText(formatText('exercises', result))
      .then(() => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      })
  }
})
