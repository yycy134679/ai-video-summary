import type { FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Globe2,
  Languages,
  Link,
  Loader2,
  LockKeyhole,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Zap
} from "lucide-react";

import { summaryStyles } from "../../constants/summary";
import type { SummaryStyle } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";

type HomePageProps = {
  url: string;
  style: SummaryStyle;
  customPrompt: string;
  error: string;
  notice: string;
  partialErrors: string[];
  isRunning: boolean;
  onUrlChange: (value: string) => void;
  onStyleChange: (value: SummaryStyle) => void;
  onCustomPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const heroBenefits = [
  { icon: <CheckCircle2 size={18} />, title: "准确提炼重点", text: "AI 精准识别核心内容" },
  { icon: <Clock3 size={18} />, title: "节省大量时间", text: "最快 1 分钟获取总结" },
  { icon: <Languages size={18} />, title: "多语言支持", text: "支持多平台字幕与转写" },
  { icon: <ShieldCheck size={18} />, title: "安全 & 隐私保护", text: "不保存你的视频内容" }
];

const featureCards = [
  { icon: <Zap size={24} />, title: "超高准确率", text: "基于字幕优先和 ASR 兜底链路，尽量保留视频语义和章节脉络。" },
  { icon: <TimerReset size={24} />, title: "极速总结", text: "把长视频压缩成可阅读摘要、章节要点和可追问上下文。" },
  { icon: <FileText size={24} />, title: "多格式输出", text: "摘要、原文稿、思维导图和 Markdown 复制，覆盖学习和工作整理。" },
  { icon: <Bot size={24} />, title: "持续进化", text: "保留可扩展的 Provider、STT、SSE 和问答会话边界。" }
];

const useCases = ["在线课程", "发布会", "访谈播客", "竞品视频", "研究资料", "会议回看"];

const plans = [
  {
    name: "免费版",
    price: "¥ 0",
    suffix: "/ 永久免费",
    button: "立即开始",
    featured: false,
    features: ["每月 3 个视频总结", "单视频最长 30 分钟", "基础总结功能", "标准清晰度"]
  },
  {
    name: "专业版",
    price: "¥ 29",
    suffix: "/ 月",
    button: "立即订阅",
    featured: true,
    features: ["每月 100 个视频总结", "单视频最长 3 小时", "AI 思维导图 & 关键片段", "高清导出 & 多格式支持", "优先处理 & 新功能优先体验"]
  },
  {
    name: "团队版",
    price: "¥ 99",
    suffix: "/ 月起",
    button: "联系销售",
    featured: false,
    features: ["无限视频总结", "团队协作 & 共享", "API 访问", "专属客户支持", "定制化解决方案"]
  }
];

export function HomePage({
  url,
  style,
  customPrompt,
  error,
  notice,
  partialErrors,
  isRunning,
  onUrlChange,
  onStyleChange,
  onCustomPromptChange,
  onSubmit
}: HomePageProps) {
  return (
    <div className="home-page">
      <section className="home-hero" id="hero" aria-labelledby="home-title">
        <div className="hero-orb hero-orb-left" aria-hidden="true" />
        <div className="hero-orb hero-orb-right" aria-hidden="true" />
        <div className="hero-float hero-float-video" aria-hidden="true">
          <Play size={58} fill="currentColor" />
        </div>
        <div className="hero-float hero-float-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="home-container hero-content">
          <div className="upgrade-pill">
            <Rocket size={15} />
            全新升级：DeepSeek V4 驱动，更准确，更智能
          </div>

          <h1 id="home-title">
            AI 视频总结，节省 <span>80%</span> 时间
          </h1>
          <p className="hero-subtitle">
            粘贴视频链接，AI 帮你提炼重点、生成摘要、整理要点
            <br />
            让你不再浪费时间在冗长的视频上
          </p>

          <form className="hero-form" onSubmit={onSubmit}>
            <div className="hero-input-row">
              <Link className="hero-input-icon" size={22} aria-hidden="true" />
              <Input
                id="video-url"
                type="text"
                inputMode="url"
                placeholder="粘贴 YouTube / Bilibili / 腾讯视频 等链接"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                disabled={isRunning}
                aria-label="视频链接"
              />
              <Button type="submit" disabled={isRunning} className="hero-submit">
                {isRunning ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
                {isRunning ? "生成中" : "开始总结"}
                {!isRunning ? <ArrowRight size={18} aria-hidden="true" /> : null}
              </Button>
            </div>
            <p className="platform-note">
              <Check size={15} aria-hidden="true" />
              支持 YouTube、Bilibili、腾讯视频、爱奇艺、优酷等 1000+ 网站
            </p>

            <div className="home-settings">
              <fieldset className="style-selector" disabled={isRunning}>
                <legend>报告输出风格</legend>
                <div className="style-selector-grid">
                  {summaryStyles.map((item) => (
                    <label className={style === item.value ? "style-chip style-chip-active" : "style-chip"} key={item.value}>
                      <input
                        type="radio"
                        name="summary-style"
                        value={item.value}
                        checked={style === item.value}
                        onChange={() => onStyleChange(item.value)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="prompt-field" htmlFor="custom-prompt">
                <span>补充定制指令（可选）</span>
                <Textarea
                  id="custom-prompt"
                  rows={2}
                  maxLength={2000}
                  placeholder="例如：请重点提炼产品策略、风险和可执行建议..."
                  value={customPrompt}
                  onChange={(event) => onCustomPromptChange(event.target.value)}
                  disabled={isRunning}
                />
              </label>
            </div>

            <HomeMessages error={error} notice={notice} partialErrors={partialErrors} />
          </form>

          <div className="hero-benefits" id="features">
            {heroBenefits.map((item) => (
              <article key={item.title}>
                <span>{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>

          <ProductPreview />
        </div>
      </section>

      <section className="trust-strip" aria-label="用户信任背书">
        <div className="home-container trust-inner">
          <div>
            <strong>深受全球用户信赖</strong>
            <span>用户来自 180+ 国家和地区</span>
          </div>
          <span>Google</span>
          <span>Microsoft</span>
          <span>Stanford University</span>
          <span>Nike</span>
          <span>IBM</span>
          <span>ByteDance</span>
        </div>
      </section>

      <section className="why-section" aria-labelledby="why-title">
        <div className="home-container">
          <h2 id="why-title">
            为什么选择 <span>VideoSummarize AI?</span>
          </h2>
          <div className="feature-grid">
            {featureCards.map((item) => (
              <Card className="feature-card" key={item.title}>
                <span className="feature-icon">{item.icon}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="use-case-section" id="use-cases" aria-labelledby="use-case-title">
        <div className="home-container use-case-card">
          <div>
            <p className="section-kicker">使用场景</p>
            <h2 id="use-case-title">把长视频变成随时可复用的知识资产</h2>
            <p>课程、访谈、发布会、播客和竞品视频，都可以转成摘要、脑图和可追问上下文。</p>
          </div>
          <div className="use-case-tags">
            {useCases.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-home-section" id="pricing" aria-labelledby="pricing-title">
        <div className="home-container">
          <div className="pricing-heading">
            <h2 id="pricing-title">选择适合你的方案</h2>
            <p>所有付费计划均支持 7 天无理由退款</p>
          </div>
          <div className="pricing-card-grid">
            {plans.map((plan) => (
              <Card className={plan.featured ? "price-card price-card-featured" : "price-card"} key={plan.name}>
                {plan.featured ? <span className="popular-badge">最受欢迎</span> : null}
                <h3>{plan.name}</h3>
                <div className="price-line">
                  <strong>{plan.price}</strong>
                  <span>{plan.suffix}</span>
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant={plan.featured ? "primary" : "secondary"}
                  className="price-button"
                  onClick={(event) => event.currentTarget.blur()}
                >
                  {plan.button}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="content-placeholder-section" id="blog" aria-labelledby="blog-title">
        <div className="home-container placeholder-card">
          <Globe2 size={22} aria-hidden="true" />
          <div>
            <h2 id="blog-title">博客</h2>
            <p>这里保留为静态锚点，后续可承载使用教程、平台支持说明和模型更新记录。</p>
          </div>
        </div>
      </section>

      <section className="content-placeholder-section" id="help" aria-labelledby="help-title">
        <div className="home-container placeholder-card">
          <LockKeyhole size={22} aria-hidden="true" />
          <div>
            <h2 id="help-title">帮助中心</h2>
            <p>当前版本聚焦本地 MVP，遇到平台限制、密钥缺失或转写失败时会在页面内显示中文提示。</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductPreview() {
  const chapters = [
    ["00:00", "GPT-4o 发布介绍"],
    ["05:32", "核心能力演示"],
    ["15:47", "开发者工具更新"],
    ["28:11", "实际应用案例"],
    ["45:09", "未来展望与 Q&A"]
  ];
  return (
    <Card className="product-preview" aria-label="模拟产品预览">
      <div className="preview-video-card">
        <div className="preview-meta">
          <span className="avatar-dot" />
          <div>
            <strong>OpenAI DevDay：GPT-4o 时代的到来</strong>
            <p>YouTube · 1:24:32</p>
          </div>
        </div>
        <div className="mock-video-frame">
          <div className="mock-person" />
          <div className="mock-controlbar">
            <span>1:24:32</span>
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="preview-arrow" aria-hidden="true">
        <ArrowRight size={34} />
      </div>

      <div className="preview-result-card">
        <div className="preview-tabs" aria-hidden="true">
          <span className="active">AI 总结</span>
          <span>思维导图</span>
          <span>字幕</span>
          <span>智能问答</span>
        </div>
        <div className="preview-columns preview-columns-single">
          <div>
            <h3>核心要点</h3>
            <ul className="bullet-list">
              <li>GPT-4o 是一个全新的多模态模型，具备更强的理解和生成能力</li>
              <li>响应速度提升 2 倍，支持实时语音和视觉输入</li>
              <li>在多语言、推理、代码等任务上实现显著提升</li>
              <li>将更广泛地应用于产品和开发者生态</li>
            </ul>
            <h3>章节速览</h3>
            <div className="chapter-list">
              {chapters.map(([time, title]) => (
                <div key={time}>
                  <time>{time}</time>
                  <span>{title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function HomeMessages({
  error,
  notice,
  partialErrors
}: {
  error: string;
  notice: string;
  partialErrors: string[];
}) {
  return (
    <div className="home-message-stack" aria-live="polite">
      {error ? (
        <div className="home-message home-message-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="home-message home-message-info" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}
      {partialErrors.map((item) => (
        <div className="home-message home-message-warning" role="status" key={item}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
