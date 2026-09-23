// 报告分区 AI 改写 —— 「让 AI 按指令重写某个分区」。
//
// 与流水线生成的区别:这里带着「原分区内容 + 全报告摘要 + 用户指令」让模型重写单个分区,
// 输出仍走原 zod schema 校验,保证写回 result 后前端渲染逻辑完全不用变。
//
// 两种改写模式(由模型判定意图后自动选择):
//   新增条目 → 只让模型产出「新条目本身」,追加由代码完成。产出小,不碰原有条目,成功率高。
//   其余改写 → 整个分区重写(改口径/调措辞/改标量字段),配合 repairDropped 兜底防误删。
// 之所以分两条路:让模型把 9 条竞品原样重抄一遍再加一条,它十有八九会漏抄或干脆不加 ——
// 这类机械搬运本就不该交给模型。
//
// 安全边界:本模块只负责「生成 + 校验」,不写库。写回由路由层在用户确认后执行。
const { z } = require('zod');
const { PLANS } = require('../ai/router');
const { reportToMarkdown } = require('./markdown');
const {
  MarketSizeResult, CompetitorResult, UserProfileResult, TrendResult,
  ScenarioMapResult, BarrierResult, ConclusionResult,
} = require('./schemas');

// 可被 AI 改写的分区。key 与 ResearchReport 的字段名一一对应。
// productName / coreQuestion / meta 不在其列:前者是用户输入,后者是系统元信息。
const REVISABLE = {
  marketSize:  { schema: MarketSizeResult,  label: '市场规模' },
  competitors: { schema: CompetitorResult,  label: '竞品分析' },
  userProfile: { schema: UserProfileResult, label: '用户画像' },
  trend:       { schema: TrendResult,       label: '搜索趋势' },
  scenarioMap: { schema: ScenarioMapResult, label: '使用场景地图' },
  barrier:     { schema: BarrierResult,     label: '进入壁垒' },
  conclusion:  { schema: ConclusionResult,  label: '综合结论' },
};

const SECTION_KEYS = Object.keys(REVISABLE);

// 上下文预算:整份报告 markdown 太长会顶爆上下文,截断到这个字符数。
const CONTEXT_MAX = 8000;

/** 整份报告的可读摘要,给模型当背景(超长则截断)。 */
function reportContext(report) {
  let md;
  try {
    md = reportToMarkdown(report);
  } catch {
    md = JSON.stringify(report).slice(0, CONTEXT_MAX);
  }
  return md.length > CONTEXT_MAX ? `${md.slice(0, CONTEXT_MAX)}\n…(报告过长,已截断)` : md;
}

// 条目名可能挂在这些 key 上(竞品/场景/壁垒用 name,趋势用 keyword)。
const NAME_KEYS = ['name', 'keyword', 'title'];
// citations 由模型自报、每次重写都会变,纳入清点只会变成噪音 —— diff 里照样看得见。
const INVENTORY_SKIP = new Set(['citations']);

/**
 * 清点一个分区里的「条目」:字符串数组直接取值,对象数组取 name/keyword/title。
 * 用途有二:写进提示词当「必须保留清单」,以及生成后比对模型有没有偷偷删条目。
 * @returns {{field:string, items:string[]}[]}
 */
function inventory(value) {
  const out = [];
  if (!value || typeof value !== 'object') return out;
  for (const [field, v] of Object.entries(value)) {
    if (INVENTORY_SKIP.has(field) || !Array.isArray(v) || v.length === 0) continue;
    if (typeof v[0] === 'string') {
      out.push({ field, items: v.filter((x) => typeof x === 'string') });
    } else if (v[0] && typeof v[0] === 'object') {
      const key = NAME_KEYS.find((k) => typeof v[0][k] === 'string');
      if (key) out.push({ field, items: v.map((x) => x && x[key]).filter((x) => typeof x === 'string') });
    }
  }
  return out;
}

/** 模型重写后丢掉的条目 —— LLM 常见的「整段重生成顺手删几条」,必须让用户看见。 */
function droppedItems(before, after) {
  const afterMap = new Map(inventory(after).map((e) => [e.field, new Set(e.items)]));
  const warnings = [];
  for (const { field, items } of inventory(before)) {
    const kept = afterMap.get(field) ?? new Set();
    const dropped = items.filter((i) => !kept.has(i));
    if (dropped.length) warnings.push({ field, dropped });
  }
  return warnings;
}

