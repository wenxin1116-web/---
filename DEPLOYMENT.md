# DEERMA ICONS V1.0.3 部署说明

## GitHub Pages

1. 将源码上传到 GitHub 仓库的 `main` 分支。
2. 在仓库 `Settings > Pages` 中，将 Source 设置为 `GitHub Actions`。
3. 打开 `Actions`，等待 `Deploy GitHub Pages` 工作流完成。

GitHub Pages 是纯静态托管，因此支持图标浏览、搜索、复制和下载，但不支持本项目的管理员登录 API。当前源码内置图标数量为 0。

## 完整管理员功能

管理员登录、上传、分类管理和删除功能需要支持 Next.js/Node.js 服务端 API 的部署平台。部署前设置：

```env
DEERMA_ADMIN_USERNAME=admin
DEERMA_ADMIN_PASSWORD=请替换为强密码
DEERMA_AUTH_SECRET=请替换为长随机字符串
```

当前管理员上传的数据保存在浏览器 `localStorage`，不会自动同步到其他电脑，也不会写入 GitHub 源码。正式多人使用需要接入数据库和对象存储。

## 本地运行

```bash
npm install
npm run dev
```
