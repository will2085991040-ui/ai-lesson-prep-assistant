<template>
  <!-- 微信内访问引导弹窗：非微信浏览器打开时提示 -->
  <view v-if="visible" class="wx-guide-mask">
    <view class="wx-guide-box">
      <view class="wx-guide-icon">💡</view>
      <view class="wx-guide-title">体验提示</view>
      <view class="wx-guide-text">
        建议在【微信】中打开本页面，登录和分享体验更佳；
        也可以直接在微信里搜索小程序「AI备课助手」使用（功能完全一致）。
      </view>
      <view class="wx-guide-btn" @click="close">知道了</view>
    </view>
  </view>
</template>

<script>
// wx-guide.vue - 非微信浏览器引导弹窗组件
// 在 H5 首次打开时自动检测环境并弹窗（小程序/App 端不显示）
export default {
  name: 'wx-guide',
  data() {
    return { visible: false }
  },
  mounted() {
    // #ifdef H5
    const ua = navigator.userAgent || ''
    const isWechat = ua.indexOf('MicroMessenger') > -1
    this.visible = !isWechat && !uni.getStorageSync('h5_guide_dismiss')
    // #endif
  },
  methods: {
    close() {
      this.visible = false
      uni.setStorageSync('h5_guide_dismiss', 1)
    }
  }
}
</script>

<style scoped>
.wx-guide-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wx-guide-box {
  width: 560rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 48rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wx-guide-icon {
  font-size: 72rpx;
  margin-bottom: 12rpx;
}
.wx-guide-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1F2329;
  margin-bottom: 16rpx;
}
.wx-guide-text {
  font-size: 26rpx;
  color: #4E5969;
  line-height: 1.7;
  text-align: center;
}
.wx-guide-btn {
  margin-top: 36rpx;
  width: 320rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  font-size: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