/** 取条目名:字符串数组取自身,对象数组取 name/keyword/title。取不到返回 null。 */
function nameKeyOf(arr) {
  if (typeof arr[0] === 'string') return null;             // null = 元素本身即名字
  if (!arr[0] || typeof arr[0] !== 'object') return undefined; // undefined = 无法识别,跳过
  return NAME_KEYS.find((k) => typeof arr[0][k] === 'string');
}

/**
 * 修补模型误删的条目。
 *
 * 判据:被删条目的名字如果压根没出现在用户指令里,那就是模型重写时手滑,自动补回;
 * 名字在指令里出现过(用户可能就是要删/要合并),则尊重模型输出,只在 warnings 里列出让用户确认。
 * 这样「用户意图」始终是权威,模型的不稳定不会静默吞数据。
 *
 * 补回时按原顺序重建数组:原条目用模型的新版本(若还在)否则用原值,模型新增的条目追加到末尾。
 * 仅在确有误删时才重建,避免撤销模型有意的排序。
 */
function repairDropped(before, after, instruction) {
  if (!before || !after || typeof after !== 'object') return { after, restored: [] };
  const out = { ...after };
  const restored = [];

  for (const [field, origArr] of Object.entries(before)) {
    if (INVENTORY_SKIP.has(field) || !Array.isArray(origArr) || origArr.length === 0) continue;
    const newArr = out[field];
    if (!Array.isArray(newArr)) continue;

    const key = nameKeyOf(origArr);
    if (key === undefined) continue; // 对象数组但没有可识别的名字字段 —— 无法安全比对
    const nameOf = (x) => (key === null ? (typeof x === 'string' ? x : null) : x && x[key]);

    const present = new Set(newArr.map(nameOf).filter(Boolean));
    const missing = origArr.filter((x) => { const n = nameOf(x); return n && !present.has(n); });
    const accidental = missing.filter((x) => !instruction.includes(nameOf(x)));
    if (accidental.length === 0) continue;

    const accidentalNames = new Set(accidental.map(nameOf));
    const byName = new Map(newArr.map((x) => [nameOf(x), x]).filter(([n]) => n));
    // 原顺序:模型改过的用新版,被误删的用原值
    const rebuilt = origArr
      .filter((x) => { const n = nameOf(x); return n && (present.has(n) || accidentalNames.has(n)); })
      .map((x) => byName.get(nameOf(x)) ?? x);
    // 模型真正新增的条目追加到末尾
    const origNames = new Set(origArr.map(nameOf).filter(Boolean));
    rebuilt.push(...newArr.filter((x) => { const n = nameOf(x); return n && !origNames.has(n); }));

    out[field] = rebuilt;
    restored.push({ field, items: accidental.map(nameOf) });
  }

  return { after: out, restored };
}

function buildRevisePrompt(report, section, instruction) {
  const { label } = REVISABLE[section];
  const before = report[section];
  const keep = inventory(before).filter((e) => e.items.length);

  return [
    `你是硬件市场调研分析师。下面是一份已完成的调研报告,现在用户要求你**只重写其中的「${label}」分区**。`,
    '',
    '## 报告背景(供参考,不要整份重写)',
    reportContext(report),
    '',
    `## 「${label}」分区的当前内容(JSON)`,
    before ? JSON.stringify(before, null, 2) : '(该分区当前为空)',
    '',
    // 关键约束:不给清单时,模型会把长数组「重新总结」成三五条,静默丢数据。
    ...(keep.length
      ? [
          '## 条目保留清单(这是输出的**下限**,不是全部)',
          '以下条目在原分区中已存在。除非指令明确要求删除,它们必须一条不少地出现在你的输出里;',
          '如果指令要求新增,则在保留这些条目的基础上继续追加,输出条目数会**多于**下面的数量。',
          ...keep.map(({ field, items }) =>
            `- ${field}(现有 ${items.length} 条):${items.slice(0, 40).join('、')}${items.length > 40 ? ' 等' : ''}`
          ),
          '',
        ]
      : []),
    '## 用户的修改指令',
    instruction,
    '',
    '## 要求',
    `1. 只输出「${label}」这一个分区的完整 JSON 对象,结构与上面「当前内容」完全一致(字段名、层级、类型都不能变)。`,
    '2. 这是**增量修改**,不是重新总结:未被指令涉及的字段和条目一律原样保留,不得删减、不得合并、不得改写措辞。',
    '3. 指令要求新增条目时,必须真的把新条目加进数组(放在原有条目之后),并按同样的字段结构填好;',
    '   此时输出的条目数 = 原有条目数 + 新增条目数,不要只改 summary 而不加条目。',
    '4. 指令要求补充内容时,基于报告背景合理推断;涉及具体价格/规格且无依据时,在 summary 或对应文字里说明是估算,不要编造精确数字。',
    '5. summary 字段要反映改动后的整体判断。',
    '6. 直接输出 JSON,不要任何解释文字或 markdown 围栏。',
  ].join('\n');
}

