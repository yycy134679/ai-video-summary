const zhCN = {
  // Tab labels
  tabs: {
    summary: "智能总结",
    mindmap: "思维导图",
    transcript: "原文稿",
    qa: "问答",
  },
  // Button labels
  buttons: {
    startSummary: "开始总结",
    generating: "生成中",
    copySummary: "复制总结",
    reAnalyze: "重新分析",
    backToHome: "返回首页",
    send: "发送",
    exportSvg: "导出 SVG",
    exportPng: "导出 PNG",
    copyTranscript: "复制原文",
    refreshPage: "刷新页面",
    freeTrial: "免费试用",
    login: "登录",
    startNow: "立即开始",
    subscribe: "立即订阅",
    contactSales: "联系销售",
  },
  // Empty states
  empty: {
    mindmap: "思维导图生成后会显示在这里。",
    transcript: "原文稿生成后会显示在这里。",
    qaWaiting: "摘要完成后会自动开启基于文稿的临时问答。",
    qaReady: "问答会依据当前视频文稿回答，不会联网搜索。",
    summaryLoading: "完成后摘要会自动显示在这里。",
    noReport: "没有可恢复的分析报告",
    noReportHint: "当前版本不保存历史记录，刷新或直接访问总结页时不会恢复上一次的结果。",
    noReportAction: "请从首页重新开始总结",
  },
  // Loading states
  loading: {
    mindmap: "正在生成思维导图...",
    transcript: "正在获取视频文稿...",
    qaPreparing: "AI 分析完成后将自动开启问答功能",
    summaryProgress: "智能总结处理中",
    typing: "正在继续生成",
    aiAnswering: "正在生成回答...",
  },
  // Stages
  stages: {
    parseVideo: "解析视频",
    transcribe: "视频转写",
    aiAnalysis: "AI 分析中",
    prepareQa: "准备问答",
    complete: "完成",
  },
  // Status / Errors
  status: {
    summaryDone: "视频总结已生成。",
    emptyUrl: "请先粘贴一个公开视频链接。",
    invalidUrl: "请输入有效的公开视频链接，仅支持 http 或 https 地址。",
    summaryFailed: "视频总结失败，请检查链接后重试。",
    qaFailed: "问答请求失败，请稍后重试。",
    clipboardFailed: "当前浏览器不支持自动复制，请手动选中文本复制。",
    copySuccess: "Markdown 总结已复制。",
    transcriptCopied: "原文稿已复制。",
  },
  // Navigation
  nav: {
    features: "功能",
    useCases: "使用场景",
    pricing: "定价",
    blog: "博客",
    help: "帮助中心",
    mainNav: "主导航",
    mobileNav: "移动端导航",
    openNav: "打开导航菜单",
    closeNav: "关闭导航菜单",
  },
  // Header
  header: {
    brand: "VideoSummarize AI",
    reportEyebrow: "视频智能分析报告",
    generatingReport: "正在生成分析报告",
  },
  // Section labels
  sections: {
    oneSentence: "一句话总结",
    reportStyle: "报告输出风格",
    customPrompt: "补充定制指令（可选）",
    customPromptPlaceholder: "例如：请重点提炼产品策略、风险和可执行建议...",
    videoSource: "公开字幕",
    videoSourceAsr: "StepAudio ASR",
  },
  // Misc
  misc: {
    appError: "应用遇到了意外错误，请尝试刷新页面。",
    appErrorTitle: "出错了",
    qaPlaceholder: "围绕当前视频文稿继续提问",
    qaLabel: "输入你的问题",
    urlPlaceholder: "粘贴 YouTube / Bilibili / 腾讯视频 等链接",
    urlLabel: "视频链接",
  },
};

export default zhCN;
