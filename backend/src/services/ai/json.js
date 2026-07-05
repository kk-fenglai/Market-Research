// 从模型文本输出中提取 JSON 对象。
// 容错链:去 ```json 围栏 / 截取首尾大括号 → 直接 parse → 失败则用 jsonrepair 修复后再 parse。
// LLM 常见问题(字符串内未转义引号/换行、尾逗号、轻微截断)交给 jsonrepair 兜底。
const { jsonrepair } = require('jsonrepair');

function extractJsonObject(text) {
  if (!text || !text.trim()) throw new Error('空响应,无 JSON 可解析');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start === -1) throw new Error('响应中未找到 JSON 对象');
  const end = s.lastIndexOf('}');
  // 有闭合大括号则取首尾之间;被截断(无 '}')则取从 '{' 到结尾,交给 jsonrepair 补全。
  const slice = end > start ? s.slice(start, end + 1) : s.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    // 模型输出非严格 JSON —— 尝试修复(未转义引号、尾逗号、单引号、截断未闭合等)
    return JSON.parse(jsonrepair(slice));
  }
}

module.exports = { extractJsonObject };