// ─────────────────────  新增条目模式(只产出新条目,追加交给代码)  ─────────────────────

/** 剥掉 ZodDefault / ZodOptional / ZodNullable 包装,拿到里面的真实类型。 */
function unwrapSchema(s) {
  let cur = s;
  const wrappers = new Set(['ZodDefault', 'ZodOptional', 'ZodNullable']);
  while (cur && cur._def && wrappers.has(cur._def.typeName)) cur = cur._def.innerType;
  return cur;
}

/**
 * 找出分区里那个「对象数组」字段(竞品/场景/壁垒/评分因子/趋势关键词)。
 * 七个分区各自最多只有一个,所以不存在歧义;找不到则返回 null(该分区不支持新增模式)。
 */
function objectArrayField(sectionSchema) {
  const obj = unwrapSchema(sectionSchema);
  const shape = obj && obj.shape;
  if (!shape) return null;
  for (const [field, raw] of Object.entries(shape)) {
    const arr = unwrapSchema(raw);
    if (!arr || !arr._def || arr._def.typeName !== 'ZodArray') continue;
    const element = unwrapSchema(arr.element);
    if (element && element._def && element._def.typeName === 'ZodObject') return { field, element };
  }
  return null;
}

const IntentPlan = z.object({
  addItems: z.boolean(),
  count: z.number().int().min(0).max(10).default(1),
});

/**
 * 判断指令到底是「往数组里加新条目」还是「改已有内容」。
 * 关键词判不了这件事 —— 「给 Vercel 补充一条抱怨」和「补充一家竞品 Scaleway」都含"补充",
 * 前者是改已有条目、后者才是新增,只能让模型读懂语义。输出极小,快且稳。
 */
async function planIntent(reason, { label, field, items, instruction }) {
  const prompt = [
    '判断用户指令的意图,只输出 JSON,不要解释。',
    '',
    `报告分区:「${label}」。该分区有一个数组字段 ${field},当前 ${items.length} 条:${items.slice(0, 40).join('、')}`,
    '',
    `用户指令:${instruction}`,
    '',
    `问题:这条指令是否要求往 ${field} 里**新增原本不存在的条目**?`,
    `- 要求新增(例如"补充一家竞品 X""再加两个场景")→ addItems=true,count=新增条目数(说不清就填 1)。`,
    `- 只是修改/补充**已有条目**的内容(例如"给 X 这条补充一条抱怨")、或调整措辞、口径、总结、评分 → addItems=false,count=0。`,
    '',
    '输出格式:{"addItems": true 或 false, "count": 数字}',
  ].join('\n');
  try {
    return await reason(prompt, IntentPlan);
  } catch {
    return { addItems: false, count: 0 }; // 判不出来就走整体重写,行为与改动前一致
  }
}

