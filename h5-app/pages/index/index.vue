<template>
  <view class="page">
    <!-- 顶部渐变问候卡片 -->
    <view class="hero">
      <view class="hero-greet">{{ greeting }}，老师</view>
      <view class="hero-date">{{ dateText }}</view>
      <view class="hero-slogan">今天也要备出好课哦～</view>
    </view>

    <!-- 每日小提示（按日期轮换） -->
    <view class="card tip-card" v-if="dailyTip">
      <view class="tip-text">💡 {{ dailyTip }}</view>
    </view>

    <!-- 快捷入口（3 列网格） -->
    <view class="section-title">快捷入口</view>
    <view class="card grid-card">
      <view
        class="grid-item"
        v-for="item in entries"
        :key="item.name"
        @click="go(item.url)"
      >
        <view class="grid-icon">{{ item.icon }}</view>
        <view class="grid-name">{{ item.name }}</view>
        <view class="grid-sub">{{ item.sub }}</view>
      </view>
    </view>

    <!-- 热门课题推荐 -->
    <view class="section-title">热门课题推荐</view>
    <view class="card">
      <view class="chips">
        <view
          class="chip"
          :class="{ 'chip-active': inspirationSubject === s }"
          v-for="s in inspirationSubjects"
          :key="s"
          @click="switchSubject(s)"
        >{{ s }}</view>
      </view>
      <view v-if="inspirationLoading" class="insp-loading">加载中...</view>
      <view v-else-if="inspirations.length" class="topic-list">
        <view
          class="topic-item"
          v-for="(it, i) in inspirations"
          :key="i"
          @click="goTopic(it)"
        >
          <view class="topic-title">🔥 {{ it.title }}</view>
          <view class="topic-reason" v-if="it.reason">{{ it.reason }}</view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty-icon">📭</view>
        <view>暂无推荐，请稍后重试</view>
      </view>
    </view>

    <!-- 微信引导弹窗（H5 非微信环境自动提示） -->
    <wx-guide />
  </view>
</template>

<script>
// pages/index/index.vue - 首页：问候语/每日提示/快捷入口/热门课题推荐
import wxGuide from '../../components/wx-guide/wx-guide.vue'
import api from '../../utils/api.js'
import { DAILY_TIPS } from '../../utils/constants.js'

// 热门课题的学科 chips（默认语文）
const INSPIRATION_SUBJECTS = ['语文', '数学', '英语']

export default {
  components: { wxGuide },
  data() {
    return {
      greeting: '',
      dateText: '',
      dailyTip: '',
      inspirationSubjects: INSPIRATION_SUBJECTS,
      inspirationSubject: '语文',
      inspirations: [],
      inspirationLoading: false,
      entries: [
        { icon: '📝', name: '智能备课', sub: '完整教案', url: '/pages/lesson-plan/lesson-plan' },
        { icon: '📽️', name: 'AI课件', sub: '图文课件', url: '/pages/courseware/courseware' },
        { icon: '✍️', name: '分层习题', sub: '三层递进', url: '/pages/exercises/exercises' },
        { icon: '📊', name: '学情诊断', sub: '能力雷达', url: '/pages/analysis/analysis' },
        { icon: '💰', name: '充值中心', sub: '积分充值', url: '/pages/recharge/recharge' }
      ]
    }
  },
  onLoad() {
    // 首次进入：加载问候/日期/每日提示与热门课题
    this.inited = false
    this.loadDaily()
    this.fetchInspiration()
  },
  onShow() {
    // 从其他页面返回时刷新（首次 onShow 紧跟 onLoad 触发，跳过避免重复加载）
    if (this.inited) {
      this.loadDaily()
      this.fetchInspiration()
    }
    this.inited = true
  },
  methods: {
    // 计算问候语与日期（按小时分段）+ 每日提示（按天数轮换）
    loadDaily() {
      const now = new Date()
      const h = now.getHours()
      if (h < 12) this.greeting = '早上好'
      else if (h < 18) this.greeting = '下午好'
      else this.greeting = '晚上好'
      this.dateText = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日'
      this.dailyTip = DAILY_TIPS[Math.floor(Date.now() / 86400000) % DAILY_TIPS.length]
    },
    // 拉取当前学科的热门课题（免费接口，失败仅 toast）
    fetchInspiration() {
      this.inspirationLoading = true
      api.getInspiration(this.inspirationSubject)
        .then(res => {
          const list = Array.isArray(res) ? res : (res && res.list) || []
          this.inspirations = list.slice(0, 3)
        })
        .catch(err => {
          this.inspirations = []
          api.handleAIError(err)
        })
        .then(() => {
          this.inspirationLoading = false
        })
    },
    // 切换学科 chips
    switchSubject(s) {
      this.inspirationSubject = s
      this.fetchInspiration()
    },
    // 点击课题 → 跳转智能备课并预填学科/课题
    goTopic(it) {
      const subject = encodeURIComponent(this.inspirationSubject)
      const topic = encodeURIComponent(it.title || '')
      uni.navigateTo({ url: '/pages/lesson-plan/lesson-plan?subject=' + subject + '&topic=' + topic })
    },
    // 快捷入口跳转
    go(url) {
      uni.navigateTo({ url })
    }
  }
}
</script>

<style scoped>
.page {
  padding-bottom: 40rpx;
}

/* 顶部渐变问候卡片 */
.hero {
  margin: 24rpx 24rpx 24rpx;
  padding: 48rpx 32rpx 44rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(22, 119, 255, 0.3);
}
.hero-greet {
  font-size: 40rpx;
  font-weight: 600;
}
.hero-date {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.85;
}
.hero-slogan {
  margin-top: 20rpx;
  font-size: 26rpx;
  opacity: 0.9;
}

/* 每日小提示：淡蓝底圆角卡 */
.tip-card {
  background: #E8F3FF;
  box-shadow: none;
}
.tip-text {
  font-size: 26rpx;
  color: #1677FF;
  line-height: 1.7;
}

/* 快捷入口 3 列网格 */
.grid-card {
  display: flex;
  flex-wrap: wrap;
  padding: 12rpx 0;
}
.grid-item {
  width: 33.33%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 0;
}
.grid-icon {
  font-size: 56rpx;
  line-height: 1.2;
}
.grid-name {
  margin-top: 12rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #1F2329;
}
.grid-sub {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #86909C;
}

/* 热门课题 */
.insp-loading {
  padding: 60rpx 0;
  text-align: center;
  color: #86909C;
  font-size: 26rpx;
}
.topic-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F2F3F5;
}
.topic-item:last-child {
  border-bottom: none;
  padding-bottom: 4rpx;
}
.topic-title {
  font-size: 29rpx;
  color: #1F2329;
  font-weight: 500;
}
.topic-reason {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #86909C;
  line-height: 1.6;
}
</style>
