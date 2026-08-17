// loading-ai.js - 全屏 AI 生成加载动画组件
// 用法：<loading-ai show="{{generating}}" text="AI正在备课中..." subText="正在调用豆包大模型，请稍候..." />
Component({
  properties: {
    // 是否显示
    show: {
      type: Boolean,
      value: false
    },
    // 主文案
    text: {
      type: String,
      value: 'AI正在备课中...'
    },
    // 副文案
    subText: {
      type: String,
      value: '正在调用豆包大模型，请稍候...'
    }
  },
  methods: {
    // 空函数：拦截触摸事件，防止 loading 期间页面滚动
    noop() {}
  }
})