/** 只生成新条目 + 更新后的 summary。产出小,模型不需要重抄原有条目。 */
async function generateNewItems(reason, { report, label, field, element, existing, instruction, count }) {
  const names = existing.map((x) => x && (x.name || x.keyword || x.title)).filter(Boolean);
  const schema = z.object({
    items: z.array(element).min(1).max(10),
    summary: z.string().optional(),
  });
  const prompt = [
    `你是硬件市场调研分析师。用户要求在报告的「${label}」分区里新增条目。`,
    '',
    '## 报告背景',
    reportContext(report),
    '',
    `## ${field} 中已有的条目(不要重复,也不要重抄)`,
    names.join('、') || '(暂无)',
    '',
    '## 已有条目的字段结构示例(新条目要完全照这个结构填)',
    existing.length ? JSON.stringify(existing[0], null, 2) : '(无示例,按 schema 填全字段)',
    '',
    '## 用户指令',
    instruction,
    '',
    '## 要求',
    `1. 只输出**新增**的条目,不要包含上面已有的任何条目。预计新增 ${count} 条,以指令为准。`,
    '2. 每条新条目的字段名、层级、类型都要和示例一致,字段填全。',
    '3. 涉及价格/规格且无确切依据时,给合理估算并在文字里标明是估算,不要编造精确数字。',
    '4. summary:把新增内容纳入后、针对整个分区的新总结(会覆盖原 summary)。',
    '5. 直接输出 JSON:{"items":[…],"summary":"…"},不要解释文字或 markdown 围栏。',
  ].join('\n');
  return schema.parse(await reason(prompt, schema));
}

/**
 * 让 AI 生成某分区的新内容。
 *
 * 先判意图:要求新增条目 → 只生成新条目再由代码追加(原有条目零风险);
 * 其余 → 整个分区重写,并用 repairDropped 把模型误删的条目补回。
 * 补回后仍然缺失的条目(名字在指令里出现过 = 可能是用户要求删的)进 warnings,交用户拍板。
 *
 * @returns {Promise<{before:any, after:any, label:string, mode:'append'|'rewrite',
 *                    added:string[],
 *                    warnings:{field:string,dropped:string[]}[],
 *                    restored:{field:string,items:string[]}[]}>}
 */
async function reviseSection(report, section, instruction, plan = 'economy') {
  const entry = REVISABLE[section];
  if (!entry) throw new Error(`不支持改写的分区: ${section}`);
  const reason = (PLANS[plan] || PLANS.economy).reason;
  const before = report[section] ?? null;

  // ── 新增条目模式 ──
  const arrayInfo = objectArrayField(entry.schema);
  const existing = arrayInfo && before && Array.isArray(before[arrayInfo.field]) ? before[arrayInfo.field] : null;
  if (existing && existing.length) {
    const names = existing.map((x) => x && (x.name || x.keyword || x.title)).filter(Boolean);
    const intent = await planIntent(reason, {
      label: entry.label, field: arrayInfo.field, items: names, instruction,
    });
    if (intent.addItems) {
      const gen = await generateNewItems(reason, {
        report, label: entry.label, field: arrayInfo.field, element: arrayInfo.element,
        existing, instruction, count: intent.count || 1,
      });
      // 模型偶尔仍会把已有条目再吐一遍 —— 按名字去重,只留真正的新条目。
      const have = new Set(names);
      const fresh = gen.items.filter((x) => {
        const n = x && (x.name || x.keyword || x.title);
        return n && !have.has(n);
      });
      if (fresh.length) {
        const merged = entry.schema.parse({
          ...before,
          [arrayInfo.field]: [...existing, ...fresh],
          ...(gen.summary ? { summary: gen.summary } : {}),
        });
        return {
          before, after: merged, label: entry.label, mode: 'append',
          added: fresh.map((x) => x.name || x.keyword || x.title),
          warnings: [], restored: [],
        };
      }
      // 一条新条目都没产出 → 退回整体重写,别让用户白等一场
    }
  }

  // ── 整体重写模式 ──
  const raw = await reason(buildRevisePrompt(report, section, instruction), entry.schema);
  const { after: repaired, restored } = repairDropped(before, raw, instruction);
  // 补回条目后仍要过一遍 schema,保证写库的内容始终合法。
  const after = entry.schema.parse(repaired);

  return {
    before, after, label: entry.label, mode: 'rewrite', added: [],
    warnings: droppedItems(before, after), restored,
  };
}

module.exports = {
  REVISABLE, SECTION_KEYS, reviseSection,
  inventory, droppedItems, repairDropped, objectArrayField,
};
