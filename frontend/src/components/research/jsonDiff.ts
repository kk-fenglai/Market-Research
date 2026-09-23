// 报告分区改写的行级 diff —— 把改前/改后的 JSON 美化成文本后按行比对。
// 分区 JSON 一般几十到几百行,LCS 的 O(n·m) 完全够用;超大时降级为「整段替换」。

export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };

const MAX_LINES = 600; // 超过此规模不做逐行比对,避免卡住主线程

/**
 * 按 key 排序后再序列化。模型重写时字段顺序常和原来不同,不做归一化的话
 * 逐行比对会把「只是换了顺序」也算成改动,diff 里满屏红绿,真正的改动反而看不见。
 */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  }, 2);
}

function toLines(v: unknown): string[] {
  if (v == null) return [];
  return stableStringify(v).split('\n');
}

/** 逐行 diff。相同行标 same,仅在旧版出现标 del,仅在新版出现标 add。 */
export function diffJson(before: unknown, after: unknown): DiffLine[] {
  const a = toLines(before);
  const b = toLines(after);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
    else { out.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
}

/** 折叠没有改动的大段,只在变更行上下各留 context 行,中间用 null 表示省略。 */
export function collapseUnchanged(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.type === 'same') return;
    for (let k = idx - context; k <= idx + context; k++) if (k >= 0 && k < lines.length) keep.add(k);
  });
  const out: (DiffLine | null)[] = [];
  let skipping = false;
  lines.forEach((l, idx) => {
    if (keep.has(idx)) { out.push(l); skipping = false; }
    else if (!skipping) { out.push(null); skipping = true; }
  });
  return out;
}

/** 变更统计,用于「+12 / −5」这类摘要。 */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.type === 'add').length,
    removed: lines.filter((l) => l.type === 'del').length,
  };
}
