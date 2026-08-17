<template>
  <view class="page has-fixed-bar">
    <!-- AI 生成中全屏 loading 遮罩 -->
    <view class="ai-loading" v-if="generating">
      <view class="ai-spinner"></view>
      <view class="ai-loading-text">AI 正在生成分层习题，请稍候…</view>
    </view>

    <!-- 生成表单 -->
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
        <text class="form-label">知识点</text>
        <input class="form-value" :value="form.knowledge" @input="onKnowledgeInput" placeholder="如：分数的加减法" placeholder-class="form-placeholder" />
      </view>
      <view class="form-item form-item-block">
        <text class="form-label">题型</text>
        <view class="chip-wrap">
          <view
            class="chip"
            :class="{ 'chip-active': form.questionTypes.indexOf(t) > -1 }"
            v-for="(t, i) in QUESTION_TYPES"
            :key="i"
            @click="toggleType(t)"
          >{{ t }}</view>
        </view>
      </view>
    </view>

    <view class="form-tip form-tip-pad">题型可多选，不选则默认不限。AI 将按「基础巩固 / 能力提升 / 拓展创新」三层各出 3 题。</view>

    <view class="btn btn-primary generate-btn" @click="generate">✨ 生成分层习题</view>

    <!-- 结果区域：三个分层 tab + 题目列表 -->
    <block v-if="result">
      <view class="tab-bar">
        <view
          class="tab-item"
          :class="{ 'tab-item-active': activeKey === lv.key }"
          v-for="lv in levels"
          :key="lv.key"
          @click="activeKey = lv.key"
        >
          <text :class="['tag', lv.tagClass]">{{ lv.name }}</text>
          <text class="tab-count">{{ (result[lv.key] || []).length }} 题</text>
        </view>
      </view>

      <view v-if="currentQuestions.length">
        <view class="card question-card" v-for="(q, qi) in currentQuestions" :key="qi">
          <view class="question-head">
            <text :class="['tag', levelOfActive.tagClass]">{{ q.difficulty || levelOfActive.name }}</text>
            <text class="question-no">第 {{ qi + 1 }} 题</text>
          </view>
          <view class="content-text question-content">{{ q.content }}</view>
          <view class="option-list" v-if="q.options && q.options.length">
            <view class="option-item" v-for="(opt, oi) in q.options" :key="oi">{{ opt }}</view>
          </view>
          <!-- 查看答案解析 toggle -->
          <view class="answer-toggle" @click="q.showAnswer = !q.showAnswer">
            <text>{{ q.showAnswer ? '收起答案解析' : '查看答案解析' }}</text>
            <text class="answer-arrow">{{ q.showAnswer ? '▲' : '▼' }}</text>
          </view>
          <view class="answer-block" v-if="q.showAnswer">
            <view class="answer-line">
              <text class="answer-label">答案</text>
              <text class="answer-text">{{ q.answer || '略' }}</text>
            </view>
            <view class="answer-line">
              <text class="answer-label">解析</text>
              <text class="answer-text">{{ q.analysis || '略' }}</text>
            </view>
          </view>
        </view>
      </view>
      <view class="empty" v-else>
        <view class="empty-icon">📭</view>
        <text>当前层级暂无题目</text>
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
import { generateExercises, addRecord, copyText, handleAIError } from '../../utils/api.js'
import { buildExercisesPrompt, formatText } from '../../utils/prompt.js'

// constants.js 为 CommonJS 模块，用 require 引入
const { SUBJECTS, GRADES, QUESTION_TYPES, COLLECTIONS } = require('../../utils/constants.js')

