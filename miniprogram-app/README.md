# AI备课助手（微信小程序）

面向全学科教师的智能备课工具，基于 **微信云开发** + **火山引擎方舟平台**（DeepSeek 文本 + 豆包生图）。

核心功能：

- 📝 **一键生成教案** —— 输入学科/年级/课题/教材，AI 生成 8 大模块完整教案（教材分析、学情分析、教学目标、重难点、教学准备、教学过程、板书设计、反思预设）
- 📽️ **一键生成完整课件（10-50 页）** —— 按教材知识点生成每页要点 + 配图建议 + 动画建议 + **教师讲解词**，内置 6 种课件模板（标准结构/探究式/情境导入/大单元教学/项目式学习/复习课），可自定义补充要求
- 🎨 **课件大纲 + AI 封面图** —— 快速生成逐页大纲，还能用豆包生图模型生成课件封面
- ✍️ **一键生成分层习题** —— 基础巩固 / 能力提升 / 拓展创新三层出题，每题含答案解析
- 📊 **学情诊断** —— 输入测验分与常见错误，AI 生成 5 维度知识掌握雷达图 + 薄弱点 + 分层教学建议
- 📖 **单词本 / ✏️ 错题本** —— 手动记录或 AI 按主题批量生成单词表；错题可一键生成 3 道变式巩固题
- 🗓️ **每日小提示 + 我的课表** —— 首页按天轮换备课技巧，可编辑每周课表，首页展示今日课程

配套能力：微信一键登录注册、积分计费（每次 AI 调用扣积分）、兑换码充值、全量教材库（人教版/沪科版/北师大版等 200+ 本）、备课库、收藏、分享海报。

## 一、项目结构

```
ai-lesson-prep-assistant/
├── README.md                     # 本文档
├── project.config.json           # 微信开发者工具项目配置（已填 appid）
└── miniprogram/
    ├── app.js / app.json / app.wxss   # 小程序入口（含静默登录）与全局配置
    ├── sitemap.json
    ├── images/                   # TabBar 图标
    ├── pages/
    │   ├── index/                # 首页：7 快捷入口 + 每日小提示 + 今日课表 + 热门课题 + 最近备课
    │   ├── lesson-plan/          # 智能备课：表单(学科年级联动教材) → AI 教案 → 8 折叠模块
    │   ├── ppt-outline/          # 课件大纲：课题 + 页数 + 风格 → 逐页大纲 + 封面图
    │   ├── courseware/           # AI课件：10-50 页完整课件 + 6 种模板 + 讲解词
    │   ├── exercises/            # 分层习题：三层 Tab 切换 + 答案解析
    │   ├── analysis/             # 学情诊断：雷达图（canvas）+ 薄弱点 + 建议
    │   ├── words/                # 单词本：手动添加 + AI 批量生成
    │   ├── mistakes/             # 错题本：记录错题 + AI 变式题
    │   ├── library/              # 备课库：Tab 分类 + 搜索 + 左滑删除
    │   ├── detail/               # 通用详情：重新生成/复制/收藏/分享海报
    │   ├── recharge/             # 充值中心：余额 + 兑换码 + 套餐 + 积分明细
    │   └── profile/              # 我的：资料/余额/统计 + 课表 + 收藏 + 提醒 + 帮助
    ├── components/
    │   ├── collapsible-section/  # 折叠面板组件
    │   ├── radar-chart/          # 原生 Canvas 雷达图组件
    │   └── loading-ai/           # 全屏 AI 加载动画组件
    ├── utils/
    │   ├── constants.js          # 全局常量（集合名/积分规则/套餐/每日小提示）
    │   ├── api.js                # 云函数与云数据库统一封装
    │   └── prompt.js             # AI 提示词引擎（课件 Skill：模板化提示词体系）
    └── cloudfunctions/           # 云函数（本项目 cloudfunctionRoot 指向此处）
        ├── generateLessonPlan/   # 生成教案（DeepSeek，30积分）
        ├── generatePPTOutline/   # 生成课件大纲（DeepSeek，15积分）
        ├── generateCourseware/   # 生成完整课件10-50页（DeepSeek，40积分）
        ├── generateExercises/    # 生成分层习题（DeepSeek，20积分）
        ├── analyzeStudentProfile/# 学情诊断（DeepSeek，30积分）
        ├── getInspiration/       # 热门课题推荐（DeepSeek，免费）
        ├── generateImage/        # 生成课件封面图（豆包生图，25积分）
        ├── generateWords/        # 生成单词表（DeepSeek，10积分）
        ├── generateVariants/     # 生成错题变式题（DeepSeek，10积分）
        ├── login/                # 微信一键登录注册（新用户送200积分）
        ├── redeemCode/           # 兑换码充值
        ├── getWallet/            # 钱包：余额 + 积分明细
        ├── getTextbooks/         # 教材库（全量矩阵 200+ 本，首次自动播种）
        ├── generateSlideImages/  # 批量生成课件逐页配图（豆包生图，25积分/张）
        ├── exportPPTX/           # 导出真正的 PPTX 文件（pptxgenjs+动画注入，20积分）
        ├── generateLectureScript/# 生成说课稿（DeepSeek，15积分）
        ├── generateCloze/        # 生成随堂挖空练习（DeepSeek，15积分）
        └── getUserStats/         # 备课统计（读云数据库）
```

