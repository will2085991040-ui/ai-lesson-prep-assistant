// config.js - H5/App 版网关配置
// ============================================================
// 【部署前必改】把 GATEWAY_URL 换成你自己的云开发 HTTP 触发地址：
//   云开发控制台 → 云函数 → h5gateway → 开启「HTTP 触发」
//   得到的地址形如：https://{你的云环境ID}.service.tcloudbase.com/h5gateway
// ============================================================
export default {
  GATEWAY_URL: 'https://YOUR-ENV-ID.service.tcloudbase.com/h5gateway'
}
