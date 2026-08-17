// pages/analysis/analysis.js - 学情诊断页面
// 功能：填写测验信息，调用豆包大模型生成学情诊断（能力雷达图 + 薄弱点 + 分层教学建议）
const { SUBJECTS, GRADES, STORAGE_KEYS, COLLECTIONS } = require('../../utils/constants')
const { analyzeStudentProfile, addRecord, pushHistory, copyText, handleAIError } = require('../../utils/api')
const { buildAnalysisPrompt, formatText } = require('../../utils/prompt')

Page({
  data: {
    subjects: SUBJECTS,        // 学科列表
    grades: GRADES,            // 年级列表
    form: {                    // 表单数据
      subject: '',
      grade: '',
      topic: '',
      score: '',
      errors: ''
    },
    indexes: {                 // picker 选中索引
      subjectIndex: -1,
      gradeIndex: -1
    },
    generating: false,         // 是否正在生成
    result: null,              // 诊断结果
    // 分层教学建议标签样式（按 index 映射：基础巩固/能力提升/拓展创新）
    suggestionTags: ['tag-green', 'tag-blue', 'tag-orange']
  },

  onLoad() {
    // 读取「重新生成」回填缓存
    this.restorePrefill()
  },

  // 读取「重新生成」回填缓存
  restorePrefill() {
    const prefill = wx.getStorageSync(STORAGE_KEYS.PREFILL)
    if (!prefill || prefill.type !== 'analysis') return
    const meta = prefill.meta || {}
    const form = {
      subject: meta.subject || '',
      grade: meta.grade || '',
      topic: meta.topic || '',
      score: (meta.score === undefined || meta.score === null || meta.score === '') ? '' : String(meta.score),
      errors: meta.errors || ''
    }
    this.setData({
      form,
      indexes: {
        subjectIndex: this.data.subjects.indexOf(form.subject),
        gradeIndex: this.data.grades.indexOf(form.grade)
      }
    })
    // 回填后删除缓存，避免下次进入再次回填
    wx.removeStorageSync(STORAGE_KEYS.PREFILL)
  },

  // 学科选择
  onSubjectChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      'indexes.subjectIndex': idx,
      'form.subject': this.data.subjects[idx]
    })
  },

  // 年级选择
  onGradeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      'indexes.gradeIndex': idx,
      'form.grade': this.data.grades[idx]
    })
  },

  // 文本输入（通过 data-field 区分字段）
  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 生成学情诊断
  onGenerate() {
    const { subject, grade, topic, score } = this.data.form
    // 必填校验
    if (!subject || !grade || !topic || score === '') {
      wx.showToast({ title: '请完整填写学科、年级、课题和测验分', icon: 'none' })
      return
    }
    // 分数范围校验（0-100 数字）
    const scoreNum = Number(score)
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      wx.showToast({ title: '请输入 0-100 之间的分数', icon: 'none' })
      return
    }
    this.setData({ generating: true })
    analyzeStudentProfile({
      ...this.data.form,
      score: scoreNum,
      prompt: buildAnalysisPrompt(this.data.form)
    })
      .then(result => {
        this.setData({ result, generating: false })
      })
      .catch(err => {
        this.setData({ generating: false })
        handleAIError(err)
      })
  },

  // 保存到备课库
  onSave() {
    const { form, result } = this.data
    if (!result) return
    addRecord(COLLECTIONS.ANALYSIS, {
      subject: form.subject,
      grade: form.grade,
      topic: form.topic,
      score: form.score,
      errors: form.errors,
      content: JSON.stringify(result)
    })
      .then(res => {
        // 写入最近备课记录
        pushHistory({ type: 'analysis', title: form.topic, id: res._id, createTime: Date.now() })
        wx.showToast({ title: '已保存到备课库', icon: 'none' })
      })
      .catch(err => {
        wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      })
  },

  // 复制全文
  onCopy() {
    copyText(formatText('analysis', this.data.result))
      .then(() => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }))
      .catch(() => wx.showToast({ title: '复制失败', icon: 'none' }))
  }
})
