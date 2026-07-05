// 把结构化报告渲染成可带走的 Markdown。从原 lib/reportMarkdown.ts 移植。
const CONF = { high: '高', medium: '中', low: '低', inferred: '推断' };
const SATURATION = { crowded: '🔴 拥挤', contested: '🟡 竞争', open: '🟢 空白' };
const TMPL = {
  generic: '通用', b2b_saas: 'B2B SaaS', consumer: '消费品', marketplace: '双边市场',
  ai_tool: 'AI 工具/应用', dev_tool: '开发者工具', content_media: '内容/媒体', education: '教育培训',
  ecommerce: '电商/DTC 品牌', fintech: '金融科技', community: '社区/会员订阅', hardware: '硬件/智能设备',
};
const RECO = { go: '建议进入', conditional_go: '有条件进入', no_go: '不建议进入' };
const SIZING = { top_down: '自上而下(大盘拆分)', bottom_up: '自下而上(单价×用户数)', mixed: '混合测算' };
const MATURITY = { education: '教育期', competition: '竞争期', mature: '成熟期' };
const FREQ = { daily: '每天', weekly: '每周', monthly: '每月', occasional: '偶发' };
const LEVEL = { low: '低', medium: '中', high: '高' };

const note = (n) => (n ? `(${n})` : '');
function bullets(title, items) {
  if (!items || !items.length) return [];
  return ['', `### ${title}`, '', ...items.map((i) => `- ${i}`)];
}
function sources(citations) {
  if (!citations || !citations.length) return [];
  return ['', '**来源:**', ...citations.map((c) => `- ${c}`)];
}

const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

// 差异化规格对比矩阵:行=竞品,列=价格/形态/目标人群 + 规格项并集。
// 推断项(confidence=inferred)在值后加「※推断」标记,与查实项视觉隔离(PRD §9.3)。
function specMatrix(competitors) {
  const withSpecs = competitors.filter((c) => c.specs?.length);
  if (!withSpecs.length) return [];
  const specNames = [];
  for (const c of competitors) for (const s of c.specs ?? []) if (!specNames.includes(s.name)) specNames.push(s.name);
  const cols = ['竞品', '直接竞品', '价格', '形态', '目标人群', ...specNames];
  const L = ['', '### 差异化对比矩阵', '', `| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`];
  for (const c of competitors) {
    const byName = new Map((c.specs ?? []).map((s) => [s.name, s]));
    const specCells = specNames.map((n) => {
      const s = byName.get(n);
      if (!s) return '—';
      return cell(s.confidence === 'inferred' ? `${s.value} ※推断` : s.value);
    });
    const row = [
      cell(c.name), c.isDirect ? '✓' : '', cell(c.pricing),
      cell(c.formFactor || '—'), cell(c.targetUser || '—'), ...specCells,
    ];
    L.push(`| ${row.join(' | ')} |`);
  }
  L.push('', '> ※推断 = 非官方查实、从公开信息推断(如竞品内部用料),仅供参考。');
  return L;
}

// 使用场景地图:每个场景的饱和度 + 谁在打;末尾列出缺口(差异化切口候选)。
function scenarioMapSection(s) {
  const L = ['', '## 使用场景地图', '', '| 场景 | 饱和度 | 在打的产品 | 说明 |', '| --- | --- | --- | --- |'];
  for (const sc of s.scenarios)
    L.push(`| ${cell(sc.name)} | ${SATURATION[sc.saturation] ?? sc.saturation} | ${cell(sc.servedBy?.length ? sc.servedBy.join('、') : '—')} | ${cell(sc.note || '—')} |`);
  L.push(...bullets('市场缺口 / 差异化切口候选', s.gaps));
  L.push('', s.summary, ...sources(s.citations));
  return L;
}

