# 普陀区科技社团互动云展（1+N+X）

> TCSP - Technology Club Project Showcase

首版目标：
- 页面展示保持 `1+N+X` 结构
- 教师通过在线表格维护数据（不改代码）
- 提供教师友好的网页版数据收集器（中文字段、自动推荐 ID、必填校验）
- 支持即时发布（刷新后生效）
- 提供基础校验、前端容错、每日备份与回滚

## 快速开始

1. 准备数据源（在线表格 CSV 导出链接，或本地 `data/*.csv`）
2. 修改 `src/config.js`
3. 运行：

```bash
python3 -m http.server 8080
```

4. 访问：`http://localhost:8080/src/`
5. 教师数据收集器：`http://localhost:8080/src/collector.html`

## 页面入口
- 云展首页（1+N+X）：`/src/index.html`
- 教师数据收集器：`/src/collector.html`

## 教师数据收集器（推荐给非技术教师）

功能说明：
- 全字段中文标签与提示，必填项红星标注
- 自动推荐 ID：`Cxxx`（社团）/ `Axxx`（成果）/ `Mxxx`（素材）
- 自动生成学员化名与更新时间
- 草稿本地保存（浏览器 localStorage）
- 一键导出三张 CSV（社团/成果/素材）
- 支持本地素材直传（统一云端存储，自动回填 URL）

建议使用流程：
1. 点击“读取当前基础数据”
2. 按顺序录入：社团信息 -> 学员成果 -> 素材绑定
3. 点击“保存到草稿库”
4. 点击“导出三张 CSV”
5. 提交给科技组导入，或回填到在线表格后在首页“刷新最新数据”

## 统一素材上传方案（推荐）

推荐使用：`Cloudinary` 免费版（统一账号，教师无需网盘）

管理员一次性配置：
1. 注册并登录 Cloudinary
2. 创建一个 `Unsigned Upload Preset`
3. 在 `src/config.js` 设置：

```js
assetUpload: {
  enabled: true,
  provider: 'cloudinary',
  cloudinary: {
    cloudName: '你的云名称',
    uploadPreset: '你的unsigned_preset',
    folder: 'tcsp'
  }
}
```

配置完成后，教师在收集器中只需：
- 选择本地文件
- 点击“上传并填入链接”
- 系统自动把 URL 写入表单字段

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

## 文档
- 教师上传与维护详细手册：`docs/教师上传与维护数据操作手册.md`
- 教师数据收集器说明：`docs/教师数据收集器说明.md`
- 数据字典：`docs/data_dictionary.md`
- 运维 Runbook：`docs/ops_runbook.md`
