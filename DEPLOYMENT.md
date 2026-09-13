# Linkora 服务器部署

目标：`ubuntu@62.234.114.47`，正式网址 `https://linkora.mizki.online`，另保留 IP 的 `8082` 访问。Nginx 转发至本机 `18082`，systemd 服务名 `linkora`，运行用户 `linkora`，专用 Node.js 24 位于 `/opt/linkora/node`。

在这个项目里说“部署最新版本到服务器”，助手执行：

```powershell
python scripts/deploy.py
```

本机需要 Node/npm、Python 和 paramiko。脚本使用 `~/.ssh/codex_tencent_deploy` 及 `~/.ssh/known_hosts` 中已确认的主机密钥。私钥保留在本机，不进项目，不需要再次发送服务器密码。换电脑需先配置 SSH 密钥。

脚本复制当前工作目录（包括尚未提交的界面改动和私有素材），在 `.local/deploy/时间戳` 中运行类型检查、测试、生产构建，然后上传，安装 Linux 依赖并切换版本。不会影响本地开发服务器。打包白名单排除环境文件、SSH 密钥和本地管理密码。构建目录包含素材，请勿公开上传。

首次部署迁移 SQLite 在线备份及素材，清除本地会话，转换 Windows 素材路径。后台登录密码沿用 `.local/admin-access.txt` 中的本地后台密码，服务器只保存密码哈希。以后只更新代码和内置素材，保留服务器后台的数据、用户上传素材和登录配置。

持久数据：`/opt/linkora/shared/data`；环境配置：`/opt/linkora/shared/app.env`；版本：`/opt/linkora/releases`；数据库备份：`/opt/linkora/backups`。部署前备份数据库，启动失败自动切回上一代码版本。此回退不恢复数据库；以后若引入破坏性数据迁移，需要单独设计恢复流程。版本和备份暂不自动清理。

查看服务：`sudo systemctl status linkora`；查看日志：`sudo journalctl -u linkora -n 100 --no-pager`。外网还需腾讯云轻量服务器防火墙放行 TCP 8082。

2026-09-13 部署记录：当前版本 `20260913-010134` 已启动并配置开机自启；公网 8082 已验证连通，首页、后台、模板、图标和源码下载接口均返回 200。后台登录和 16 个上传素材验证通过。此版本也移除了导出时的二维码识别拦截，用户界面和后台默认展示编辑器共用直接下载逻辑。以后可执行 `python scripts/deploy.py --check-only` 单独检查公网状态。

网站：<https://linkora.mizki.online>；后台：<https://linkora.mizki.online/admin>。后台请使用 HTTPS 域名登录，`APP_ORIGIN` 已设为该域名，登录 cookie 使用 Secure。

域名的 A 记录为 `62.234.114.47`。独立 Nginx 配置 `/etc/nginx/sites-available/linkora-domain` 负责 80/443，HTTP 自动跳转 HTTPS；日常部署脚本不覆盖此文件。Let's Encrypt 证书路径 `/etc/letsencrypt/live/linkora.mizki.online/`，`certbot.timer` 已启用自动续期。首次证书到期日为 2026-12-11。需保持域名解析和公网 TCP 80/443 可用，供访问及续期验证。重建服务器时需先恢复此域名配置和证书，再运行部署脚本。

公网浏览器验收已完成：未上传任何收款码可进入第二、三步，中英文为单选，高清 PNG 可直接下载。服务器已启用字体、脚本和接口的 gzip 压缩。首次加载仍需下载模板图片和字体，速度受服务器带宽影响。
