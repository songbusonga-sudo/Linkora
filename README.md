# Linkora

简约白色界面的三码收款卡制作工具。Next.js 16、React 19、TypeScript、Canvas + SVG、ZXing、QRBTF A1/A2、SQLite。

## 本地运行

要求 Node.js 24.18+、npm、Python 3.11+（仅 PSD 准备阶段需要）。

```powershell
npm ci
python -m pip install -r scripts/requirements.txt
python scripts/inspect-psd.py "你的模板.psd"
python scripts/prepare-template.py "你的模板.psd"
# 将授权字体复制到 public/private-assets/template.ttf
npm run admin:setup
npm run dev
```

打开 `http://localhost:3000`；管理员入口 `http://localhost:3000/admin`。随机管理员密码保存在 `.local/admin-access.txt`，散列保存在 `.env.local`。脚本不会覆盖已存在的管理员配置。收款截图和前台上传的图片不上传服务器、不保存到 localStorage；关闭或刷新页面会丢失当前编辑，浏览器会在支持时提示。

第一版的 PSD 提取脚本专门映射已确认的模板结构，**不支持任意 PSD 自动转换**。仓库不包含私人模板和字体；首次运行需要提供授权素材。缺少素材时前台显示暂无模板，不会用虚构模板代替。`data/seed.json` 仅在空数据库初始化时导入，之后模板编辑、发布和历史恢复在后台完成。重新提取素材不会改写历史版本数据库。

## 已实现

- 四步制作：选模板、三个码上传、内容/样式编辑、检查并下载。
- 微信、支付宝完整截图本地识别；A1/A1C/A1P、A2/A2C 独立参数；确定性随机图形；美化与导出结果内容一致性检查。
- 赞赏码启发式定位、方形取景微调、原码缩放、PSD 覆盖层；需要人工确认取景和覆盖安全。
- 主头像裁切、背景纵向取景、最多 12 字署名；可开放文本、图层选项和保留透明度的颜色叠加；RGB、选择器、图片和预览吸色、浏览器屏幕取色。
- 2048 原尺寸预览、4096 PNG 导出，共用 Canvas 渲染器；导出后的实际 PNG 再次识别微信和支付宝内容。
- 管理员登录、服务端会话、密码散列、登录限流、同源检查；模板复制、草稿、选项、素材、权限、发布、历史快照及恢复；乐观并发保护。
- 桌面并排、手机上下排列；未指定可选图层和颜色权限保持锁定。

## 验证

```powershell
npm run typecheck
npm test
npm run build
# 本地服务运行后，使用安装的 Chrome 执行端到端测试
node scripts/qa.mjs
```

`tests/core.test.ts` 检查三码必填、赞赏码限制、固定布局约束、随机渲染一致性、不可变快照和并发写保护。`scripts/qa.mjs` 使用合成支付内容（不执行真实收款），检查桌面/手机界面、截图识别、裁切、署名上限、高清导出、后台鉴权、跨站拦截。截图和测试导出保存在 `.local/qa`，不进入仓库。

## 发布前需要完成

- 用用户自己的真实微信、支付宝及赞赏截图进行 App 扫码测试；普通二维码解码成功不等于真实收款已经验证。
- 赞赏码自动定位为启发式建议，必须人工复核；中心和右下覆盖范围沿用 PSD，尚不能保证适用于所有赞赏码截图。
- PSD 中的部分隐藏头像、图标有旧坐标，尚未获得切换/改色清单，故没有自动开放。
- 默认本地种子版本用于预览和验收。后续发布要求管理员勾选 PSD 与覆盖检查完成。不要把本地种子状态当作生产验收通过。
- 提供授权素材，确认字体和图片的分发权。管理员素材库中的“可公开分发”是人工权限记录，不会自动把素材加入仓库。
- 生产服务使用 HTTPS，设置 `APP_ORIGIN` 为准确域名（同时用于同源检查和 Secure Cookie）；持久化 `data` 与已授权的模板资源。SQLite 适合单机持久化部署，不适合无持久卷的 serverless 实例。更换端口时同步修改 `APP_ORIGIN`。
- 密码轮换：生成新盐和 scrypt 散列，修改 `ADMIN_PASSWORD_HASH` 并清除 sessions 表后重启；勿向日志输出密码或密钥。
- 构建对应源码并保留许可证：`npm run source:bundle`。部署 `.local/linkora-source.zip`，通过 `/api/source` 提供；可用 `LINKORA_SOURCE_ARCHIVE` 指定路径。

## License

代码使用 GPL-3.0-only。QRBTF 的来源和修改说明见 `THIRD_PARTY_NOTICES.md`。PSD、字体及私人素材单独授权，不随仓库分发。
