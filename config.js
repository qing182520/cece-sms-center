module.exports = {
  port: 3000,
  adminToken: 'admin123',
  haozhuma: {
    serverUrl: 'http://api.haozhuma.com',
    endpoint: '/sms/',
    // ⚠️  首次部署请替换为您在豪猪平台申请的真实 API 凭据
    // 获取方式：登录豪猪接码平台 → 会员中心 → API Key
    apiUser: 'YOUR_API_USER',
    apiPass: 'YOUR_API_PASS',
    // 测测App 在豪猪平台对应的项目 ID
    itemId: '61510'
  }
};
