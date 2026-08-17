<template>
  <view class="page has-fixed-bar">
    <!-- AI 生成中全屏 loading 遮罩 -->
    <view class="ai-loading" v-if="generating">
      <view class="ai-spinner"></view>
      <view class="ai-loading-text">AI 正在分析学情，请稍候…</view>
    </view>

    <!-- 诊断表单 -->
    <view class="card">
      <view class="form-item">
        <text class="form-label">学科</text>
        <picker mode="selector" :range="SUBJECTS" :value="subjectIndex" @change="onSubjectChange">
          <view class="form-value">
            <text :class="form.subject ? '' : 'form-placeholder'">{{ form.subject || '请选择学科' }}</text>
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>
      <view class="form-item">
        <text class="form-label">年级</text>
        <picker mode="selector" :range="GRADES" :value="gradeIndex" @change="onGradeChange">
          <view class="form-value">
            <text :class="form.grade ? '' : 'form-placeholder'">{{ form.grade || '请选择年级' }}</text>
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>
      <view class="form-item">
        <text class="form-label">课题</text>
        <input class="form-value" :value="form.topic" @input="onTopicInput" placeholder="如：分数的初步认识" placeholder-class="form-placeholder" />
      </view>
      <view class="form-item">
        <text class="form-label">测验分</text>
        <input class="form-value" type="number" :value="form.score" @input="onScoreInput" placeholder="0-100" placeholder-class="form-placeholder" />
      </view>
      <view class="form-item form-item-textarea">
        <text class="form-label">常见错误</text>
        <view class="textarea-wrap">
          <textarea class="form-textarea" :value="form.errors" @input="onErrorsInput" placeholder="如：计算粗心、单位换算混淆、审题不清…" placeholder-class="form-placeholder"></textarea>
        </view>
      </view>
    </view>

    <view class="btn btn-primary generate-btn" @click="generate">✨ 生成学情诊断</view>

    <!-- 诊断结果 -->
    <block v-if="result">
      <!-- 能力雷达（进度条列表实现，H5 更简洁，不用 canvas） -->
      <view class="card">
        <view class="card-title">🧭 能力雷达</view>
        <view class="radar-row" v-for="(d, i) in dimensions" :key="i">
          <text class="radar-name">{{ d.name }}</text>
          <view class="radar-track">
            <view class="radar-fill" :style="{ width: percentOf(d.score) + '%' }"></view>
          </view>
          <text class="radar-score">{{ d.score }}分</text>
        </view>
      </view>

      <!-- 整体评述 -->
      <view class="card">
        <view class="card-title">📝 整体评述</view>
        <view class="content-text">{{ result.overall || '暂无内容' }}</view>
      </view>

      <!-- 薄弱点 -->
      <view class="card" v-if="weakPoints.length">
        <view class="card-title">⚠️ 薄弱点</view>
        <view class="weak-item" v-for="(w, i) in weakPoints" :key="i">
          <text class="weak-icon">⚠️</text>
          <text class="content-text weak-text">{{ w }}</text>
        </view>
      </view>

      <!-- 分层教学建议 -->
      <view class="card" v-if="suggestions.length">
        <view class="card-title">🎯 分层教学建议</view>
        <view class="suggestion-item" v-for="(s, i) in suggestions" :key="i">
          <view class="suggestion-head">
            <text :class="['tag', tagClasses[i % tagClasses.length]]">{{ s.level || '建议' }}</text>
          </view>
          <view class="content-text suggestion-content">{{ s.content }}</view>
        </view>
      </view>
    </block>

    <!-- 底部操作栏 -->
    <view class="fixed-bar" v-if="result">
      <view class="btn btn-ghost bar-btn" @click="save">💾 保存</view>
      <view class="btn btn-primary bar-btn" @click="copy">📋 复制全文</view>
    </view>
  </view>
</template>

<script>
import { analyzeStudentProfile, addRecord, copyText, handleAIError } from '../../utils/api.js'
import { buildAnalysisPrompt, formatText } from '../../utils/prompt.js'

// constants.js 为 CommonJS 模块，用 require 引入
const { SUBJECTS, GRADES, COLLECTIONS } = require('../../utils/constants.js')

