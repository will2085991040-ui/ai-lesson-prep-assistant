<template>
  <!-- 页面容器：有课件结果时预留底部 fixed-bar 空间 -->
  <view class="page" :class="{ 'has-fixed-bar': slides.length }">
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
        <view class="form-label">课题</view>
        <input class="form-input" v-model="form.topic" placeholder="请输入课题，如：分数的初步认识" />
      </view>

      <view class="form-item form-item-slider">
        <view class="form-label">页数</view>
        <view class="slider-wrap">
          <slider class="slider" min="10" max="50" step="1" :value="form.pages" activeColor="#1677FF" backgroundColor="#E8F3FF" block-size="24" @change="onPagesChange" />
        </view>
        <view class="page-num">{{ form.pages }}页</view>
      </view>

      <view class="form-item">
        <view class="form-label">教学风格</view>
        <picker mode="selector" :range="styles" :value="styleIndex" @change="onStyleChange">
          <view class="form-value">
            {{ form.teachStyle }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item">
        <view class="form-label">视觉风格</view>
        <picker mode="selector" :range="visualStyles" :value="visualStyleIndex" @change="onVisualStyleChange">
          <view class="form-value">
            {{ form.visualStyle }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item form-item-block">
        <view class="form-label">课件模板</view>
        <view class="chips">
          <view
            class="chip"
            :class="{ 'chip-active': form.template === t }"
            v-for="t in templates"
            :key="t"
            @click="form.template = t"
          >{{ t }}</view>
        </view>
      </view>

      <view class="form-item">
        <view class="form-label">学生水平</view>
        <picker mode="selector" :range="studentLevels" :value="studentLevelIndex" @change="onStudentLevelChange">
          <view class="form-value">
            {{ form.studentLevel }}
            <view class="form-arrow"></view>
          </view>
        </picker>
      </view>

      <view class="form-item form-item-textarea">
        <view class="form-label">补充要求</view>
        <textarea class="form-textarea" v-model="form.requirements" placeholder="对课件内容的额外要求（选填）"></textarea>
      </view>
    </view>

    <view class="form-tip tip-outer">预计消耗 {{ credits }} 积分</view>

    <view class="btn btn-primary gen-btn" @click="onGenerate">✨ 生成完整课件</view>

    <!-- ① 教学研究包（5 个可折叠板块） -->
    <view v-if="pack">
      <view class="section-title">📚 教学研究包</view>
      <view class="card section-card" v-for="sec in packSections" :key="sec.number">
        <view class="section-head" @click="toggleSection(sec)">
          <view class="section-no">{{ sec.number }}</view>
          <view class="section-title-text">{{ sec.title }}</view>
          <view class="section-arrow" :class="{ open: sec.open }"></view>
        </view>
        <view class="content-text section-body" v-if="sec.open">{{ sec.text }}</view>
      </view>
    </view>

    <!-- ② 课件页面 + 操作行 -->
    <view v-if="slides.length">
      <view class="section-title">📑 课件页面（{{ slides.length }} 页）</view>
      <view class="card action-card">
        <view class="action-row">
          <view class="btn btn-ghost action-btn" @click="onGenAllImages">🖼 一键生成全部配图</view>
          <view class="btn btn-primary action-btn" @click="openViewer">▶ 放映</view>
          <view class="btn btn-plain action-btn" @click="onExportPPTX">📥 导出PPTX</view>
        </view>
        <view class="action-row">
          <view class="btn btn-ghost action-btn" @click="onLectureScript">🎤 说课稿</view>
          <view class="btn btn-ghost action-btn" @click="onCloze">✍️ 随堂练习</view>
          <view class="btn btn-ghost action-btn" @click="onVideo">🎬 开场视频</view>
        </view>
        <view class="credits-tip">每张配图消耗 {{ creditsImg }} 积分，导出 {{ creditsExport }} 积分，说课稿 {{ creditsScript }} 积分，随堂练习 {{ creditsCloze }} 积分</view>
      </view>

      <!-- ③ 逐页卡片 -->
      <view class="card slide-card" v-for="(s, i) in slides" :key="i">
        <view class="slide-head">
          <view class="slide-badge">{{ i + 1 }}</view>
          <view class="slide-title ellipsis">{{ s.title }}</view>
        </view>
        <view class="content-text slide-content">{{ s.content }}</view>
        <view class="slide-suggest">
          <view class="suggest-line">🖼 配图建议：{{ s.visual || '无' }}</view>
          <view class="suggest-line">✨ 动画建议：{{ s.animation || '无' }}</view>
        </view>
        <view class="slide-notes-toggle" @click="s.showNotes = !s.showNotes">
          {{ s.showNotes ? '收起讲解词' : '讲解词' }}
          <text class="toggle-arrow">{{ s.showNotes ? '▲' : '▼' }}</text>
        </view>
        <view class="speaker-notes" v-if="s.showNotes">{{ s.speakerNotes || '暂无讲解词' }}</view>
        <image v-if="s.imageUrl" class="slide-image" :src="s.imageUrl" mode="widthFix"></image>
        <view class="btn btn-ghost img-btn" @click="onGenSlideImage(i)">
          {{ s.imgBusy ? '生成中...' : ('🖼 ' + (s.imageFileID ? '重新配图' : '生成配图')) }}
        </view>
      </view>
    </view>

    <!-- 底部固定栏：保存 / 复制全文 -->
    <view class="fixed-bar" v-if="slides.length">
      <view class="btn btn-plain bar-btn" @click="onSave">💾 保存</view>
      <view class="btn btn-primary bar-btn" @click="onCopy">📋 复制全文</view>
    </view>

    <!-- 放映：全屏遮罩 + swiper -->
    <view class="viewer" v-if="showViewer">
      <view class="viewer-close" @click="closeViewer">✕</view>
      <swiper class="viewer-swiper" :current="viewerIndex" circular @change="onViewerChange">
        <swiper-item v-for="(s, i) in slides" :key="i">
          <view class="viewer-page">
            <view class="viewer-title">{{ s.title }}</view>
            <image v-if="s.imageUrl" class="viewer-image" :src="s.imageUrl" mode="aspectFill"></image>
            <scroll-view class="viewer-content" scroll-y>{{ s.content }}</scroll-view>
            <view class="viewer-notes" v-if="showViewerNotes">📖 {{ s.speakerNotes || '暂无讲解词' }}</view>
          </view>
        </swiper-item>
      </swiper>
      <view class="viewer-bottom">
        <view class="viewer-nav">
          <view class="viewer-nav-btn" @click="viewerPrev">上一页</view>
          <view class="viewer-page-no">第 {{ viewerIndex + 1 }}/{{ slides.length }} 页</view>
          <view class="viewer-nav-btn" @click="viewerNext">下一页</view>
        </view>
        <view class="viewer-opts">
          <view class="viewer-opt" :class="{ on: autoPlay }" @click="toggleAutoPlay">{{ autoPlay ? '⏸ 自动播放中' : '▶ 自动播放' }}</view>
          <view class="viewer-opt" :class="{ on: showViewerNotes }" @click="showViewerNotes = !showViewerNotes">讲解词</view>
        </view>
      </view>
    </view>

    <!-- 说课稿弹层 -->
    <view class="modal-mask" v-if="showScript">
      <view class="modal-box">
        <view class="modal-title">🎤 说课稿</view>
        <scroll-view class="modal-scroll" scroll-y>
          <view class="content-text">{{ scriptContent }}</view>
        </scroll-view>
        <view class="modal-actions">
          <view class="btn btn-plain bar-btn" @click="copyScript">📋 复制</view>
          <view class="btn btn-primary bar-btn" @click="showScript = false">关闭</view>
        </view>
      </view>
    </view>

    <!-- 随堂练习弹层 -->
    <view class="modal-mask" v-if="showCloze">
      <view class="modal-box">
        <view class="modal-title">✍️ 随堂练习</view>
        <scroll-view class="modal-scroll" scroll-y>
          <view class="cloze-item" v-for="(it, i) in clozeItems" :key="i">
            <view class="cloze-q">{{ i + 1 }}. {{ it.content }}</view>
            <view class="cloze-opts" v-if="it.type === 'choice' && it.options && it.options.length">
              <view class="cloze-opt" v-for="(op, k) in it.options" :key="k">{{ op }}</view>
            </view>
            <view class="cloze-toggle" @click="it.showAnswer = !it.showAnswer">{{ it.showAnswer ? '收起答案' : '看答案' }}</view>
            <view class="cloze-answer cloze-answer-blank" v-if="it.showAnswer && it.type === 'blank'">答案：{{ it.answer }}</view>
            <view class="cloze-answer cloze-answer-choice" v-if="it.showAnswer && it.type === 'choice'">
              答案：{{ it.answer }}
              <view class="cloze-analysis" v-if="it.analysis">解析：{{ it.analysis }}</view>
            </view>
          </view>
        </scroll-view>
        <view class="modal-actions">
          <view class="btn btn-plain bar-btn" @click="copyCloze">📋 复制全部</view>
          <view class="btn btn-primary bar-btn" @click="showCloze = false">关闭</view>
        </view>
      </view>
    </view>

    <!-- 开场视频弹层 -->
    <view class="modal-mask" v-if="showVideo">
      <view class="modal-box">
        <view class="modal-title">🎬 开场视频</view>
        <video class="video-player" :src="videoUrl" controls autoplay></video>
        <view class="modal-actions">
          <view class="btn btn-primary bar-btn" @click="showVideo = false">关闭</view>
        </view>
      </view>
    </view>

    <!-- AI 生成中全屏 loading（各功能文案不同） -->
    <view class="ai-loading" v-if="generating || exporting || imgLoading || lecturing || clozing || videoing">
      <view class="ai-spinner"></view>
      <view class="ai-loading-text">{{ loadingText }}</view>
    </view>
  </view>
</template>

<script>
// pages/courseware/courseware.vue - AI 课件：生成完整课件（教研包 + 逐页）+ 配图/放映/导出/说课稿/练习/视频
import api from '../../utils/api.js'
import { SUBJECTS, GRADES, TEACH_STYLES, STUDENT_LEVELS, COLLECTIONS, CREDITS } from '../../utils/constants.js'
import { COURSEWARE_TEMPLATES, VISUAL_STYLES, buildCoursewarePrompt, buildLectureScriptPrompt, buildClozePrompt, buildVideoPrompt, formatText } from '../../utils/prompt.js'

export default {
  data() {
    return {
      subjects: SUBJECTS,
      grades: GRADES,
      styles: TEACH_STYLES,
      visualStyles: VISUAL_STYLES,
      templates: COURSEWARE_TEMPLATES,
      studentLevels: STUDENT_LEVELS,
      credits: CREDITS.COURSEWARE,
      creditsImg: CREDITS.SLIDE_IMAGE,
      creditsExport: CREDITS.EXPORT_PPTX,
      creditsScript: CREDITS.LECTURE_SCRIPT,
      creditsCloze: CREDITS.CLOZE,
      form: {
        subject: '',
        grade: '',
        textbook: '',
        topic: '',
        pages: 20,
        teachStyle: '常规严谨',
        visualStyle: '清新现代',
        template: '标准结构',
        studentLevel: '中等',
        requirements: ''
      },
      subjectIndex: 0,
      gradeIndex: 0,
      textbookIndex: 0,
      styleIndex: 0,
      visualStyleIndex: 0,
      studentLevelIndex: 1,
      textbooks: [],
      // 生成结果
      pack: null,
      packSections: [],
      slides: [],
      // 各功能 loading 状态
      generating: false,
      exporting: false,
      imgLoading: false,
      lecturing: false,
      clozing: false,
      videoing: false,
      // 放映
      showViewer: false,
      viewerIndex: 0,
      autoPlay: false,
      autoTimer: null,
      showViewerNotes: false,
      // 说课稿
      showScript: false,
      scriptContent: '',
      // 随堂练习
      showCloze: false,
      clozeItems: [],
      // 开场视频
      showVideo: false,
      videoUrl: '',
      videoTimer: null
    }
  },
  computed: {
    // 教材名列表：按 学科 + 年级学段(stageOf) 过滤教材库
    textbookNames() {
      const stage = this.stageOf(this.form.grade)
      return (this.textbooks || [])
        .filter(t => t.subject === this.form.subject && t.stage === stage)
        .map(t => t.name || t.title || t.textbook || t.grade || '')
    },
    // 各功能全屏 loading 文案
    loadingText() {
      if (this.generating) return 'AI正在生成课件...'
      if (this.exporting) return '正在导出PPTX...'
      if (this.imgLoading) return 'AI正在生成配图...'
      if (this.lecturing) return 'AI正在撰写说课稿...'
      if (this.clozing) return 'AI正在设计随堂练习...'
      if (this.videoing) return 'AI正在生成开场视频...'
      return '加载中...'
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
  onUnload() {
    // 清理定时器（自动播放轮播 / 视频轮询）
    if (this.autoTimer) {
      clearInterval(this.autoTimer)
      this.autoTimer = null
    }
    if (this.videoTimer) {
      clearInterval(this.videoTimer)
      this.videoTimer = null
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

    /* ==================== 表单 picker / slider ==================== */
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
    onPagesChange(e) {
      this.form.pages = Number(e.detail.value)
    },
    onStyleChange(e) {
      this.styleIndex = Number(e.detail.value)
      this.form.teachStyle = this.styles[this.styleIndex] || '常规严谨'
    },
    onVisualStyleChange(e) {
      this.visualStyleIndex = Number(e.detail.value)
      this.form.visualStyle = this.visualStyles[this.visualStyleIndex] || '清新现代'
    },
    onStudentLevelChange(e) {
      this.studentLevelIndex = Number(e.detail.value)
      this.form.studentLevel = this.studentLevels[this.studentLevelIndex] || '中等'
    },

    /* ==================== 生成完整课件 ==================== */
    onGenerate() {
      if (!this.form.subject) return uni.showToast({ title: '请选择学科', icon: 'none' })
      if (!this.form.grade) return uni.showToast({ title: '请选择年级', icon: 'none' })
      if (!this.form.topic || !this.form.topic.trim()) return uni.showToast({ title: '请输入课题', icon: 'none' })
      this.generating = true
      api.generateCourseware(Object.assign({}, this.form, { prompt: buildCoursewarePrompt(this.form) }))
        .then(res => {
          const pack = (res && res.pack) || {}
          const list = (res && res.slides) || []
          this.pack = pack
          this.packSections = this.buildPackSections(pack)
          // 逐页注入展示与配图状态
          this.slides = list.map((s, i) => Object.assign({}, s, {
            idx: i + 1,
            showNotes: false,
            imageFileID: '',
            imageUrl: '',
            imgBusy: false,
            slideType: (s && s.slideType) || 'concept'
          }))
          this.viewerIndex = 0
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          this.generating = false
        })
    },
    // 教学研究包：预计算 5 个可折叠板块（与小程序版一致）
    buildPackSections(pack) {
      const p = pack || {}
      const taskChain = (p.taskChain || []).map(t => '· ' + (t.task || '') + '（' + (t.minutes || '') + '）：' + (t.activity || '')).join('\n')
      const evaluation = (p.evaluation || []).map(e => '【' + (e.level || '') + '】' + (e.content || '')).join('\n')
      const homework = (p.homework || []).map(h => '【' + (h.level || '') + '】' + (h.items || '')).join('\n')
      return [
        { number: '01', title: '单元整体分析', text: p.unitAnalysis || '', open: true },
        { number: '02', title: '教学目标', text: (p.objectives || []).map((o, i) => '目标' + this.cnNum(i + 1) + '：' + o).join('\n'), open: false },
        { number: '03', title: '大问题与任务链', text: '【大问题】\n' + (p.bigQuestion || '') + (taskChain ? '\n\n【任务链】\n' + taskChain : ''), open: false },
        { number: '04', title: '过渡语与分层评价语', text: ((p.transitions || []).length ? '【过渡语】\n' + p.transitions.join('\n') : '') + (evaluation ? '\n\n【分层评价语】\n' + evaluation : ''), open: false },
        { number: '05', title: '分层作业与板书', text: (homework ? '【分层作业】\n' + homework : '') + (p.boardDesign ? '\n\n【板书设计】\n' + p.boardDesign : ''), open: false }
      ]
    },
    // 数字 → 中文序数
    cnNum(i) {
      const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      return nums[i - 1] || String(i)
    },
    toggleSection(sec) {
      sec.open = !sec.open
    },

    /* ==================== 配图 ==================== */
    // 单页配图
    onGenSlideImage(idx) {
      const s = this.slides[idx]
      if (!s || s.imgBusy) return
      s.imgBusy = true
      api.generateSlideImages({
        style: this.form.visualStyle,
        slides: [{
          title: s.title,
          content: s.content,
          imagePrompt: s.imagePrompt,
          layout: s.layout
        }]
      })
        .then(res => {
          const p = (Array.isArray(res) ? res : [])[0]
          if (!p || !p.fileID) {
            uni.showToast({ title: '未返回配图结果，请重试', icon: 'none' })
            return
          }
          s.imageFileID = p.fileID
          return api.toHttpList([p.fileID])
        })
        .then(urls => {
          if (urls && urls[0]) s.imageUrl = urls[0]
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          s.imgBusy = false
        })
    },
    // 一键生成全部配图：每批 6 页顺序执行，全部 fileID 一次性转 https
    async onGenAllImages() {
      if (!this.slides.length) return
      const need = this.slides.filter(s => !s.imageFileID && !s.imgBusy)
      if (!need.length) {
        uni.showToast({ title: '全部页面已有配图', icon: 'none' })
        return
      }
      this.imgLoading = true
      const total = need.length
      let done = 0
      let failed = false
      for (let i = 0; i < total; i += 6) {
        const batch = need.slice(i, i + 6)
        try {
          const res = await api.generateSlideImages({
            style: this.form.visualStyle,
            slides: batch.map(s => ({
              title: s.title,
              content: s.content,
              imagePrompt: s.imagePrompt,
              layout: s.layout
            }))
          })
          const pairs = Array.isArray(res) ? res : []
          pairs.forEach((p, k) => {
            if (!p || !p.fileID) return
            // index 通常为 1 起始的位置序号；兜底按请求顺序对应
            const pos = Number(p.index) - 1
            const slide = batch[pos] || batch[k] || null
            if (slide) slide.imageFileID = p.fileID
          })
        } catch (err) {
          api.handleAIError(err)
          failed = true
          break
        }
        done += batch.length
        uni.showToast({ title: '已生成 ' + Math.min(done, total) + '/' + total + ' 张配图', icon: 'none' })
      }
      // 全部 fileID 一次性转 https 链接
      const ids = this.slides.filter(s => s.imageFileID).map(s => s.imageFileID)
      if (ids.length) {
        try {
          const urls = await api.toHttpList(ids)
          const urlMap = {}
          ids.forEach((id, j) => {
            urlMap[id] = urls[j] || ''
          })
          this.slides.forEach(s => {
            if (s.imageFileID) s.imageUrl = urlMap[s.imageFileID] || s.imageUrl
          })
        } catch (e) {
          // 链接转换失败时保留已有 imageUrl，可单独重试
        }
      }
      this.imgLoading = false
      if (!failed && done >= total) {
        uni.showToast({ title: '全部配图生成完成', icon: 'success' })
      }
    },

    /* ==================== 放映 ==================== */
    openViewer() {
      if (!this.slides.length) return
      this.viewerIndex = 0
      this.showViewer = true
    },
    closeViewer() {
      this.showViewer = false
      this.showViewerNotes = false
      if (this.autoPlay) this.toggleAutoPlay()
    },
    onViewerChange(e) {
      this.viewerIndex = Number(e.detail.current)
    },
    viewerPrev() {
      this.viewerIndex = (this.viewerIndex - 1 + this.slides.length) % this.slides.length
    },
    viewerNext() {
      this.viewerIndex = (this.viewerIndex + 1) % this.slides.length
    },
    // 自动播放：5 秒翻页，定时器存 this.autoTimer
    toggleAutoPlay() {
      this.autoPlay = !this.autoPlay
      if (this.autoPlay) {
        this.autoTimer = setInterval(() => {
          this.viewerNext()
        }, 5000)
      } else {
        clearInterval(this.autoTimer)
        this.autoTimer = null
      }
    },

    /* ==================== 导出 PPTX ==================== */
    onExportPPTX() {
      if (!this.slides.length) return
      this.exporting = true
      api.exportPPTX({
        title: this.form.topic || '教学课件',
        subtitle: (this.form.subject || '') + (this.form.grade || ''),
        visualStyle: this.form.visualStyle,
        slides: this.slides.map(s => ({
          slideType: s.slideType,
          title: s.title,
          content: s.content,
          speakerNotes: s.speakerNotes,
          imageFileID: s.imageFileID
        }))
      })
        .then(res => {
          const fileID = res && (res.fileID || res.fileId || res.file_id || (res.file && res.file.fileID))
          if (!fileID) throw new Error('导出失败：未返回文件')
          return api.openPPTX(fileID)
        })
        .then(() => {
          uni.showToast({ title: '已导出，可在 WPS/PowerPoint 中打开', icon: 'none' })
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          this.exporting = false
        })
    },

    /* ==================== 说课稿 ==================== */
    onLectureScript() {
      if (!this.pack) {
        uni.showToast({ title: '请先生成完整课件', icon: 'none' })
        return
      }
      this.lecturing = true
      api.generateLectureScript(Object.assign({}, this.form, {
        pack: this.pack,
        prompt: buildLectureScriptPrompt(this.form, this.pack)
      }))
        .then(res => {
          this.scriptContent = typeof res === 'string'
            ? res
            : ((res && (res.content || res.text)) || JSON.stringify(res))
          this.showScript = true
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          this.lecturing = false
        })
    },
    copyScript() {
      if (!this.scriptContent) return
      api.copyText(this.scriptContent)
        .then(() => uni.showToast({ title: '已复制说课稿', icon: 'success' }))
        .catch(err => api.handleAIError(err))
    },

    /* ==================== 随堂练习（挖空 + 选择） ==================== */
    onCloze() {
      if (!this.slides.length) {
        uni.showToast({ title: '请先生成完整课件', icon: 'none' })
        return
      }
      this.clozing = true
      // 把逐页标题+内容拼成文本喂给提示词
      const slidesText = this.slides.map(s => s.title + '\n' + s.content).join('\n')
      api.generateCloze(Object.assign({}, this.form, {
        prompt: buildClozePrompt(this.form, slidesText)
      }))
        .then(res => {
          const list = Array.isArray(res) ? res : ((res && res.items) || [])
          this.clozeItems = list.map(it => Object.assign({}, it, { showAnswer: false }))
          this.showCloze = true
        })
        .catch(err => api.handleAIError(err))
        .then(() => {
          this.clozing = false
        })
    },
    // 拼装练习全文（复制全部用）
    buildClozeText() {
      return this.clozeItems.map((it, i) => {
        let t = (i + 1) + '. ' + (it.content || '')
        if (it.type === 'choice' && Array.isArray(it.options) && it.options.length) {
          t += '\n' + it.options.join('\n')
        }
        t += '\n答案：' + (it.answer || '')
        if (it.analysis) t += '\n解析：' + it.analysis
        return t
      }).join('\n\n')
    },
    copyCloze() {
      if (!this.clozeItems.length) return
      api.copyText(this.buildClozeText())
        .then(() => uni.showToast({ title: '已复制全部练习', icon: 'success' }))
        .catch(err => api.handleAIError(err))
    },

    /* ==================== 开场视频 ==================== */
    onVideo() {
      if (!this.form.topic) {
        uni.showToast({ title: '请先填写课题', icon: 'none' })
        return
      }
      this.videoing = true
      api.generateVideoTask({
        topic: this.form.topic,
        prompt: buildVideoPrompt(this.form)
      })
        .then(res => {
          const taskId = res && (res.taskId || res.taskID || res.task_id)
          if (!taskId) throw new Error('视频任务创建失败')
          this.pollVideo(taskId)
        })
        .catch(err => {
          api.handleAIError(err)
          this.videoing = false
        })
    },
    // 每 5 秒查询一次任务状态，最多 60 次
    pollVideo(taskId) {
      let count = 0
      this.videoTimer = setInterval(() => {
        count++
        api.queryVideoTask(taskId)
          .then(res => {
            const fileID = res && (res.fileID || (res.file && res.file.fileID))
            const status = res && (res.status || '')
            // 成功：fileID 转 https 后播放
            if (fileID || status === 'succeeded' || status === 'success') {
              clearInterval(this.videoTimer)
              this.videoTimer = null
              api.toHttp(fileID).then(url => {
                this.videoing = false
                if (url) {
                  this.videoUrl = url
                  this.showVideo = true
                } else {
                  uni.showToast({ title: '视频链接获取失败', icon: 'none' })
                }
              })
              return
            }
            // 失败
            if (status === 'failed' || status === 'error') {
              clearInterval(this.videoTimer)
              this.videoTimer = null
              this.videoing = false
              uni.showToast({ title: '视频生成失败，请重试', icon: 'none' })
              return
            }
            // 超时
            if (count >= 60) {
              clearInterval(this.videoTimer)
              this.videoTimer = null
              this.videoing = false
              uni.showToast({ title: '视频生成超时，请稍后重试', icon: 'none' })
            }
          })
          .catch(err => {
            api.handleAIError(err)
            this.videoing = false
            clearInterval(this.videoTimer)
            this.videoTimer = null
          })
      }, 5000)
    },

    /* ==================== 保存 / 复制 ==================== */
    onSave() {
      if (!this.slides.length) return
      api.addRecord(COLLECTIONS.COURSEWARES, Object.assign({}, this.form, {
        content: JSON.stringify({ pack: this.pack, slides: this.slides })
      }))
        .then(() => uni.showToast({ title: '已保存到课件库', icon: 'success' }))
        .catch(err => api.handleAIError(err))
    },
    onCopy() {
      if (!this.slides.length) return
      api.copyText(formatText('courseware', { pack: this.pack, slides: this.slides, topic: this.form.topic }))
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
.form-item-block {
  align-items: flex-start;
}
.form-item-slider {
  align-items: center;
}
.slider-wrap {
  flex: 1;
  margin-right: 16rpx;
}
.slider {
  margin: 0;
}
.page-num {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #1677FF;
  font-weight: 500;
}
.tip-outer {
  padding: 0 32rpx 20rpx;
}

/* 生成按钮 */
.gen-btn {
  margin: 0 24rpx 32rpx;
}

/* 折叠板块卡片（教研包） */
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

/* 操作行 */
.action-card {
  padding: 24rpx 24rpx 20rpx;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}
.action-btn {
  flex: 1;
  height: 76rpx;
  font-size: 26rpx;
  border-radius: 38rpx;
  margin-right: 16rpx;
  min-width: 180rpx;
  padding: 0 8rpx;
}
.action-btn:last-child {
  margin-right: 0;
}
.credits-tip {
  font-size: 22rpx;
  color: #86909C;
  line-height: 1.6;
}

/* 逐页卡片 */
.slide-card {
  padding: 24rpx;
}
.slide-head {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}
.slide-badge {
  width: 48rpx;
  height: 48rpx;
  border-radius: 10rpx;
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  font-size: 24rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16rpx;
  flex-shrink: 0;
}
.slide-title {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2329;
}
.slide-content {
  margin-top: 4rpx;
}
.slide-suggest {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  background: #F7F8FA;
  border-radius: 12rpx;
}
.suggest-line {
  font-size: 24rpx;
  color: #4E5969;
  line-height: 1.8;
}
.slide-notes-toggle {
  margin-top: 16rpx;
  display: inline-flex;
  align-items: center;
  font-size: 24rpx;
  color: #1677FF;
}
.toggle-arrow {
  margin-left: 8rpx;
  font-size: 20rpx;
}
.speaker-notes {
  margin-top: 12rpx;
  padding: 16rpx 20rpx;
  background: #E8F3FF;
  border-radius: 12rpx;
  font-size: 25rpx;
  color: #1F2329;
  line-height: 1.8;
}
.slide-image {
  width: 100%;
  margin-top: 16rpx;
  border-radius: 12rpx;
}
.img-btn {
  margin-top: 20rpx;
  height: 68rpx;
  font-size: 25rpx;
  border-radius: 34rpx;
}

/* 放映全屏遮罩（深色底 + swiper） */
.viewer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 300;
  background: #0F172A;
  display: flex;
  flex-direction: column;
}
.viewer-close {
  position: absolute;
  top: 40rpx;
  right: 40rpx;
  z-index: 5;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
  font-size: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.viewer-swiper {
  width: 100%;
  height: calc(100% - 240rpx);
}
.viewer-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 40rpx 20rpx;
  box-sizing: border-box;
  color: #FFFFFF;
}
.viewer-title {
  font-size: 40rpx;
  font-weight: 600;
  text-align: center;
  margin-bottom: 20rpx;
}
.viewer-image {
  width: 100%;
  max-height: 40%;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}
.viewer-content {
  flex: 1;
  min-height: 0;
  width: 100%;
  color: #CBD5E1;
  font-size: 28rpx;
  line-height: 1.8;
}
.viewer-notes {
  width: 100%;
  max-height: 25%;
  margin-top: 12rpx;
  padding: 14rpx 20rpx;
  box-sizing: border-box;
  background: rgba(22, 119, 255, 0.2);
  border-radius: 12rpx;
  color: #FFFFFF;
  font-size: 24rpx;
  line-height: 1.7;
  overflow-y: auto;
}
.viewer-bottom {
  height: 240rpx;
  padding: 16rpx 32rpx 40rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.viewer-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.viewer-nav-btn {
  width: 160rpx;
  height: 64rpx;
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.12);
  color: #FFFFFF;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.viewer-page-no {
  color: #94A3B8;
  font-size: 26rpx;
}
.viewer-opts {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.viewer-opt {
  padding: 10rpx 28rpx;
  border-radius: 32rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.3);
  color: #CBD5E1;
  font-size: 24rpx;
}
.viewer-opt.on {
  border-color: #1677FF;
  background: #1677FF;
  color: #FFFFFF;
}

/* 弹层（说课稿/练习/视频共用） */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 400;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-box {
  width: 640rpx;
  max-height: 80vh;
  background: #FFFFFF;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-title {
  padding: 28rpx 32rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #1F2329;
  border-bottom: 1rpx solid #F2F3F5;
}
.modal-scroll {
  flex: 1;
  min-height: 0;
  max-height: 55vh;
  padding: 28rpx 32rpx;
  box-sizing: border-box;
}
.modal-actions {
  display: flex;
  padding: 20rpx 24rpx;
  border-top: 1rpx solid #F2F3F5;
}
.video-player {
  width: 100%;
  height: 360rpx;
  margin: 24rpx 0 0;
}

/* 随堂练习 */
.cloze-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F2F3F5;
}
.cloze-item:last-child {
  border-bottom: none;
}
.cloze-q {
  font-size: 28rpx;
  color: #1F2329;
  line-height: 1.7;
  white-space: pre-wrap;
}
.cloze-opts {
  margin-top: 12rpx;
}
.cloze-opt {
  font-size: 26rpx;
  color: #4E5969;
  line-height: 1.8;
}
.cloze-toggle {
  margin-top: 12rpx;
  display: inline-flex;
  font-size: 24rpx;
  color: #1677FF;
}
.cloze-answer {
  margin-top: 12rpx;
  padding: 14rpx 20rpx;
  border-radius: 12rpx;
  font-size: 25rpx;
  line-height: 1.7;
}
.cloze-answer-blank {
  background: #E8FFEA;
  color: #00B42A;
}
.cloze-answer-choice {
  background: #E8F3FF;
  color: #1677FF;
}
.cloze-analysis {
  margin-top: 8rpx;
  color: #4E5969;
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