function reportToMarkdown(r) {
  const L = [];
  L.push(`# 市场调研报告:${r.productName}`);
  if (r.coreQuestion) L.push(`> 核心问题:${r.coreQuestion}`);
  if (r.industry) L.push(`> 行业:${r.industry}`);

  if (r.meta) {
    L.push('');
    L.push(
      `_数据采集于 ${new Date(r.meta.dataCollectedAt).toLocaleDateString('zh-CN')} · ` +
      `整体置信度 ${CONF[r.meta.overallConfidence]} · ${r.meta.sourcedModuleCount}/${r.meta.moduleCount ?? 4} 模块带来源 · ` +
      `模板 ${TMPL[r.meta.template] ?? r.meta.template} · 方法论 v${r.meta.methodologyVersion}_`
    );
  }

  if (r.conclusion) {
    const c = r.conclusion;
    L.push('', '## 执行摘要', '',
      `**决策:${RECO[c.recommendation ?? 'conditional_go'] ?? c.recommendation} · 机会评分 ${c.score}/100**`,
      '', c.verdict, '', c.summary);
    L.push(...bullets('进入 / 止损条件', c.conditions ?? []));
  }

  if (r.marketSize) {
    const m = r.marketSize;
    L.push('', '## 市场规模与测算', '', `- TAM:${m.tam.value} ${m.tam.unit}${note(m.tam.note)}`,
      `- SAM:${m.sam.value} ${m.sam.unit}${note(m.sam.note)}`,
      `- SOM:${m.som.value} ${m.som.unit}${note(m.som.note)}`,
      '', `测算口径:${SIZING[m.method] ?? m.method ?? '—'}`);
    if (m.maturity) L.push(`市场成熟度:${MATURITY[m.maturity] ?? m.maturity}${note(m.maturityReason)}`);
    L.push(...bullets('关键假设', m.assumptions ?? []));
    L.push('', m.summary, ...sources(m.citations));
  }

  if (r.competitors) {
    L.push('', '## 竞品分析', '', '| 竞品 | 官网 | 月费(USD) | 定价 | 核心功能 | 用户抱怨点 |', '| --- | --- | --- | --- | --- | --- |');
    for (const c of r.competitors.competitors)
      L.push(`| ${c.name} | ${c.website ? `[官网](${c.website})` : '—'} | ${c.monthlyPriceUsd ?? '—'} | ${c.pricing} | ${c.features.join('、')} | ${c.complaints?.length ? c.complaints.join(';') : '—'} |`);
    // 硬件:差异化对比矩阵(规格/形态/目标人群,含推断标注)
    L.push(...specMatrix(r.competitors.competitors));
    // 每个竞品的产品分析(逐条)
    const withAnalysis = r.competitors.competitors.filter((c) => c.productAnalysis);
    if (withAnalysis.length) {
      L.push('', '### 各竞品产品分析');
      for (const c of withAnalysis) L.push('', `**${c.name}** — ${c.productAnalysis}`);
    }
    L.push('', r.competitors.summary, ...sources(r.competitors.citations));
  }

  if (r.userProfile) {
    const u = r.userProfile;
    L.push('', '## 用户画像与需求强度', ...bullets('目标人群', u.segments), ...bullets('核心痛点', u.painPoints),
      ...bullets('现有解决方案', u.existingSolutions));
    const demand = [];
    if (u.painFrequency) demand.push(`- 痛点频率:${FREQ[u.painFrequency] ?? u.painFrequency}`);
    if (u.painSeverity) demand.push(`- 痛点严重程度:${LEVEL[u.painSeverity] ?? u.painSeverity}`);
    if (u.willingnessToPay)
      demand.push(`- 付费意愿:${LEVEL[u.willingnessToPay.signal] ?? u.willingnessToPay.signal}` +
        ` · 价格接受区间 ${u.willingnessToPay.priceRange}${note(u.willingnessToPay.reason)}`);
    if (demand.length) L.push('', '### 需求强度', '', ...demand);
    L.push('', u.summary, ...sources(u.citations));
  }

  if (r.trend) {
    L.push('', '## 搜索趋势', '', `整体走势:${r.trend.direction}`, '', r.trend.growthSummary, ...sources(r.trend.citations));
  }

  if (r.scenarioMap) L.push(...scenarioMapSection(r.scenarioMap));

  if (r.barrier) {
    L.push('', '## 进入壁垒', '', `整体难度:${r.barrier.overallDifficulty}`, '');
    for (const b of r.barrier.barriers) L.push(`- **${b.name}**(${b.difficulty}):${b.description}`);
    L.push('', r.barrier.summary);
  }

  if (r.conclusion) {
    const c = r.conclusion;
    L.push('', '## 结论与建议');
    if (c.factors?.length) {
      L.push('', '### 评分构成(固定权重)', '', '| 维度 | 权重 | 得分 | 理由 |', '| --- | --- | --- | --- |');
      for (const f of c.factors) L.push(`| ${f.name} | ${Math.round(f.weight * 100)}% | ${f.score} | ${f.reason} |`);
    }
    L.push(...bullets('建议进入策略', c.entryStrategy));
    L.push(...bullets('风险提示', c.risks));
  }

  return L.join('\n') + '\n';
}

module.exports = { reportToMarkdown };
