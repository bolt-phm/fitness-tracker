# 健身记录与体重追踪系统

这是一个本地运行的网页应用，适合记录每天的体重、饮食和健身房训练数据，并使用 SQLite 数据库存储，方便后续查询和统计。

## 功能

- 每日录入：体重、摄入热量、额外消耗、步数、睡眠、饮水、备注
- 饮食规划：早餐 / 午餐 / 晚餐的计划、实际内容与热量
- 自定义运动模板：新增、编辑、删除运动种类，并为每种运动配置参数
- 训练明细：每天可添加多条运动记录，每条记录都支持动态参数
- 统计查询：自选时间范围查看趋势、汇总和运动占比
- 目标提醒：目标过激时自动提醒风险
- 今日摘要复制：方便把当天数据发给我做分析
- 标准格式导入：支持粘贴 `FITNESS_TRACKER_V1` 数据块自动填充到表单

## 运行方式

```powershell
python app.py
```

启动后打开 [http://127.0.0.1:8000](http://127.0.0.1:8000)

## 仅初始化数据库

```powershell
python app.py --init-only
```

## 当前预置目标

- 起始体重：84 kg
- 身高：1.71 m
- 默认目标体重：64 kg
- 默认周期：60 天

你后续可以直接在页面顶部修改目标参数。

## 主要文件

- 页面：[index.html](E:\Desktop\GPT_project\tizhong\index.html)
- 样式：[styles.css](E:\Desktop\GPT_project\tizhong\styles.css)
- 前端逻辑：[app.js](E:\Desktop\GPT_project\tizhong\app.js)
- 后端入口：[app.py](E:\Desktop\GPT_project\tizhong\app.py)

## 交换接口

为了方便后续部署到服务器，标准格式的导出和导入都已经下沉到接口：

- `POST /api/exchange/export`
  - 请求体：`{"record": {...当前表单数据...}}`
  - 返回：可直接发给 AI 的 `text`，以及结构化 `payload`
- `GET /api/exchange/export?date=2026-03-18`
  - 按日期导出已保存记录
- `POST /api/exchange/import`
  - 请求体：`{"text":"...FITNESS_TRACKER_V1_BEGIN ... FITNESS_TRACKER_V1_END...", "save": false}`
  - 如果传 `save: true`，会在服务端直接入库

这意味着以后不管是网页、移动端还是服务端脚本，都可以直接复用同一套协议。

## 服务器自动对齐

为了后续升级方便，服务端已经补上了基于 Git 提交版本的“远端对齐”能力。这个方案不依赖文件修改时间，而是严格比较本地提交和远端分支提交，更适合正式部署。

### 需要配置的环境变量

```powershell
$env:FITNESS_ADMIN_TOKEN="换成你自己的管理口令"
$env:FITNESS_GIT_REMOTE="origin"
$env:FITNESS_GIT_BRANCH="master"
$env:FITNESS_ALLOW_SELF_UPDATE="true"
$env:FITNESS_ALLOW_SELF_RESTART="false"
```

可选自动巡检：

```powershell
$env:FITNESS_AUTO_SYNC_ENABLED="true"
$env:FITNESS_AUTO_SYNC_INTERVAL_SECONDS="300"
$env:FITNESS_AUTO_SYNC_APPLY="true"
$env:FITNESS_AUTO_SYNC_RESTART="false"
```

### 管理接口

- `GET /api/admin/git/status?refresh=1`
  - 需要请求头：`Authorization: Bearer <FITNESS_ADMIN_TOKEN>`
  - 返回本地提交、远端提交、ahead/behind、是否有更新、是否可 fast-forward
- `POST /api/admin/git/update`
  - 需要请求头：`Authorization: Bearer <FITNESS_ADMIN_TOKEN>`
  - 请求体可以传：`{"restart": false}`
  - 会先 `fetch`，再在“工作区干净且可 fast-forward”时自动更新服务器代码

### 命令行方式

如果你不想走 HTTP，也可以直接在服务器命令行执行：

```powershell
python app.py --git-sync-status --refresh-remote
python app.py --git-sync-update
```

### 认证说明

- 管理接口的身份验证使用 `FITNESS_ADMIN_TOKEN`
- GitHub 仓库拉取权限仍然由服务器本机的 Git 凭据负责，比如 SSH key 或 PAT
- 建议服务器部署时使用 SSH key 连接 GitHub，这样自动更新时不需要人工输入密码
- 如果希望“拉到新代码后立刻生效”，建议配合 `systemd` / `supervisor` / Docker 重启策略，或者启用 `FITNESS_ALLOW_SELF_RESTART=true`

## Cloud Handoff Files

For cloud deployment and cloud-agent handoff, also read:

- `PROJECT_CONTEXT.md`
- `AI_PROTOCOL.md`
- `DEPLOYMENT.md`
- `.env.example`
- `OPENCLAW_PROMPT.md`

## Read-Only Share API

If you want an external assistant to read your current day safely, prefer the read-only share API instead of exposing admin routes:

- `GET /api/share/context?date=YYYY-MM-DD&token=<FITNESS_SHARE_TOKEN>`

This endpoint is designed for safe external reading of:

- current daily record
- profile summary
- recent stats
- AI export text and payload