export default {
  data() {
    return {
      SUBJECTS: SUBJECTS,
      GRADES: GRADES,
      QUESTION_TYPES: QUESTION_TYPES,
      subjectIndex: 0,
      gradeIndex: 0,
      generating: false,
      activeKey: 'basic',
      // 三个分层 tab 配置：key / 名称 / tag 颜色
      levels: [
        { key: 'basic', name: '基础巩固', tagClass: 'tag-green' },
        { key: 'improve', name: '能力提升', tagClass: 'tag-blue' },
        { key: 'challenge', name: '拓展创新', tagClass: 'tag-orange' }
      ],
      form: {
        subject: SUBJECTS[0],
        grade: GRADES[0],
        knowledge: '',
        questionTypes: []
      },
      result: null
    }
  },
  computed: {
    // 当前激活层级的题目列表
    currentQuestions() {
      if (!this.result) return []
      const list = this.result[this.activeKey]
      return Array.isArray(list) ? list : []
    },
    // 当前激活层级配置
    levelOfActive() {
      return this.levels.find(lv => lv.key === this.activeKey) || this.levels[0]
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
    onKnowledgeInput(e) {
      this.form.knowledge = e.detail.value
    },
    // 题型 chips 多选切换
    toggleType(type) {
      const idx = this.form.questionTypes.indexOf(type)
      if (idx > -1) {
        this.form.questionTypes.splice(idx, 1)
      } else {
        this.form.questionTypes.push(type)
      }
    },
    generate() {
      if (this.generating) return
      if (!this.form.subject) return uni.showToast({ title: '请选择学科', icon: 'none' })
      if (!this.form.grade) return uni.showToast({ title: '请选择年级', icon: 'none' })
      if (!this.form.knowledge.trim()) return uni.showToast({ title: '请输入知识点', icon: 'none' })
      // 题型选中后以「、」连接，未选则不限
      const questionTypes = this.form.questionTypes.length ? this.form.questionTypes.join('、') : '不限'
      this.generating = true
      generateExercises({
        subject: this.form.subject,
        grade: this.form.grade,
        knowledge: this.form.knowledge.trim(),
        questionTypes: questionTypes,
        prompt: buildExercisesPrompt(Object.assign({}, this.form, { questionTypes: questionTypes }))
      })
        .then(res => {
          const result = res || {}
          // 为每道题注入 showAnswer:false，答案解析默认收起
          ;['basic', 'improve', 'challenge'].forEach(key => {
            const list = result[key]
            if (Array.isArray(list)) {
              list.forEach(q => {
                if (q) q.showAnswer = false
              })
            }
          })
          this.result = result
          this.activeKey = 'basic'
          this.generating = false
        })
        .catch(err => {
          this.generating = false
          handleAIError(err)
        })
    },
    save() {
      if (!this.result) return uni.showToast({ title: '请先生成分层习题', icon: 'none' })
      addRecord(COLLECTIONS.EXERCISES, Object.assign({}, this.form, { content: JSON.stringify(this.result) }))
        .then(() => uni.showToast({ title: '保存成功', icon: 'success' }))
        .catch(err => uni.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' }))
    },
    copy() {
      if (!this.result) return uni.showToast({ title: '请先生成分层习题', icon: 'none' })
      const text = formatText('exercises', this.result)
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

.form-tip-pad {
  margin: -8rpx 32rpx 24rpx;
}

/* 题型 chips 区域：label 顶部对齐 */
.form-item-block {
  align-items: flex-start;
}
.form-item-block .form-label {
  margin-top: 14rpx;
}
.chip-wrap {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 分层 tab 栏 */
.tab-bar {
  display: flex;
  margin: 0 24rpx 24rpx;
  padding: 12rpx;
  background: #FFFFFF;
  border-radius: 16rpx;
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14rpx 0;
  border-radius: 12rpx;
}
.tab-item-active {
  background: #F2F3F5;
}
.tab-count {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #86909C;
}

/* 题目卡片 */
.question-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.question-no {
  font-size: 24rpx;
  color: #86909C;
}
.question-content {
  margin-bottom: 12rpx;
}
.option-list {
  margin-bottom: 8rpx;
}
.option-item {
  padding: 10rpx 0;
  font-size: 27rpx;
  color: #4E5969;
}

/* 答案解析 toggle 与浅蓝答案块 */
.answer-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0 4rpx;
  font-size: 26rpx;
  color: #1677FF;
}
.answer-arrow {
  font-size: 20rpx;
}
.answer-block {
  margin-top: 12rpx;
  padding: 20rpx;
  background: #E8F3FF;
  border-radius: 12rpx;
}
.answer-line {
  display: flex;
  margin-bottom: 8rpx;
  font-size: 26rpx;
  color: #1F2329;
}
.answer-line:last-child {
  margin-bottom: 0;
}
.answer-label {
  flex-shrink: 0;
  margin-right: 12rpx;
  color: #1677FF;
  font-weight: 500;
}
.answer-text {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
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
