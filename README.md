# 普陀区科技社团互动云展（1+N+X）

> TCSP - Technology Club Project Showcase

首版目标：
- 页面展示保持 `1+N+X` 结构
- 提供教师友好的网页版数据收集器（中文字段、自动推荐 ID、必填校验）
- 收集器支持身份验证与分权：教师仅维护本人社团，管理员全量维护
- 支持即时发布（刷新后生效）
- 提供基础校验、前端容错、每日备份与回滚
- 支持素材目录模板导出（按权限生成 `成果ID_成果名称` 目录结构）

## 快速开始

1. 准备数据源（在线表格 CSV 导出链接，或本地 `data/*.csv`）
2. 修改 `src/config.js`
3. 启动一体化服务（推荐，含自动发布 API）：

```bash
node scripts/portal_server.mjs
```

4. 访问：`http://localhost:8090/src/`
5. 教师数据收集器：`http://localhost:8090/src/collector.html`
6. 自动发布接口：`http://localhost:8090/api/publish`

如仅需静态预览，也可继续使用：

```bash
python3 -m http.server 8080
```

但此模式下“自动发布”按钮不可用（因为没有 API 服务）。

## macOS / Linux 一键部署（推荐）

本项目后端为 Node.js 脚本，无数据库依赖。  
生产/局域网部署最低要求：
- `Node.js >= 18`（建议 20 LTS）
- `npm`（随 Node 安装）
- `git`
- `tar` 命令（用于数据迁移包导出/导入）

### 1) 一键启动（首次部署）

在服务器（macOS 或 Linux）终端执行：

```bash
git clone https://github.com/luanhaitao/TCSP.git
cd TCSP
node -v
npm -v
npm run serve:portal
```

启动成功后访问：
- 首页：`http://<服务器IP>:8090/src/`
- 教师收集器：`http://<服务器IP>:8090/src/collector.html`

如果是本机测试，直接访问：
- `http://localhost:8090/src/`

### 2) 一键后台运行（可关闭终端）

```bash
cd TCSP
nohup npm run serve:portal > portal.log 2>&1 &
```

查看运行状态：

```bash
ps -axo pid,command | grep "portal_server.mjs" | grep -v grep
curl -s http://localhost:8090/api/health
```

停止服务：

```bash
pkill -f "portal_server.mjs"
```

### 3) 防火墙与端口

- 默认端口：`8090`
- 若局域网终端无法访问，请放通服务器 `8090` 端口。
- 启动命令可自定义端口（示例 `9000`）：

```bash
PORT=9000 npm run serve:portal
```

### 4) 更新部署（拉取最新代码）

```bash
cd TCSP
git pull
pkill -f "portal_server.mjs"
nohup npm run serve:portal > portal.log 2>&1 &
```

注意：
- 只要更新涉及 `scripts/portal_server.mjs`（新增/修改 API），就必须重启服务后才会生效。
- 若页面仍表现为旧功能，请先强制刷新浏览器（macOS: `Cmd + Shift + R`）。

### 4.1) 旧机器 -> 新机器 一键迁移（强烈推荐）

用途：避免“代码更新了但封面/素材丢失”。  
迁移包会打包：
- `data/`（三张表数据）
- `uploads/`（教师上传的封面、图片、视频、PDF）

在旧机器执行（导出）：

```bash
cd TCSP
npm run migrate:export
```

成功后会生成：`backup/migrations/tcsp_migration_<时间戳>.tar.gz`

把这个 `.tar.gz` 文件拷贝到新机器项目目录后，在新机器执行（导入）：

```bash
cd TCSP
npm run migrate:import -- backup/migrations/tcsp_migration_2026-xx-xxTxx-xx-xx-xxxZ.tar.gz
```

导入完成后重启服务：

```bash
pkill -f "portal_server.mjs"
nohup npm run serve:portal > portal.log 2>&1 &
```

### 5) 可选：开机自启

仓库已内置模板：
- macOS：`deploy/macos/com.tcsp.portal.plist.template`
- Linux：`deploy/linux/tcsp-portal.service.template`

macOS（launchd）：

```bash
cd TCSP
PROJECT_DIR="$(pwd)"
mkdir -p ~/Library/LaunchAgents
sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" deploy/macos/com.tcsp.portal.plist.template > ~/Library/LaunchAgents/com.tcsp.portal.plist
launchctl unload ~/Library/LaunchAgents/com.tcsp.portal.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.tcsp.portal.plist
launchctl start com.tcsp.portal
launchctl list | grep com.tcsp.portal
```

Linux（systemd）：

```bash
cd TCSP
PROJECT_DIR="$(pwd)"
RUN_USER="$(whoami)"
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" -e "s|__RUN_USER__|$RUN_USER|g" deploy/linux/tcsp-portal.service.template | sudo tee /etc/systemd/system/tcsp-portal.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now tcsp-portal
sudo systemctl status tcsp-portal --no-pager
```

查看日志：

```bash
# macOS
tail -f portal.launchd.log

# Linux
sudo journalctl -u tcsp-portal -f
```

## 页面入口
- 云展首页（1+N+X）：`/src/index.html`
- 教师数据收集器：`/src/collector.html`

## 教师数据收集器（推荐给非技术教师）

