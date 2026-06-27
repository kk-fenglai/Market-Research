// 从模型文本输出中提取 JSON 对象(容错:去 ```json 围栏 / 截取首尾大括号)。
function extractJsonObject(text) {
  if (!text || !text.trim()) throw new Error('空响应,无 JSON 可解析');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('响应中未找到 JSON 对象');
  }
  return JSON.parse(s.slice(start, end + 1));
}

module.exports = { extractJsonObject };
