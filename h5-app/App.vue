<script>
// App.vue - 应用入口（uni-app H5/App 版）
// 与微信小程序版共用同一套云函数后端（经 h5gateway HTTP 网关调用）
import { login, setUserId } from './utils/api.js'

export default {
  onLaunch: function () {
    // H5 没有 openid：本地生成匿名 userId 作为用户身份（小程序版仍用 openid）
    let uid = uni.getStorageSync('h5_user_id')
    if (!uid) {
      uid = 'h5-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
      uni.setStorageSync('h5_user_id', uid)
    }
    setUserId(uid)
    // 静默登录注册（新用户自动送 200 积分）
    login({})
      .then(user => {
        uni.setStorageSync('h5_user', user)
      })
      .catch(() => {
        // 网关未配置时静默失败，页面调用时会给出明确提示
      })
  }
}
</script>

<style>
/* 全局样式（与小程序版保持同一设计规范：主色 #1677FF / 背景 #F5F7FA / 卡片圆角 16rpx） */
page {
  background-color: #F5F7FA;
  color: #1F2329;
  font-size: 28rpx;
  line-height: 1.6;
}

.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  margin: 0 24rpx 24rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(31, 45, 61, 0.05);
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: 500;
  box-sizing: border-box;
}
.btn-primary {
  background: linear-gradient(135deg, #1677FF 0%, #3D8EFF 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 20rpx rgba(22, 119, 255, 0.28);
}
.btn-ghost {
  background: #E8F3FF;
  color: #1677FF;
}
.btn-plain {
  background: #FFFFFF;
  color: #1677FF;
  border: 2rpx solid #1677FF;
}
.btn-disabled {
  opacity: 0.45;
}
.bar-btn {
  flex: 1;
  margin: 0 10rpx;
}
.bar-btn:first-child {
  margin-left: 0;
}
.bar-btn:last-child {
  margin-right: 0;
}

.form-item {
  display: flex;
  align-items: center;
  padding: 26rpx 4rpx;
  border-bottom: 1rpx solid #F2F3F5;
}
.form-item:last-child {
  border-bottom: none;
}
.form-label {
  width: 168rpx;
  flex-shrink: 0;
  font-size: 28rpx;
  color: #1F2329;
}
.form-value {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 28rpx;
  color: #1F2329;
  text-align: right;
}
.form-placeholder {
  color: #C9CDD4;
}
.form-arrow {
  width: 14rpx;
  height: 14rpx;
  margin-left: 12rpx;
  border-top: 3rpx solid #C9CDD4;
  border-right: 3rpx solid #C9CDD4;
  transform: rotate(45deg);
  flex-shrink: 0;
}
.form-textarea {
  width: 100%;
  height: 168rpx;
  margin-top: 12rpx;
  padding: 20rpx;
  background: #F7F8FA;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}
.form-tip {
  padding: 8rpx 4rpx 0;
  font-size: 24rpx;
  color: #86909C;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
}
.tag-blue {
  background: #E8F3FF;
  color: #1677FF;
}
.tag-green {
  background: #E8FFEA;
  color: #00B42A;
}
.tag-orange {
  background: #FFF3E8;
  color: #FF7D00;
}
.tag-gray {
  background: #F2F3F5;
  color: #86909C;
}

.section-title {
  display: flex;
  align-items: center;
  margin: 36rpx 24rpx 20rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #1F2329;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx 28rpx;
  margin: 0 16rpx 16rpx 0;
  border-radius: 32rpx;
  background: #F2F3F5;
  color: #4E5969;
  font-size: 26rpx;
  border: 2rpx solid transparent;
  box-sizing: border-box;
}
.chip-active {
  background: #E8F3FF;
  color: #1677FF;
  border-color: #1677FF;
}

.content-text {
  font-size: 27rpx;
  color: #4E5969;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
}
.text-secondary {
  font-size: 24rpx;
  color: #86909C;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 0 100rpx;
  color: #86909C;
  font-size: 26rpx;
}
.empty-icon {
  font-size: 88rpx;
  margin-bottom: 20rpx;
}

.fixed-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  padding: 16rpx 24rpx;
  background: #FFFFFF;
  box-shadow: 0 -4rpx 16rpx rgba(31, 45, 61, 0.06);
}
.has-fixed-bar {
  padding-bottom: 200rpx;
}
</style>
