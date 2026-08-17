# CHANGELOG · 项目完整历程

> 记录「AI备课助手」从 0 到完整产品的每一次迭代。每个版本都是真实可运行的状态。

---

## v1.0（2026-08）小程序 MVP：四大核心功能
- 微信小程序原生（WXML/WXSS/JS）+ 微信云开发 + 豆包大模型
- 8 个页面：首页 / 智能备课 / 课件大纲 / 分层习题 / 学情诊断 / 备课库 / 详情 / 我的
- 3 个组件：collapsible-section（折叠面板）、radar-chart（Canvas 雷达图）、loading-ai
- 6 个云函数：generateLessonPlan / generatePPTOutline / generateExercises / analyzeStudentProfile / getInspiration / getUserStats
- 教案 8 模块折叠展示、草稿自动保存恢复、复制全文、分享海报（Canvas）

## v1.1（2026-08）商业化底座：登录 + 积分 + 充值
- 微信一键登录注册（新用户送积分）、积分计费（每次 AI 调用扣分）、余额不足引导充值
- 个人主体方案：兑换码充值（redeem_codes）；微信支付路径预留
- 新增云函数：login / redeemCode / getWallet；集合：users / transactions / orders / redeem_codes

## v1.2（2026-08）教师效率工具：教材库 + 单词本 + 错题本 + 课表
- 全量教材库（246 本，13 学科 × 小学/初中/高中 × 多版本），学科+学段联动过滤
- 单词本（AI 批量出词）、错题本（AI 变式题）、我的课表、每日备课小提示
- 新增云函数：getTextbooks / generateWords / generateVariants

## v2.0（2026-08）真 PPT：图文课件 + 放映 + 导出 + 配图
- **AI 一键生成完整课件（10-50 页）**：6 步教研流程（单元分析→目标→大问题任务链→衔接语评价→作业板书→逐页课件）
- 课件模板（探究式/情境导入/大单元/项目式/复习课等）+ 视觉风格（清新/黑板/水墨等）双轴
- 逐页豆包生图配图、全屏放映模式、导出真正 .pptx（pptxgenjs）
- 新增云函数：generateCourseware / generateSlideImages / exportPPTX

## v2.1（2026-08）课前课后闭环：说课稿 + 挖空练习 + 开场视频
- 说课稿（8 节规范结构，可复制/存知识库）
- 课件内容联动题库：随堂挖空/选择题（含答案解析）
- 豆包 seedance 视频模型：课堂开场小动画（异步任务 + 轮询 + 防重复扣费）
- 放映组件升级：Ken Burns 运镜、翻页动画、自动播放（小视频体验）
- 新增云函数：generateLectureScript / generateCloze / generateVideoTask / queryVideoTask

## v2.2（2026-08）导出质量大升级：8 版式引擎 + 动画注入
- 修复导出配图在 WPS 消失的 bug（base64 数据 URI 嵌入）
- 8 种内容版式（封面/章节/概念/分步/对比/例题/练习/小结），AI 每页标注版式类型
- PPTX 动画注入（OOXML timing：每页淡入切换 + 元素依次入场），失败自动回退
- 参考 ppt-master 设计体系：教学模式×视觉风格、单页单断言、设计规范前置

## v3.0（2026-08）H5/App 跨端版
- uni-app（Vue2）重写前端：7 页面，零 wx.* 专属 API（uni.request/uni.setStorageSync 等）
- manifest.json 配置 hash 路由 + ./ 相对路径，可托管任意子目录
- **h5gateway 云函数**（HTTP 触发器）：白名单转发 + CORS + fileID 转 https + H5 直写数据库
- 18 个云函数 userId 兜底补丁（小程序 openid ↔ H5 匿名 userId 双身份）
- 非微信浏览器引导弹窗、PPTX 下载双端兼容
- 可打包安卓 APK（HBuilderX 云打包），附 0 元托管与国内备案部署教程

---

## 里程碑数据

| 指标 | 数值 |
| --- | --- |
| 云函数 | 21 个 |
| 小程序页面 / 组件 | 14 页 + 4 组件 |
| H5 页面 | 7 页 |
| 数据库集合 | 13 个 |
| AI 能力 | DeepSeek 文本 · 豆包生图 · 豆包视频 |
| 版本 | 8 个大版本迭代 |
