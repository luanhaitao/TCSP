# 运维 Runbook（备份与回滚）

## 每日备份

```bash
node scripts/backup_snapshot.mjs
```

若在线表格为主源，可使用环境变量直接备份线上数据：

```bash
CLUB_CSV='https://.../club.csv' \
ARTIFACT_CSV='https://.../artifact.csv' \
MEDIA_CSV='https://.../media.csv' \
node scripts/backup_snapshot.mjs
```

## 回滚最近版本

```bash
node scripts/restore_snapshot.mjs backup/snapshots/<timestamp>
```

## crontab 示例（每天 01:30）

```cron
30 1 * * * cd /path/to/repo && node scripts/backup_snapshot.mjs >> backup/cron.log 2>&1
```
