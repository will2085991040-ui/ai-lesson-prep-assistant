// slide-viewer.js - 全屏课件放映组件（小视频/小动画体验）
// 用法：<slide-viewer show="{{showViewer}}" slides="{{slides}}" title="{{viewTitle}}" bind:close="onCloseViewer" />
// 每张幻灯片需含 title/content/speakerNotes，可选 imageFileID（配图）
Component({
  properties: {
    // 是否全屏放映
    show: {
      type: Boolean,
      value: false
    },
    // 幻灯片数组
    slides: {
      type: Array,
      value: []
    },
    // 放映标题（顶部栏左侧展示）
    title: {
      type: String,
      value: ''
    }
  },
  data: {
    current: 0,         // 当前页下标（swiper current）
    notesVisible: false, // 是否显示讲解词面板（全局）
    playing: false,      // 是否自动播放（小视频感）
    autoTimer: null,     // 自动播放定时器句柄
    progressPct: 0       // 底部进度条百分比（JS 预计算）
  },
  observers: {
    // 每次打开放映时：回到第 1 页、收起讲解词、停止自动播放；
    // 关闭放映时：清理自动播放定时器
    'show'(show) {
      this.clearAutoTimer()
      if (show) {
        this.setData({ current: 0, notesVisible: false, playing: false })
        this.syncProgress()
      } else {
        this.setData({ playing: false })
      }
    }
  },
  lifetimes: {
    // 组件销毁时清理自动播放定时器，防止内存泄漏
    detached() {
      this.clearAutoTimer()
    }
  },
  methods: {
    // 计算底部进度条百分比并同步到 data：(当前页+1)/总页数*100
    syncProgress() {
      const len = this.data.slides.length
      const pct = len ? Math.round(((this.data.current + 1) / len) * 100) : 0
      this.setData({ progressPct: pct })
    },
    // 清理自动播放定时器（幂等）
    clearAutoTimer() {
      if (this.data.autoTimer) {
        clearInterval(this.data.autoTimer)
        this.setData({ autoTimer: null })
      }
    },
    // swiper 翻页（用户手动滑动后不清除定时器，继续自动播放）
    onSwiperChange(e) {
      this.setData({ current: e.detail.current })
      this.syncProgress()
    },
    // 切换自动播放：开启 5 秒/页循环（最后一页后回到第 1 页），暂停则清理定时器
    onTogglePlay() {
      if (this.data.playing) {
        this.clearAutoTimer()
        this.setData({ playing: false })
      } else {
        this.setData({ playing: true })
        const timer = setInterval(() => {
          this.next()
        }, 5000)
        this.setData({ autoTimer: timer })
      }
    },
    // 下一页（circular 循环，到最后一页后回到第 1 页）
    next() {
      const len = this.data.slides.length
      if (!len) return
      this.setData({ current: (this.data.current + 1) % len })
      this.syncProgress()
    },
    // 上一页（circular 循环）
    onPrev() {
      const len = this.data.slides.length
      if (!len) return
      this.setData({ current: (this.data.current - 1 + len) % len })
      this.syncProgress()
    },
    // 下一页（circular 循环）
    onNext() {
      this.next()
    },
    // 切换讲解词面板显示/隐藏
    onToggleNotes() {
      this.setData({ notesVisible: !this.data.notesVisible })
    },
    // 退出放映
    onClose() {
      this.triggerEvent('close')
    },
    // 空函数：拦截触摸，防止全屏遮罩下的页面滚动穿透
    noop() {}
  }
})
