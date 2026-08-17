// env.local.example.js - 云函数密钥配置模板
// 使用方法：
// 1. 复制本文件到每个 AI 云函数目录（如 miniprogram-app/miniprogram/cloudfunctions/generateLessonPlan/）
// 2. 改名为 env.local.js
// 3. 填入你自己的火山方舟配置（本文件已被 .gitignore 排除，真实密钥永远不会被提交）
// 4. 生产环境更推荐：在云开发控制台为每个云函数配置同名环境变量（优先级高于本文件）
//
// 获取方式：https://console.volcengine.com/ark
// - ARK_API_KEY：方舟控制台 → API Key 管理
// - 三个接入点 ID：方舟控制台 → 在线推理 → 创建推理接入点（model 参数必须填接入点 ID，不是模型名）
module.exports = {
  ARK_API_KEY: '',                 // 方舟 API Key（形如 ark-xxxx）
  ARK_ENDPOINT_ID_TEXT: '',        // DeepSeek 文本模型接入点（形如 ep-xxxx）
  ARK_ENDPOINT_ID_IMAGE: '',       // 豆包生图模型接入点（形如 ep-xxxx）
  ARK_ENDPOINT_ID_VIDEO: ''        // 豆包视频模型接入点（形如 ep-xxxx，可选）
}
