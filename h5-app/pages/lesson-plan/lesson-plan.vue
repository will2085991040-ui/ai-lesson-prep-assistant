<template>
  <!-- 页面容器：有结果时预留底部 fixed-bar 空间 -->
  <view class="page" :class="{ 'has-fixed-bar': !!result }">
    <!-- 表单卡片 -->
    <view class="card">
      <view class="form-item">
        <view class="form-label">学科</view>
        <picker mode="selector" :range="subjects" :value="subjectIndex" @change="onSubjectChange">
          <view class="form-value" :class="{ 'form-placeholder': !form.subject }">
            {{ form.subject || '请选择学科' }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">年级</view>
        <picker mode="selector" :range="grades" :value="gradeIndex" @change="onGradeChange">
          <view class="form-value" :class="{ 'form-placeholder': !form.grade }">
            {{ form.grade || '请选择年级' }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">教材</view>
        <picker mode="selector" :range="textbookNames" :value="textbookIndex" @change="onTextbookChange">
          <view class="form-value" :class="{ 'form-placeholder': !form.textbook }">
            {{ form.textbook || '请选择教材' }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">课型</view>
        <picker mode="selector" :range="lessonTypes" :value="lessonTypeIndex" @change="onLessonTypeChange">
          <view class="form-value">
            {{ form.lessonType }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">风格</view>
        <picker mode="selector" :range="styles" :value="styleIndex" @change="onStyleChange">
          <view class="form-value">
            {{ form.style }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">课题</view>
        <input class="form-input" v-model="form.topic" placeholder="请输入课题，如：分数的初步认识" />
      </view>

      <view class="form-item">
        <view class="form-label">课时</view>
        <input class="form-input" type="number" v-model="form.hours" placeholder="第几课时" />
      </view>

      <view class="form-item form-item-textarea">
        <view class="form-label">学情</view>
        <textarea class="form-textarea" v-model="form.studentInfo" placeholder="学生基础、学习难点等（选填）"></textarea>
      </view>
    </view>

    <view class="form-tip tip-outer">预计消耗 {{ credits }} 积分</view>

    <view class="btn btn-primary gen-btn" @click="onGenerate">✨ 生成完整教案</view>

    <!-- 教案结果：可折叠 8 个 section -->
    <view v-if="result">
      <view class="result-top">
        <view class="section-title result-title">📝 教案内容</view>
        <view class="btn btn-ghost redo-btn" @click="onGenerate">🔄 重新生成</view>
      </view>
      <view class="card section-card" v-for="sec in sections" :key="sec.number">
        <view class="section-head" @click="toggleSection(sec)">
          <view class="section-no">{{ sec.number }}</view>
          <view class="section-title-text">{{ sec.title }}</view>
          <view class="section-arrow" :class="{ open: sec.open }"></view>
        </view>
        <view class="content-text section-body" v-if="sec.open">{{ sec.text }}</view>
      </view>
    </view>

    <!-- 底部固定栏：保存 / 复制全文 -->
    <view class="fixed-bar" v-if="result">
      <view class="btn btn-plain bar-btn" @click="onSave">💾 保存</view>
      <view class="btn btn-primary bar-btn" @click="onCopy">📋 复制全文</view>
    </view>

    <!-- AI 生成中全屏 loading -->
    <view class="ai-loading" v-if="generating">
      <view class="ai-spinner"></view>
      <view class="ai-loading-text">AI正在备课中...</view>
    </view>
  </view>
</template>

<script>
// pages/lesson-plan/lesson-plan.vue - 智能备课：表单 → 生成完整教案（8 大板块折叠展示）
import api from '../../utils/api.js'
import { SUBJECTS, GRADES, LESSON_TYPES, TEACH_STYLES, COLLECTIONS, CREDITS } from '../../utils/constants.js'
import { buildLessonPlanPrompt, formatText } from '../../utils/prompt.js'

export default {
  data() {
    return {
      subjects: SUBJECTS,
      grades: GRADES,
      lessonTypes: LESSON_TYPES,
      styles: TEACH_STYLES,
      credits: CREDITS.LESSON_PLAN,
      form: {
        subject: '',
        grade: '',
        textbook: '',
        lessonType: '新授课',
        style: '常规严谨',
        topic: '',
        hours: 1,
        studentInfo: ''
      },
      subjectIndex: 0,
      gradeIndex: 0,
      textbookIndex: 0,
      lessonTypeIndex: 0,
      styleIndex: 0,
      textbooks: [],
      generating: false,
      result: null,
      sections: []
    }
  },
  computed: {
    // 教材名列表：按 学科 + 年级学段(stageOf) 过滤教材库
    textbookNames() {
      const stage = this.stageOf(this.form.grade)
      return (this.textbooks || [])
        .filter(t => t.subject === this.form.subject && t.stage === stage)
        .map(t => t.name || t.title || t.textbook || t.grade || '')
    }
  },
  watch: {
    // 学科/年级变化后，教材列表可能缩小，重置越界选择
    'form.subject'() {
      this.resetTextbook()
    },
    'form.grade'() {
      this.resetTextbook()
    }
  },
  onLoad(options) {
    // 加载教材库；query 参数 subject/topic 预填表单
    this.loadTextbooks()
    options = options || {}
    if (options.subject) {
      const decoded = decodeURIComponent(options.subject)
      const idx = this.subjects.indexOf(decoded)
      if (idx > -1) {
        this.subjectIndex = idx
        this.form.subject = this.subjects[idx]
      }
    }
    if (options.topic) {
      this.form.topic = decodeURIComponent(options.topic)
    }
  },
  methods: {
    /* ==================== 教材联动 ==================== */
    // 年级 → 学段：一~六年级→小学，七~九年级→初中，高一~高三→高中
    stageOf(grade) {
      const g = grade || ''
      if (/[一二三四五六]年级/.test(g)) return '小学'
      if (/[七八九]年级/.test(g)) return '初中'
      if (/高[一二三]/.test(g)) return '高中'
      return ''
    },
    // 加载教材库（全量）
    loadTextbooks() {
      api.getTextbooks()
        .then(res => {
          const list = Array.isArray(res) ? res : (res && res.list) || []
          this.textbooks = list.filter(t => t && typeof t === 'object')
        })
        .catch(() => {
          // 教材库加载失败静默，不影响其他功能
        })
    },
    // 重置教材选择（列表缩小导致越界时归零）
    resetTextbook() {
      if (this.textbookIndex >= this.textbookNames.length) this.textbookIndex = 0
      this.form.textbook = this.textbookNames[this.textbookIndex] || ''
    },

    /* ==================== 表单 picker ==================== */
    onSubjectChange(e) {
      this.subjectIndex = Number(e.detail.value)
      this.form.subject = this.subjects[this.subjectIndex] || ''
    },
    onGradeChange(e) {
      this.gradeIndex = Number(e.detail.value)
      this.form.grade = this.grades[this.gradeIndex] || ''
    },
    onTextbookChange(e) {
      this.textbookIndex = Number(e.detail.value)
      this.form.textbook = this.textbookNames[this.textbookIndex] || ''
    },
    onLessonTypeChange(e) {
      this.lessonTypeIndex = Number(e.detail.value)
      this.form.lessonType = this.lessonTypes[this.lessonTypeIndex] || '新授课'
    },
    onStyleChange(e) {
      this.styleIndex = Number(e.detail.value)
      this.form.style = this.styles[this.styleIndex] || '常规严谨'
    },

    /* ==================== 生成教案 ==================== */
    onGenerate() {
      if (!this.form.subject) return uni.showToast({ title: '请选择学科', icon: 'none' })
      if (!this.form.grade) return uni.showToast({ title: '请选择年级', icon: 'none' })
      if (!this.form.topic || !this.form.topic.trim()) return uni.showToast({ title: '请输入课题', icon: 'none' })
      this.generating = true
      api.generateLessonPlan(Object.assign({}, this.form, { prompt: buildLessonPlanPrompt(this.form) }))
        .then(res => {
          this.result = res || {}
          this.sections = this.buildSections(this.result)
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          this.generating = false
        })
    },
    // 把 AI 返回的教案 JSON 预计算为 8 个折叠板块
    buildSections(res) {
      const objectives = (res.objectives || []).map((o, i) => '目标' + this.cnNum(i + 1) + '：' + o).join('\n')
      const kp = res.keyPoints || {}
      const process = (res.process || []).map(p => {
        return (p.step || '') + '\n教师活动：' + (p.teacher || '') + '\n学生活动：' + (p.student || '') + '\n设计意图：' + (p.intent || '')
      }).join('\n\n')
      return [
        { number: '01', title: '教材分析', text: res.textbookAnalysis || '', open: true },
        { number: '02', title: '学情分析', text: res.studentAnalysis || '', open: false },
        { number: '03', title: '教学目标', text: objectives, open: false },
        { number: '04', title: '重难点', text: '教学重点：' + (kp.key || '') + '\n教学难点：' + (kp.difficult || ''), open: false },
        { number: '05', title: '教学准备', text: res.preparation || '', open: false },
        { number: '06', title: '教学过程', text: process, open: false },
        { number: '07', title: '板书设计', text: res.boardDesign || '', open: false },
        { number: '08', title: '反思预设', text: res.reflection || '', open: false }
      ]
    },
    // 数字 → 中文序数（目标一/目标二…）
    cnNum(i) {
      const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      return nums[i - 1] || String(i)
    },
    toggleSection(sec) {
      sec.open = !sec.open
    },

    /* ==================== 保存 / 复制 ==================== */
    onSave() {
      if (!this.result) return
      api.addRecord(COLLECTIONS.LESSON_PLANS, Object.assign({}, this.form, { content: JSON.stringify(this.result) }))
        .then(() => uni.showToast({ title: '已保存到备课库', icon: 'success' }))
        .catch(err => api.handleAIError(err))
    },
    onCopy() {
      if (!this.result) return
      api.copyText(formatText('lesson_plan', this.result))
        .then(() => uni.showToast({ title: '已复制全文', icon: 'success' }))
        .catch(err => api.handleAIError(err))
    }
  }
}
</script>

<style scoped>
.page {
  padding-bottom: 40rpx;
}

/* 表单 */
.form-input {
  flex: 1;
  font-size: 28rpx;
  color: #1F2329;
  text-align: right;
}
.form-item-textarea {
  flex-direction: column;
  align-items: flex-start;
}
.tip-outer {
  padding: 0 32rpx 20rpx;
}

/* 生成按钮 */
.gen-btn {
  margin: 0 24rpx 32rpx;
}

/* 结果区顶部：标题 + 重新生成 */
.result-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 36rpx 24rpx 20rpx;
}
.result-title {
  margin: 0;
}
.redo-btn {
  height: 64rpx;
  padding: 0 24rpx;
  font-size: 26rpx;
  border-radius: 32rpx;
  flex-shrink: 0;
}

/* 折叠板块卡片 */
.section-card {
  padding: 0;
}
.section-head {
  display: flex;
  align-items: center;
  padding: 28rpx 24rpx;
}
.section-no {
  width: 56rpx;
  height: 56rpx;
  border-radius: 12rpx;
  background: #E8F3FF;
  color: #1677FF;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
  flex-shrink: 0;
}
.section-title-text {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: #1F2329;
}
.section-arrow {
  width: 16rpx;
  height: 16rpx;
  border-right: 3rpx solid #C9CDD4;
  border-bottom: 3rpx solid #C9CDD4;
  transform: rotate(45deg);
  transition: transform 0.2s;
  flex-shrink: 0;
  margin-left: 12rpx;
}
.section-arrow.open {
  transform: rotate(-135deg);
}
.section-body {
  padding: 0 24rpx 28rpx;
}

/* AI 生成中全屏 loading（页面内自定义遮罩 + spinner） */
.ai-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ai-spinner {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  border: 6rpx solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}
.ai-loading-text {
  margin-top: 24rpx;
  color: #FFFFFF;
  font-size: 28rpx;
}
</style>
