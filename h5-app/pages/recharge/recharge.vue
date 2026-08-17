<template>
  <view class="page">
    <!-- 余额卡：渐变蓝底白字 -->
    <view class="balance-card">
      <view class="balance-label">我的积分余额</view>
      <view class="balance-num">{{ balance }}</view>
      <view class="balance-sub">累计充值 {{ totalRecharge }} · 累计消耗 {{ totalConsume }}</view>
      <view class="balance-hint">1元 ≈ 100积分</view>
    </view>

    <!-- 兑换码充值 -->
    <view class="card">
      <view class="block-title">兑换码充值</view>
      <view class="form-tip">兑换码可联系管理员获取</view>
      <view class="code-row">
        <input class="code-input" :value="code" @input="onCodeInput" placeholder="请输入兑换码" placeholder-class="form-placeholder" />
      </view>
      <!-- redeeming 时防连点 -->
      <view class="btn btn-primary redeem-btn" :class="{ 'btn-disabled': redeeming }" @click="redeem">{{ redeeming ? '兑换中...' : '立即兑换' }}</view>
    </view>

    <!-- 充值套餐 -->
    <view class="card">
      <view class="block-title">充值套餐</view>
      <view class="pack-card" v-for="(p, i) in RECHARGE_PACKAGES" :key="i">
        <view class="pack-info">
          <view class="pack-price"><text class="pack-yen">¥</text>{{ p.price }}</view>
          <view class="pack-credits">得 {{ p.credits }} 积分</view>
        </view>
        <view class="btn btn-plain pack-btn" @click="onPay">微信支付</view>
      </view>
    </view>

    <!-- 积分明细 -->
    <view class="card">
      <view class="block-title">积分明细</view>
      <view v-if="transactions.length">
        <view class="tx-item" v-for="(t, i) in transactions" :key="i">
          <view class="tx-info">
            <view class="tx-remark ellipsis">{{ t.remark || t.description || '积分变动' }}</view>
            <view class="text-secondary tx-time">{{ txTime(t) }}</view>
          </view>
          <!-- 充值显示 +X 绿色，消耗显示 X 灰色 -->
          <text :class="['tag', t.type === 'recharge' ? 'tag-green' : 'tag-gray']">{{ txAmount(t) }}</text>
        </view>
      </view>
      <view class="empty" v-else>
        <view class="empty-icon">🧾</view>
        <text>暂无积分明细</text>
      </view>
    </view>
  </view>
</template>

<script>
import { getWallet, redeemCode, formatTime } from '../../utils/api.js'

// constants.js 为 CommonJS 模块，用 require 引入
const { RECHARGE_PACKAGES } = require('../../utils/constants.js')

export default {
  data() {
    return {
      RECHARGE_PACKAGES: RECHARGE_PACKAGES,
      balance: 0,
      totalRecharge: 0,
      totalConsume: 0,
      code: '',
      redeeming: false,
      transactions: []
    }
  },
  // 每次回到页面都刷新钱包数据
  onShow() {
    this.loadWallet()
  },
  methods: {
    loadWallet() {
      getWallet()
        .then(res => {
          const data = res || {}
          this.balance = data.balance != null ? data.balance : 0
          this.totalRecharge = data.totalRecharge != null ? data.totalRecharge : (data.recharged || 0)
          this.totalConsume = data.totalConsume != null ? data.totalConsume : (data.consumed || 0)
          this.transactions = Array.isArray(data.transactions) ? data.transactions : []
        })
        .catch(err => {
          // 网关异常时兜底为空，避免页面崩溃
          this.balance = 0
          this.transactions = []
          uni.showToast({ title: (err && err.message) || '钱包加载失败', icon: 'none' })
        })
    },
    onCodeInput(e) {
      this.code = e.detail.value
    },
    redeem() {
      if (this.redeeming) return
      const code = (this.code || '').trim()
      if (!code) return uni.showToast({ title: '请输入兑换码', icon: 'none' })
      this.redeeming = true
      redeemCode(code)
        .then(res => {
          const data = res || {}
          const gained = data.credits != null ? data.credits : (data.amount != null ? data.amount : 0)
          const balance = data.balance != null ? data.balance : this.balance
          uni.showModal({
            title: '兑换成功',
            content: '获得 ' + gained + ' 积分，当前余额 ' + balance,
            showCancel: false
          })
          // 清空输入并刷新钱包
          this.code = ''
          this.redeeming = false
          this.loadWallet()
        })
        .catch(err => {
          this.redeeming = false
          uni.showToast({ title: (err && err.message) || '兑换失败，请检查兑换码', icon: 'none' })
        })
    },
    // 微信支付：个人主体不可用，弹窗引导使用兑换码
    onPay() {
      uni.showModal({
        title: '提示',
        content: '微信支付需要企业主体小程序。个人主体请使用兑换码充值（兑换码可联系管理员获取）。',
        showCancel: false
      })
    },
    // 明细金额展示：充值 +X，消耗 X（保留后端原始正负号）
    txAmount(t) {
      let amount = t.amount != null ? t.amount : (t.credits != null ? t.credits : 0)
      amount = Number(amount) || 0
      if (t.type === 'recharge') return '+' + Math.abs(amount)
      return '' + amount
    },
    txTime(t) {
      const ts = t.time || t.createdAt || t.createTime
      return ts ? formatTime(ts) : ''
    }
  }
}
</script>

<style scoped>
.page {
  padding-bottom: 40rpx;
}

/* 余额卡 */
.balance-card {
  margin: 24rpx;
  padding: 44rpx 36rpx;
  border-radius: 16rpx;
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 20rpx rgba(22, 119, 255, 0.28);
}
.balance-label {
  font-size: 26rpx;
  opacity: 0.9;
}
.balance-num {
  margin: 12rpx 0;
  font-size: 72rpx;
  font-weight: 700;
  line-height: 1.2;
}
.balance-sub {
  font-size: 24rpx;
  opacity: 0.9;
}
.balance-hint {
  margin-top: 8rpx;
  font-size: 22rpx;
  opacity: 0.75;
}

.block-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1F2329;
}

/* 兑换码 */
.code-row {
  margin-top: 20rpx;
}
.code-input {
  height: 88rpx;
  padding: 0 24rpx;
  background: #F7F8FA;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}
.redeem-btn {
  margin-top: 24rpx;
}

/* 充值套餐 */
.pack-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 4rpx;
  border-bottom: 1rpx solid #F2F3F5;
}
.pack-card:last-child {
  border-bottom: none;
}
.pack-price {
  font-size: 44rpx;
  font-weight: 700;
  color: #1F2329;
}
.pack-yen {
  margin-right: 4rpx;
  font-size: 26rpx;
  font-weight: 500;
  color: #FF7D00;
}
.pack-credits {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #86909C;
}
.pack-btn {
  width: 200rpx;
  height: 72rpx;
  border-radius: 36rpx;
  font-size: 27rpx;
}

/* 积分明细 */
.tx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 4rpx;
  border-bottom: 1rpx solid #F2F3F5;
}
.tx-item:last-child {
  border-bottom: none;
}
.tx-info {
  flex: 1;
  min-width: 0;
  margin-right: 20rpx;
}
.tx-remark {
  font-size: 27rpx;
  color: #1F2329;
}
.tx-time {
  margin-top: 6rpx;
}
</style>
