# 数据字典（教师维护版）

## 1. 社团表 `club_profile`

| 字段 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `club_id` | 是 | 社团唯一ID，不可重复 | `C001` |
| `club_name` | 是 | 社团名称 | `智能编程社` |
| `teacher` | 是 | 执教教师 | `张老师` |
| `grade_range` | 否 | 面向年级 | `四-六年级` |
| `student_count` | 否 | 学员人数 | `36` |
| `club_category` | 否 | 展馆分类 | `智能编程馆` |
| `intro` | 否 | 社团简介 | `围绕编程思维...` |
| `learned_topics` | 否 | 学了什么（建议分号分隔） | `逻辑;调试;建模` |
| `done_items` | 否 | 做了什么 | `完成XX任务` |
| `highlights` | 否 | 过程亮点 | `两轮迭代优化` |
| `harvest` | 否 | 整体收获 | `协作能力提升` |
| `cover_url` | 否 | 封面图链接（http/https） | `https://...` |
| `status` | 是 | `active` / `archived` | `active` |

## 2. 学员成果表 `student_artifact`

| 字段 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `artifact_id` | 是 | 成果唯一ID | `A001` |
| `student_alias` | 是 | 学员化名 | `小创者01` |
| `grade` | 是 | 年级 | `五年级` |
| `club_id` | 是 | 所属社团ID（需存在） | `C001` |
| `artifact_name` | 是 | 成果名称 | `智能红绿灯控制程序` |
| `artifact_type` | 是 | `作品/任务/探究/表达` | `任务` |
| `keywords` | 否 | 关键词（空格或分号分隔） | `编程 调试` |
| `participation` | 否 | 我的参与内容 | `负责逻辑编写` |
| `artifact_intro` | 否 | 成果简介 | `实现倒计时提示` |
| `one_line_harvest` | 否 | 一句话收获（建议 <=140字） | `学会拆解复杂任务` |
| `growth_evidence` | 否 | 成长证据 | `从报错到稳定运行` |
| `teacher_comment` | 否 | 教师简评 | `调试过程完整` |
| `updated_at` | 否 | 更新时间 | `2026-04-19 10:30:00` |

## 3. 素材表 `media_asset`

| 字段 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `media_id` | 是 | 素材唯一ID | `M001` |
| `owner_type` | 是 | `club` 或 `artifact` | `artifact` |
| `owner_id` | 是 | 所属对象ID | `A001` |
| `media_type` | 是 | `image` 或 `video` | `image` |
| `url` | 是 | 素材链接（http/https） | `https://...` |
| `thumbnail_url` | 否 | 视频缩略图链接 | `https://...` |
| `copyright_status` | 否 | 版权状态 | `学校授权` |
| `notes` | 否 | 备注 | `成果截图` |

## 填写规则
- 建议每行只描述一个对象，不合并单元格。
- 链接必须为 `http` 或 `https`。
- 成果类型严格使用 `作品/任务/探究/表达`。
- 学员使用化名，不填写真实姓名。