> 说明：本项目将 `cloudfunctionRoot` 指向 `miniprogram/cloudfunctions/`，微信开发者工具会自动把该目录排除在小程序包之外，不影响包体积与部署。

## 一·五、AI 课件的「真 PPT」能力

「AI课件」页生成的不是文字大纲，而是一套**图文并茂、可直接上课**的课件：

1. **6 步教研流程生成**：单元整体分析（课标+教材+学情+重难点）→ 可检测教学目标 → 统摄全课的大问题+任务链（含时长）→ 环节过渡语+3 组分​层评价语 → 分层作业+主副板书 → 逐页课件与配图提示词，全部存入「教学研究包」。
2. **教学模式 × 视觉风格双轴**（参考 ppt-master 设计体系）：6 种课件模板（标准结构/探究式/情境导入/大单元/项目式/复习课）× 6 种视觉风格（清新现代/黑板手绘/卡通可爱/极简学术/国风水墨/科技蓝），任意组合；每页「单页单断言」，标题写成"本页学什么"陈述句。
3. **逐页 AI 配图**：每页都带有豆包生图可用的配图提示词（页面主题/视觉元素/排版布局/风格要求），一键批量生成 16:9 页面插画，风格与所选视觉风格一致。
4. **全屏放映模式（小动画体验）**：点「▶ 全屏放映」即可像 PowerPoint 一样全屏翻页讲课；配图自带 Ken Burns 缓慢运镜、翻页入场动画，还能「▶ 自动播放」5 秒/页自动翻页，像看小视频。
5. **导出真正的 PPTX 文件（有图有动画）**：点「📥 导出PPTX」云端用 pptxgenjs 生成 .pptx——封面装饰、主题色条、页码胶囊、嵌入 AI 配图（无图页自动画风占位，杜绝"只剩文字"），再注入每页淡入切换与元素依次入场动画；下载后可用 PowerPoint/WPS 打开继续编辑或直接放映；导出配色跟随所选视觉风格。
6. **说课稿 + 随堂挖空练习**：「🎤 说课稿」基于教研包生成 8 节规范说课稿（说教材/学情/目标/重难点/教法学法/过程/板书/反思），可复制/存入知识库；「✍️ 随堂练习」从课件内容自动出 5 道挖空填空 + 2 道选择题（含答案解析），课件与题库联动。
7. **科研板块**：「提示词宝典」页内置 6 套可复制的教师提示词模板；「个人知识库」页可收藏教研笔记、提示词与学科资料。

## 二、火山引擎方舟平台接入

### 1. 注册并开通模型

