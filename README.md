# AI 视频摘要助手

本期实现范围是本地自用的视频解析下载 MVP：粘贴公开视频链接，解析视频信息，选择原视频 / 4K / 1080P / 720P / 音频后交给浏览器下载。

暂不包含 AI 总结、账号、会员、数据库、多用户队列或公网部署安全策略。

抖音链接会优先走实验性专用解析链路；如果平台返回风控、加密参数缺失或媒体地址不可用，会给出明确错误提示，不承诺稳定绕过平台限制。

## 文档入口

- `docs/PRD.md`：产品愿景和长期功能范围。
- `docs/需求分析.md`：当前阶段需求边界、竞品观察、平台限制和后续扩展方向。
- `docs/方案设计.md`：当前工程架构、接口、部署演进和给后续 AI 的开发提示。
- `docs/B站解析接入记录.md`：B 站解析技术取舍、接入方式、清晰度限制和排障记录。
- `DESIGN/DESIGN.md`、`DESIGN/首页.html`：首页设计参考。

## 前置依赖

- Python 3.11+
- Node.js 20+
- ffmpeg

## 启动后端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

后端默认运行在 `http://127.0.0.1:8000`。

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://127.0.0.1:5173`，并通过 Vite 代理访问 `/api` 后端接口。

## 接口

- `POST /api/videos/parse`：解析公开视频链接，返回视频基础信息和可用下载档位。
- `GET /api/videos/download?url=...&quality=1080p`：按指定档位下载，浏览器以附件形式保存文件。

## 说明

- 只处理公开可访问视频，不读取 Cookie，不支持登录或会员内容。
- B 站公开视频优先走本项目内置网页解析链路，读取页面公开播放信息后下载并合并音视频。
- 其他平台下载能力由 `yt-dlp` 提供，支持平台范围以当前安装版本为准。
- 高画质音视频合并和音频导出依赖 `ffmpeg`。
