// collapsible-section.js - 折叠面板组件
// 用于教案 8 大模块的展开/收起展示
Component({
  options: {
    multipleSlots: true
  },
  properties: {
    // 模块标题
    title: {
      type: String,
      value: ''
    },
    // 序号徽标（如 01）
    number: {
      type: String,
      value: ''
    },
    // 初始是否展开
    open: {
      type: Boolean,
      value: false
    },
    // 是否显示序号徽标
    showNumber: {
      type: Boolean,
      value: true
    }
  },
  data: {
    isOpen: false
  },
  observers: {
    // 外部修改 open 时同步内部状态
    open(open) {
      this.setData({ isOpen: !!open })
    }
  },
  lifetimes: {
    attached() {
      // 挂载时按初始值设置展开状态
      this.setData({ isOpen: !!this.data.open })
    }
  },
  methods: {
    // 点击标题栏切换展开/收起
    onToggle() {
      const isOpen = !this.data.isOpen
      this.setData({ isOpen })
      this.triggerEvent('toggle', { open: isOpen })
    }
  }
})
