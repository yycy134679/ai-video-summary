# AGENTS.md

## 项目概览

这是“AI 视频摘要助手”的本地自用 MVP。当前实现范围是公开视频解析与浏览器直接下载，不包含 AI 总结、账号、会员、数据库、多用户队列或公网部署安全策略。

- 后端：`FastAPI + yt-dlp + httpx + ffmpeg`，入口在 `backend/app/main.py`；抖音和 B 站有专用 Provider。
- 前端：`React + Vite + TypeScript + Tailwind CSS v4 + lucide-react`，入口在 `frontend/src/App.tsx`。
- 存储：无数据库；下载文件使用临时目录，请求结束后清理。
- 关键文档：`README.md`、`docs/PRD.md`、`docs/需求分析.md`、`docs/方案设计.md`、`docs/B站解析接入记录.md`、`DESIGN/DESIGN.md`、`DESIGN/首页.html`。

继续开发前先阅读 `README.md` 和 `docs/方案设计.md`；涉及 B 站解析、清晰度、封面或第三方解析 API 取舍时读取 `docs/B站解析接入记录.md`；涉及产品边界或视觉改动时再读取 PRD、需求分析和设计稿。

## 本地环境

需要本机已有：

- Python 3.11+
- Node.js 20+
- ffmpeg

后端依赖安装：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

前端依赖安装：

```bash
cd frontend
npm install
```

## 开发命令

从仓库根目录启动后端：

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload
```

后端默认地址是 `http://127.0.0.1:8000`，健康检查是：

```bash
curl http://127.0.0.1:8000/api/health
```

启动前端：

```bash
cd frontend
npm run dev
```

前端默认地址是 `http://127.0.0.1:5173`，Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。

生产构建前端：

```bash
cd frontend
npm run build
```

预览前端构建：

```bash
cd frontend
npm run preview
```

## 测试与验证

后端最小测试：

```bash
.venv/bin/python -m pytest backend/tests
```

前端最小验证：

```bash
cd frontend
npm run build
```

前端界面或下载流程改动后，尽量同时启动前后端并用浏览器验证主流程：

1. 打开 `http://127.0.0.1:5173`。
2. 粘贴公开视频链接。
3. 确认解析结果、可用档位、错误提示和下载触发行为符合预期。

修复 bug 时优先补充或更新 `backend/tests` 中能覆盖该问题的测试。当前没有前端单元测试框架；前端改动至少运行 `npm run build`。

## 代码结构

- `backend/app/main.py`：FastAPI 应用、CORS、接口路由和 HTTP 错误映射。
- `backend/app/models.py`：Pydantic 请求、响应和下载档位模型。
- `backend/app/video_service.py`：Provider 调度、URL 校验、档位构建入口。
- `backend/app/providers/`：平台 Provider。抖音优先走 `douyin_provider.py`，B 站优先走 `bilibili_provider.py`，其他平台走 `yt_dlp_provider.py`。
- `backend/tests/test_video_service.py`：后端核心服务、Provider 调度和平台解析辅助函数测试。
- `frontend/src/api.ts`：前端 API 调用、下载流读取和文件名解析。
- `frontend/src/types.ts`：前端类型。
- `frontend/src/App.tsx`：首页和下载主流程。
- `frontend/src/App.css`：当前主要样式文件，已引入 Tailwind CSS v4。

## 开发约定

- 默认使用简体中文回复、写文档和提交信息。
- 修改后端共享逻辑前先确认 Provider 调用关系，避免只改单个平台导致统一接口行为不一致。
- 新增平台能力优先封装为 Provider；站点解析优先复用 `yt-dlp`，只有在目标站点有明确、可维护的公开页面数据来源时才补专用解析链路。
- 抖音专用链路是实验能力，不承诺稳定绕过风控或一定无水印。
- B 站专用链路只复用公开视频页和公开播放地址接口中的匿名可访问数据，不读取 Cookie，不承诺登录、会员、地区限制、风控或高画质权限。
- B 站 `source` 档位表示“当前匿名访问下最高可用 MP4”，不等于原站所有权限下的最高画质。
- B 站字幕只处理匿名可访问的公开字幕；字幕不存在、需要登录或字幕接口失败时，必须降级为字幕不可用状态，不要让视频解析失败。
- B 站 DASH 分离流需要用 `ffmpeg` 合并；普通 MP4 `durl` 流包含音频时不要再强制合并音频。
- B 站封面图在本地前端加载时可能因 Referer 被 CDN 拒绝；前端封面 `<img>` 应保留 `referrerPolicy="no-referrer"`，不要改回默认 Referer 策略。
- 遇到 B 站 412、登录、会员、地区限制、风控等问题，应返回清晰中文错误，不要承诺代码必然绕过平台限制。
- 不默认接入第三方视频解析 API；如需引入，必须封装为独立 Provider、默认关闭，并说明隐私、稳定性和安全边界。
- 前端视觉继续贴近 `DESIGN/首页.html` 的蓝白 SaaS 风格；不要为小改动大规模重写稳定 UI。
- 当前样式主要在 `App.css`，新增局部组件可以逐步使用 Tailwind utility class，但避免无关的全局样式重排。
- 使用 `lucide-react` 提供图标，避免手写重复 SVG。
- 新增依赖前先确认必要性，优先使用已有依赖和标准库。

## 安全边界

- 只处理公开可访问的 `http` / `https` 视频链接。
- 不读取浏览器 Cookie，不新增普通用户 Cookie 输入框，不在日志或错误中打印 Cookie、Authorization、令牌或其他敏感信息。
- 公网部署前必须补齐认证、限流、SSRF 防护、任务队列、文件大小和时长限制、临时文件生命周期、资源隔离和可观测日志。
- 不要直接把当前同步下载接口暴露为公网多用户服务。
- 下载相关改动要注意临时目录清理，避免残留大文件。

## Git 工作流

- 开发前先运行 `git status --short`。
- 如有未提交改动，不要擅自覆盖、回滚或整理；需要改同一文件时先理解现有改动。
- 当前在 `main` 且任务不是低风险小改动时，先从 `main` 创建独立分支。
- 不使用 `git reset --hard`、`git checkout -- <file>`、强制覆盖或强制推送，除非用户明确要求。
- 提交信息使用中文 Conventional Commits，并包含标题和正文。

## 交付前检查

根据改动范围选择最小必要验证：

- 后端逻辑：`.venv/bin/python -m pytest backend/tests`
- 前端类型或界面：`cd frontend && npm run build`
- 接口联调或下载流程：启动前后端后用浏览器验证主流程

最终回复需要说明：改了什么、运行了哪些验证、当前分支、是否还有未提交改动。
