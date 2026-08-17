<template>
  <view class="page">
    <!-- 头部渐变卡：头像 + 昵称编辑 + 副文字 -->
    <view class="header-card">
      <view class="avatar">👩‍🏫</view>
      <view class="header-main">
        <input
          class="nickname-input"
          :value="user.nickname"
          @input="onNicknameInput"
          @blur="onNicknameBlur"
          placeholder="点击设置昵称"
          placeholder-class="header-placeholder"
        />
        <view class="header-sub">坚持备课，桃李满天下</view>
      </view>
    </view>

    <!-- 积分余额卡 -->
    <view class="card balance-card-row">
      <view class="balance-left">
        <view class="balance-title">💰 积分余额</view>
        <view class="balance-num">{{ balance }}</view>
      </view>
      <view class="btn btn-ghost go-recharge" @click="goRecharge">去充值</view>
    </view>

    <!-- 备课统计：5 宫格 -->
    <view class="card">
      <view class="stat-total">累计备课 {{ stats.total }} 次</view>
      <view class="stat-grid">
        <view class="stat-cell" v-for="(s, i) in statCells" :key="i">
          <view class="stat-num">{{ s.value }}</view>
          <view class="stat-label">{{ s.label }}</view>
        </view>
      </view>
    </view>

    <!-- 使用帮助：FAQ 手风琴 -->
    <view class="card">
      <view class="faq-title">使用帮助</view>
      <view class="faq-item" v-for="(f, i) in faq" :key="i" @click="toggleFaq(i)">
        <view class="faq-question">
          <text class="faq-q-text">{{ f.q }}</text>
          <text class="faq-arrow">{{ openIndex === i ? '−' : '+' }}</text>
        </view>
        <view class="faq-answer" v-if="openIndex === i">
          <view class="content-text">{{ f.a }}</view>
        </view>
      </view>
    </view>

    <!-- 页脚 -->
    <view class="footer-tip">H5 网页版 · 与微信小程序版数据互通</view>
  </view>
</template>

<script>
import { login, getUser, setUser, getWallet, getUserStats } from '../../utils/api.js'

export default {
  data() {
    return {
      // 初始带 nickname 键，保证 Vue2 下 input 绑定可响应
      user: { nickname: '' },
      balance: 0,
      // 备课统计，字段兜底 0
      stats: {
        lessonPlans: 0,
        pptOutlines: 0,
        coursewares: 0,
        exercises: 0,
        analyses: 0,
        total: 0
      },
      // 使用帮助 FAQ
      faq: [
        { q: '如何生成教案？', a: '进入「智能备课」页面，选择学科、年级，填写课题并选择课型与风格，点击「生成教案」即可。AI 将按教材分析、学情分析、教学过程等完整结构输出。' },
        { q: '如何配置模型？', a: '本工具统一使用云端大模型服务，无需自行配置。若需更换模型或对接自有 API，请联系管理员处理。' },
        { q: '积分怎么获得？', a: '新用户注册自动赠送 200 积分；之后可通过兑换码充值或微信支付（需企业主体）获取积分，1 元 ≈ 100 积分。' },
        { q: '兑换码怎么用？', a: '进入「充值中心」，在「兑换码充值」输入管理员发放的兑换码，点击「立即兑换」即可到账，积分实时更新。' },
        { q: '如何导出PPTX？', a: '在 AI 课件详情页点击「导出 PPTX」，云端将生成可编辑的 PPTX 文件，H5 端直接下载，App 端使用系统文档打开。' },
        { q: '数据保存在哪里？', a: '备课记录、积分与统计均保存在云端数据库（腾讯云开发），H5 网页版与微信小程序版数据互通，本地不保留核心数据。' }
      ],
      // 当前展开的 FAQ 索引，-1 表示全部收起
      openIndex: -1
    }
  },
  computed: {
    // 5 宫格数据：教案 / 课件大纲 / AI课件 / 习题 / 学情
    statCells() {
      const s = this.stats
      return [
        { label: '教案', value: s.lessonPlans },
        { label: '课件大纲', value: s.pptOutlines },
        { label: 'AI课件', value: s.coursewares },
        { label: '习题', value: s.exercises },
        { label: '学情', value: s.analyses }
      ]
    }
  },
  // 每次回到页面刷新用户 / 钱包 / 统计
  onShow() {
    this.loadUser()
    this.loadWallet()
    this.loadStats()
  },
  methods: {
    loadUser() {
      const u = getUser() || {}
      // 合并兜底 nickname，保证 input 绑定可响应
      this.user = Object.assign({ nickname: '' }, u)
    },
    loadWallet() {
      getWallet()
        .then(res => {
          const data = res || {}
          this.balance = data.balance != null ? data.balance : 0
        })
        .catch(() => {
          // 钱包加载失败不阻塞页面
          this.balance = 0
        })
    },
    loadStats() {
      getUserStats()
        .then(res => {
          const s = res || {}
          const lessonPlans = s.lessonPlans || 0
          const pptOutlines = s.pptOutlines || 0
          const coursewares = s.coursewares || 0
          const exercises = s.exercises || 0
          const analyses = s.analyses || 0
          this.stats = {
            lessonPlans: lessonPlans,
            pptOutlines: pptOutlines,
            coursewares: coursewares,
            exercises: exercises,
            analyses: analyses,
            // total 后端未返回时按五项求和兜底
            total: s.total != null ? s.total : (lessonPlans + pptOutlines + coursewares + exercises + analyses)
          }
        })
        .catch(() => {
          // 统计加载失败时保留兜底 0
        })
    },
    onNicknameInput(e) {
      this.user.nickname = e.detail.value
    },
    // 昵称失焦保存：调用 login 同步昵称并写回本地
    onNicknameBlur() {
      const nickname = (this.user.nickname || '').trim()
      login({ nickname: nickname })
        .then(res => {
          const data = res || {}
          const merged = Object.assign({}, this.user, data, { nickname: nickname })
          setUser(merged)
          this.user = merged
          uni.showToast({ title: '昵称已保存', icon: 'success' })
        })
        .catch(err => {
          uni.showToast({ title: (err && err.message) || '昵称保存失败', icon: 'none' })
        })
    },
    goRecharge() {
      uni.navigateTo({ url: '/pages/recharge/recharge' })
    },
    // FAQ 手风琴切换
    toggleFaq(i) {
      this.openIndex = this.openIndex === i ? -1 : i
    }
  }
}
</script>

