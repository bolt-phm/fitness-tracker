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
