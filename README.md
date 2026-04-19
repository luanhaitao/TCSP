# 普陀区科技社团互动云展（1+N+X）

> TCSP - Technology Club Project Showcase

首版目标：
- 页面展示保持 `1+N+X` 结构
- 教师通过在线表格维护数据（不改代码）
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

## 数据表
- `club_profile`（社团表）
- `student_artifact`（学员成果表）
- `media_asset`（素材表）

详细字段见 `docs/data_dictionary.md`。

## 备份与回滚

```bash
# 每日快照（建议配合 crontab）
node scripts/backup_snapshot.mjs

# 从快照回滚到 data/
node scripts/restore_snapshot.mjs backup/snapshots/<timestamp>
```