<style scoped>
.page {
  padding-bottom: 40rpx;
}

/* 头部渐变卡 */
.header-card {
  display: flex;
  align-items: center;
  margin: 24rpx;
  padding: 48rpx 36rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 20rpx rgba(22, 119, 255, 0.28);
}
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 108rpx;
  height: 108rpx;
  margin-right: 28rpx;
  flex-shrink: 0;
  font-size: 64rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 50%;
}
.header-main {
  flex: 1;
  min-width: 0;
}
.nickname-input {
  height: 60rpx;
  font-size: 36rpx;
  font-weight: 600;
  color: #FFFFFF;
}
.header-placeholder {
  color: rgba(255, 255, 255, 0.75);
}
.header-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.85;
}

/* 积分余额卡 */
.balance-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.balance-title {
  font-size: 27rpx;
  color: #4E5969;
}
.balance-num {
  margin-top: 8rpx;
  font-size: 52rpx;
  font-weight: 700;
  color: #1F2329;
}
.go-recharge {
  width: 200rpx;
  height: 72rpx;
  border-radius: 36rpx;
  font-size: 27rpx;
}

/* 备课统计 5 宫格 */
.stat-total {
  margin-bottom: 24rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #1F2329;
}
.stat-grid {
  display: flex;
  flex-wrap: wrap;
}
.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20%;
  padding: 12rpx 0;
}
.stat-num {
  font-size: 40rpx;
  font-weight: 700;
  color: #1677FF;
}
.stat-label {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #86909C;
}

/* 使用帮助 FAQ */
.faq-title {
  margin-bottom: 8rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2329;
}
.faq-item {
  padding: 24rpx 4rpx;
  border-bottom: 1rpx solid #F2F3F5;
}
.faq-item:last-child {
  border-bottom: none;
}
.faq-question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 28rpx;
  color: #1F2329;
}
.faq-q-text {
  flex: 1;
  margin-right: 20rpx;
}
.faq-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
  font-size: 28rpx;
  color: #4E5969;
  background: #F2F3F5;
  border-radius: 50%;
}
.faq-answer {
  margin-top: 16rpx;
}

.footer-tip {
  padding: 40rpx 0 60rpx;
  text-align: center;
  font-size: 24rpx;
  color: #C9CDD4;
}
</style>