export default {
  data() {
    return {
      SUBJECTS: SUBJECTS,
      GRADES: GRADES,
      subjectIndex: 0,
      gradeIndex: 0,
      generating: false,
      // 分层建议 tag 颜色按 index 循环映射：绿 / 蓝 / 橙
      tagClasses: ['tag-green', 'tag-blue', 'tag-orange'],
      form: {
        subject: SUBJECTS[0],
        grade: GRADES[0],
        topic: '',
        score: '',
        errors: ''
      },
      result: null
    }
  },
  computed: {
    // 雷达图维度列表
    dimensions() {
      const radar = this.result && this.result.radar
      return radar && Array.isArray(radar.dimensions) ? radar.dimensions : []
    },
    // 雷达图满分值，兜底 100
    radarMax() {
      const radar = this.result && this.result.radar
      return (radar && radar.max) || 100
    },
    weakPoints() {
      return Array.isArray(this.result && this.result.weakPoints) ? this.result.weakPoints : []
    },
    suggestions() {
      return Array.isArray(this.result && this.result.suggestions) ? this.result.suggestions : []
    }
  },
  methods: {
    onSubjectChange(e) {
      this.subjectIndex = e.detail.value
      this.form.subject = SUBJECTS[e.detail.value]
    },
    onGradeChange(e) {
      this.gradeIndex = e.detail.value
      this.form.grade = GRADES[e.detail.value]
    },
    onTopicInput(e) {
      this.form.topic = e.detail.value
    },
    onScoreInput(e) {
      this.form.score = e.detail.value
    },
    onErrorsInput(e) {
      this.form.errors = e.detail.value
    },
    // 计算维度得分占满分的百分比（0-100，用于进度条宽度）
    percentOf(score) {
      const max = this.radarMax > 0 ? this.radarMax : 100
      const p = (Number(score) || 0) / max * 100
      return Math.max(0, Math.min(100, Math.round(p)))
    },
    generate() {
      if (this.generating) return
      if (!this.form.subject) return uni.showToast({ title: '请选择学科', icon: 'none' })
      if (!this.form.grade) return uni.showToast({ title: '请选择年级', icon: 'none' })
      if (!this.form.topic.trim()) return uni.showToast({ title: '请输入课题', icon: 'none' })
      if (this.form.score === '' || this.form.score === null || this.form.score === undefined) {
        return uni.showToast({ title: '请输入测验分', icon: 'none' })
      }
      // 分数必须是 0-100 的数字
      const score = Number(this.form.score)
      if (isNaN(score) || score < 0 || score > 100) {
        return uni.showToast({ title: '分数需在 0-100 之间', icon: 'none' })
      }
      this.form.score = score
      this.generating = true
      analyzeStudentProfile({
        subject: this.form.subject,
        grade: this.form.grade,
        topic: this.form.topic.trim(),
        score: score,
        errors: this.form.errors,
        prompt: buildAnalysisPrompt(this.form)
      })
        .then(res => {
          this.result = res || {}
          this.generating = false
        })
        .catch(err => {
          this.generating = false
          handleAIError(err)
        })
    },
    save() {
      if (!this.result) return uni.showToast({ title: '请先生成学情诊断', icon: 'none' })
      addRecord(COLLECTIONS.ANALYSIS, Object.assign({}, this.form, { content: JSON.stringify(this.result) }))
        .then(() => uni.showToast({ title: '保存成功', icon: 'success' }))
        .catch(err => uni.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' }))
    },
    copy() {
      if (!this.result) return uni.showToast({ title: '请先生成学情诊断', icon: 'none' })
      const text = formatText('analysis', this.result)
      if (!text) return uni.showToast({ title: '暂无可复制的内容', icon: 'none' })
      copyText(text)
        .then(() => uni.showToast({ title: '已复制全文', icon: 'success' }))
        .catch(() => uni.showToast({ title: '复制失败，请重试', icon: 'none' }))
    }
  }
}
</script>

<style scoped>
.page {
  padding-top: 24rpx;
}

.generate-btn {
  margin: 0 24rpx 40rpx;
}

/* 文本框表单项：label 顶部对齐 */
.form-item-textarea {
  align-items: flex-start;
}
.form-item-textarea .form-label {
  margin-top: 22rpx;
}
.textarea-wrap {
  flex: 1;
}

.card-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2329;
}

/* 雷达图进度条列表 */
.radar-row {
  display: flex;
  align-items: center;
  margin-bottom: 22rpx;
}
.radar-row:last-child {
  margin-bottom: 0;
}
.radar-name {
  width: 140rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: #4E5969;
}
.radar-track {
  flex: 1;
  height: 20rpx;
  margin: 0 16rpx;
  background: #F2F3F5;
  border-radius: 20rpx;
  overflow: hidden;
}
.radar-fill {
  height: 100%;
  border-radius: 20rpx;
  background: linear-gradient(90deg, #1677FF, #3D8EFF);
  transition: width 0.4s ease;
}
.radar-score {
  width: 96rpx;
  flex-shrink: 0;
  text-align: right;
  font-size: 26rpx;
  font-weight: 500;
  color: #1677FF;
}

/* 薄弱点列表 */
.weak-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 16rpx;
}
.weak-item:last-child {
  margin-bottom: 0;
}
.weak-icon {
  margin-right: 12rpx;
  font-size: 26rpx;
  flex-shrink: 0;
}
.weak-text {
  flex: 1;
}

/* 分层教学建议 */
.suggestion-item {
  margin-bottom: 16rpx;
  padding: 20rpx;
  background: #F7F8FA;
  border-radius: 12rpx;
}
.suggestion-item:last-child {
  margin-bottom: 0;
}
.suggestion-head {
  margin-bottom: 12rpx;
}
.suggestion-content {
  font-size: 26rpx;
}

/* AI 生成中全屏 loading */
.ai-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
}
.ai-spinner {
  width: 72rpx;
  height: 72rpx;
  border: 8rpx solid #E8F3FF;
  border-top-color: #1677FF;
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}
.ai-loading-text {
  margin-top: 28rpx;
  font-size: 26rpx;
  color: #4E5969;
}
@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