功能说明：
- 全字段中文标签与提示，必填项红星标注
- 自动推荐 ID：`Cxxx`（社团）/ `Axxx`（成果）/ `Mxxx`（素材）
- 自动填写更新时间，学员姓名由教师填写，可填写多人姓名或小组名
- 草稿本地保存（浏览器 localStorage）
- 支持模板下载、一键导入社团/成果数据
- 支持本地素材直传（服务器本地存储，自动回填 URL）
- 支持素材目录一键导入（`成果ID_成果名称` 目录规则）
- 支持多次选择多个素材目录后一次性导入
- 支持导出“素材目录结构模板”（ZIP），自动按登录权限生成目录
- 目录导入支持选择“总目录”或“单个成果目录”，并自动忽略 `.DS_Store` 等系统文件

权限规则：
- 教师登录：仅可查看/维护本人社团范围内数据；“所属社团”下拉仅显示本人社团；成果导入、素材目录导入会自动校验并拦截越权记录。
- 超级管理员登录：可查看/维护全量数据，不受社团范围限制。

建议使用流程：
1. 点击“读取当前基础数据”
2. 社团信息可先“下载社团导入模板”，批量填写后“一键导入社团”
3. 学员成果可“下载成果导入模板”，批量填写后“一键导入成果”
4. 按顺序补充录入：素材绑定
   - 可直接“选择素材根目录 -> 开始一键导入素材目录”
   - 目录规则：`成果ID_成果名称`（例如 `A001_智能红绿灯`）
   - 互动网页成果：在对应成果目录根部放入 `index.html`，系统会整体上传网页目录并生成 1 条“互动网页”素材
   - 也可在“新增学员成果”点击“导出素材目录结构”，先生成目录模板再分发给教师
5. 点击“保存到草稿库”
6. 点击“一键自动发布（推荐）”
7. 发布成功后系统自动合并数据并生成备份快照
8. 如 API 暂不可用，再用“导出三张 CSV”作为备用流程

## 统一素材上传方案（局域网本地存储，推荐）

当前默认方案：上传到服务器 Mac 本机目录 `uploads/`，无第三方网盘依赖。

管理员配置（默认已就绪）：
1. 在 `src/config.js` 保持：

```js
auth: {
  enabled: true,
  adminNames: ['科技组管理员']
},
assetUpload: {
  enabled: true,
  provider: 'local',
  local: {
    apiUrl: '/api/upload',
    htmlFolderApiUrl: '/api/upload-html-folder',
    maxSizeMb: 300
  }
}
```

认证与权限说明：
- 收集器页面先输入姓名登录（`/src/collector.html`）。
- 超级管理员姓名由 `src/config.js -> auth.adminNames` 配置（免密）。
- 普通教师姓名需与 `club_profile.teacher` 完全一致，且仅可维护其名下社团数据。
- `/api/upload`、`/api/upload-html-folder`、`/api/publish` 需要登录后才能调用。

局域网部署注意：
- `publish.apiUrl` 建议使用相对路径 `'/api/publish'`（不要写 `http://localhost:8090/api/publish`）。
- 原因：教师从其他终端访问时，`localhost` 指向教师自己的电脑，不是服务器。

配置完成后，教师在收集器中只需：
- 选择本地文件
- 点击“上传并填入链接”
- 系统自动把 URL 写入表单字段

素材目录一键导入支持：
- 图片：`jpg/png/gif/webp`
- 视频：`mp4/mov/webm`
- 文档：`pdf`
- 互动网页：目录根部必须包含 `index.html`

互动网页目录示例：

```text
素材根目录/
  A004_互动编程展示/
    index.html
    css/style.css
    js/app.js
    assets/demo.png
```

导入后系统会把 `A004_互动编程展示/` 整体保存到 `uploads/`，生成 `/uploads/.../index.html` 链接；网页内部 CSS、JS、图片不会被拆成普通素材记录。

常见上传问题（含 GIF）：
- 若提示“无法连接本地上传服务”，通常是发布服务未启动或端口不可达。
- 请确认：
  1. 页面通过 `http://<服务器IP>:8090/src/collector.html` 打开（不要 `file://`）。
  2. 服务器已运行 `node scripts/portal_server.mjs`。
  3. 内网可访问 `http://<服务器IP>:8090/api/upload`。

## 数据表
- `club_profile`（社团表）
- `student_artifact`（学员成果表）
- `media_asset`（素材表）

详细字段见 `docs/data_dictionary.md`。

## 数据校验

```bash
node scripts/validate_data.mjs
```

## 备份与回滚

```bash
# 每日快照（建议配合 crontab）
node scripts/backup_snapshot.mjs

# 从快照回滚到 data/
node scripts/restore_snapshot.mjs backup/snapshots/<timestamp>
```

补充说明（教师上传素材备份）：
- 收集器每次调用 `/api/upload` 或 `/api/upload-html-folder` 上传成功后，系统会自动把文件再备份一份到 `backup/uploads/<YYYY-MM>/`。
- 同时写入上传备份日志：`backup/uploads/upload_log.jsonl`。
- 如需人工恢复，可从该目录拷回 `uploads/<YYYY-MM>/` 后刷新页面。

## 文档
- 教师上传与维护详细手册：`docs/教师上传与维护数据操作手册.md`
- 教师数据收集器说明：`docs/教师数据收集器说明.md`
- 数据字典：`docs/data_dictionary.md`
- 运维 Runbook：`docs/ops_runbook.md`