1. 访问 [火山引擎方舟控制台](https://console.volcengine.com/ark) 注册/登录账号（新用户有免费额度）。
2. 进入「开通管理」，开通以下模型：
   - **DeepSeek 文本模型**（如 DeepSeek-V3 / DeepSeek-R1，用于教案、课件、习题、学情诊断、课题推荐）
   - **豆包生图模型**（如 `doubao-seedream-3-0-t2i`，用于课件封面图）

### 2. 创建推理接入点（Endpoint）

> ⚠️ **重点**：调用 API 时 `model` 参数必须填 **Endpoint ID**（形如 `ep-2026xxxxxxxx-xxxxx`），**不是**模型名。

1. 方舟控制台 → 「在线推理」→「创建推理接入点」。
2. 为 DeepSeek 文本模型创建接入点 → 对应配置 `ARK_ENDPOINT_ID_TEXT`。
3. 为豆包生图模型创建接入点 → 对应配置 `ARK_ENDPOINT_ID_IMAGE`。

### 3. 获取 API Key

方舟控制台 → 「API Key 管理」→「创建 API Key」→ 对应配置 `ARK_API_KEY`。

### 4. 填写密钥（仓库不含真实密钥，需自行创建）

本仓库出于安全考虑**不包含** `env.local.js`（真实密钥已 gitignore）。使用前：

1. 把仓库根目录的 `env.local.example.js` 复制到每个 AI 云函数目录（如 `miniprogram/cloudfunctions/generateLessonPlan/`），改名为 `env.local.js`，格式：

```js
module.exports = {
  ARK_API_KEY: 'ark-xxxxxxxx',          // 方舟 API Key
  ARK_ENDPOINT_ID_TEXT: 'ep-xxxxx',     // DeepSeek 文本接入点
  ARK_ENDPOINT_ID_IMAGE: 'ep-xxxxx',    // 豆包生图接入点
  ARK_ENDPOINT_ID_VIDEO: 'ep-xxxxx'     // 豆包视频接入点（可选）
}
```

2. 密钥读取优先级：**云函数环境变量 > env.local.js**。推荐正式部署时在云开发控制台为每个函数配置同名环境变量（更安全，改密钥不用重新上传函数）。`getUserStats / login / redeemCode / getWallet / getTextbooks / h5gateway` 不需要密钥。

> 🔒 **安全提醒**：`env.local.js` 严禁提交到公开仓库（仓库已配 .gitignore）。若密钥曾在聊天/群聊中明文出现，请视为已泄露，尽快到方舟控制台重新生成 API Key 并替换。

## 三、微信开发者工具部署

### 1. 导入项目

1. 下载安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版）。
2. 「导入项目」选择本仓库根目录（包含 `project.config.json`，appid 已填好）。
3. 在 `miniprogram/utils/constants.js` 中把 `CLOUD_ENV_ID` 填上你的云环境 ID（只有一个环境可留空使用默认环境）。

### 2. 开通云开发并创建数据库集合

1. 开发者工具工具栏点击「云开发」→ 开通 → 创建环境（如 `ai-lesson-prep`），记录环境 ID。
2. 云开发控制台 →「数据库」→ 创建以下 **12 个集合**（权限均选择「仅创建者可读写」）：

| 集合名 | 用途 | 主要字段 |
| --- | --- | --- |
| `lesson_plans` | 教案 | subject/grade/topic/textbook/hours/lessonType/content/createTime |
| `ppt_outlines` | 课件大纲 | topic/pages/style/coverFileId/content/createTime |
| `coursewares` | AI 完整课件 | subject/grade/textbook/topic/pages/template/content/createTime |
| `exercises` | 习题集 | subject/grade/knowledge/questionTypes/content/createTime |
| `analysis` | 学情诊断 | subject/grade/topic/score/errors/content/createTime |
| `users` | 用户（自动注册） | _openid/nickname/avatarFileID/balance/totalRecharge/totalConsume |
| `transactions` | 积分流水 | _openid/type(recharge|consume)/credits/remark/createTime |
| `redeem_codes` | 兑换码 | code/credits/used/usedBy/usedAt |
| `textbooks` | 教材库（200+ 本） | subject/bookName/publisher/stage/sort（首次调用自动播种） |
| `api_logs` | API 调用日志 | func/tokens/success/message/createTime（云函数自动写入） |
| `user_stats` | 用户统计 | 预留（统计由云函数实时汇总计算） |
| `orders` | 充值订单 | 预留（微信支付企业主体后启用） |

### 3. 部署云函数

1. 在开发者工具左侧文件树中展开 `miniprogram/cloudfunctions/`。
2. 对 **16 个函数**逐个右键 →「上传并部署：云端安装依赖」（会自动安装 axios 与 wx-server-sdk；exportPPTX 会安装 pptxgenjs）。
3. **重要**：云开发控制台 → 云函数 → 将各 AI 函数的**超时时间**调大：`generateLessonPlan/generatePPTOutline/generateExercises/analyzeStudentProfile/getInspiration` → 20 秒；`generateCourseware` → 60 秒；`generateImage` → 60 秒；`generateSlideImages` → 60 秒；`generateWords/generateVariants/exportPPTX` → 30 秒（默认 3 秒会直接超时），内存建议 256MB。

### 4. 配置兑换码（充值用）

个人主体小程序无法开通微信支付，本项目充值走**兑换码**。在云开发控制台 → 数据库 → `redeem_codes` 集合中手动添加记录即可：

```json
{ "code": "VIP2024", "credits": 600, "used": false }
```

添加后，用户在「充值中心」输入 `VIP2024` 即可获得 600 积分。你可以在后台随时添加/作废兑换码（把 used 改为 true）。

### 5. 运行

编译小程序：启动时自动静默登录注册（新用户送 200 积分），首页点击任意入口即可体验。AI 生成期间会显示「AI正在备课中...」全屏动画，首次调用约需 10~30 秒（50 页课件约 1-2 分钟）。

## 四、积分计费体系

| 功能 | 云函数 | 模型 | 消耗积分 |
| --- | --- | --- | --- |
| 生成教案 | generateLessonPlan | DeepSeek（文本接入点） | 30 |
| 学情诊断 | analyzeStudentProfile | DeepSeek（文本接入点） | 30 |
| 生成完整课件(10-50页) | generateCourseware | DeepSeek（文本接入点） | 40 |
| 生成课件大纲 | generatePPTOutline | DeepSeek（文本接入点） | 15 |
| 生成分层习题 | generateExercises | DeepSeek（文本接入点） | 20 |
| 生成课件封面图 | generateImage | 豆包生图接入点 | 25 |
| 生成课件单页配图 | generateSlideImages | 豆包生图接入点 | 25/张 |
| 生成课件开场视频 | generateVideoTask/queryVideoTask | 豆包视频接入点 | 120 |
| 导出 PPTX 文件 | exportPPTX | 无（pptxgenjs） | 20 |
| 生成单词表 | generateWords | DeepSeek（文本接入点） | 10 |
| 生成错题变式题 | generateVariants | DeepSeek（文本接入点） | 10 |
| 热门课题推荐 | getInspiration | DeepSeek（文本接入点） | 免费 |

- 新用户注册自动赠送 **200 积分**（可在 `login` 云函数中调整）。
- 每次 AI 调用前校验余额，余额不足返回 `code: 2`，前端弹窗引导前往充值中心。
- 扣费与流水写入在生成成功后执行；`transactions` 集合保存全部明细，「充值中心」可查看最近 20 条。
- 充值套餐（6元/30元/98元）已内置在页面中；**微信支付需企业主体小程序**，换成企业主体后提供商户号/APIv3 密钥即可接入，个人主体期间请使用兑换码。

## 五、常见问题（FAQ）

**Q1：云函数报「超时」？**
云函数默认超时 3 秒，DeepSeek 生成通常需要 10~30 秒。请在云开发控制台把 AI 函数的超时时间调至 20 秒以上（生图 60 秒）。

**Q2：提示「AI 返回内容不完整，请重试」？**
模型偶发输出截断（受 max_tokens 限制）。点「重新生成」重试即可。

**Q3：提示「未配置环境变量」？**
检查对应云函数目录的 `env.local.js` 是否已填写，或云开发控制台的环境变量是否配置正确，配置后需重新上传部署。

**Q4：调用失败显示 401 / 模型不存在？**
API Key 错误或已失效；「模型不存在」通常说明 `model` 填的不是接入点 ID（`ep-` 开头），或接入点与模型不匹配（文本接口必须用文本接入点，生图接口必须用生图接入点）。

**Q5：提示「积分余额不足」？**
在「我的」→「积分余额」→ 充值中心使用兑换码充值；兑换码由管理员在云数据库 `redeem_codes` 集合中添加。

**Q6：为什么 cloudfunctions 在 miniprogram 目录下？**
本项目 `project.config.json` 把 `cloudfunctionRoot` 指向 `miniprogram/cloudfunctions/`，开发者工具会自动将其排除在小程序包外，部署方式与常规项目完全一致。如想改成根目录，把 `cloudfunctionRoot` 改为 `cloudfunctions/` 并移动目录即可。

**Q7：保存图片到相册失败？**
分享海报的「保存到相册」需要用户授权相册权限，拒绝后可在弹窗中点击去设置开启。

## 六、安全提示

- `ARK_API_KEY` 等密钥只放在云函数环境变量 / `env.local.js`（服务端），禁止写进前端代码；密钥曾明文出现于聊天中时请尽快轮换。
- 云数据库集合权限建议保持「仅创建者可读写」，云函数使用管理员权限读写不受影响。
- 兑换码后台由你手工管理，建议使用随机长码并定期作废已发放的码。
- 本项目为教学演示项目，正式上线前请按需增加内容审核、频率限制与订阅消息提醒。
