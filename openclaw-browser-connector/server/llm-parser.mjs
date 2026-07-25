/**
 * Intent Parser — 规则优先 + LLM 兜底。
 *
 * 先用正则从用户消息中提取 keyword 和 count（零幻觉），
 * 时间范围等语义理解交给 LLM 处理。
 */

// 本地 vLLM Qwen 模型 (OpenAI 兼容 API)
const LLM_URL = process.env.LLM_API_URL || 'http://127.0.0.1:6007/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.5-vl-9b';

// ── 时间工具函数（供采集层调用） ────────────────

/**
 * 将 timeRange {value, unit} 转换为截止时间戳（毫秒）
 * 返回 null 表示无时间限制
 */
export function timeRangeToCutoff(timeRange) {
  if (!timeRange || !timeRange.value || !timeRange.unit) return null;

  const msPerUnit = {
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000, // 近似
    years: 365 * 24 * 60 * 60 * 1000,
  };

  const ms = timeRange.value * (msPerUnit[timeRange.unit] || msPerUnit.months);
  return Date.now() - ms;
}

/**
 * 根据 timeRange 过滤评论列表，只保留 publishedAt 在时间范围内的
 */
export function filterCommentsByTime(comments, timeRange) {
  const cutoff = timeRangeToCutoff(timeRange);
  if (!cutoff) return comments; // 无限制

  const filtered = comments.filter(c => {
    if (!c.publishedAt) return true; // 没有时间的保留（可能是 DOM 提取失败）
    const date = new Date(c.publishedAt);
    return !isNaN(date.getTime()) && date.getTime() >= cutoff;
  });

  if (filtered.length < comments.length) {
    console.log(`[parser:filter] 时间过滤: ${comments.length} → ${filtered.length} (${timeRange.value} ${timeRange.unit})`);
  }
  return filtered;
}

// ── 规则提取（只负责 keyword + count） ────────

function extractByRule(message) {
  const msg = message.trim();

  // 1. 提取数量：匹配 "200条" "100个" "200" 等
  const countMatch = msg.match(/(\d+)\s*(?:条|个|篇|则)/);
  const count = countMatch ? parseInt(countMatch[1]) : 100;

  // 2. 剥离动作词/前缀/后缀，剩下的就是关键词
  const prefixes = [
    /^(?:帮我|请|麻烦|给|来|去|需要|想|要|帮忙|给咱|给我)\s*/,
    /^(?:采集|搜索|查找|找|搜|爬|抓|拉|弄)\s*/,
    /^(?:帮我采集一下|帮我采集|帮我搜一下|帮我找一下|帮我查一下)\s*/,
    /^(?:我想|我要|我想找|我要找|我想采集|我要采集)\s*/,
  ];
  const suffixes = [
    /\s*(?:的评论|的抖音评论|的视频评论|评论|相关评论|相关内容).*$/,
    /\s*(?:\d+\s*(?:条|个|篇|则)).*$/,
  ];

  let keyword = msg;
  for (const re of prefixes) keyword = keyword.replace(re, '');
  for (const re of suffixes) keyword = keyword.replace(re, '');
  keyword = keyword.trim();

  // 3. 再次清理数量后缀（只含数字的情况）
  keyword = keyword.replace(/\s*\d+\s*$/, '').trim();

  if (keyword.length >= 2) {
    console.log(`[parser:rule] "${message}" → keyword="${keyword}" count=${count}`);
    return { keyword, count };
  }
  return null;
}

// ── LLM 兜底（负责语义理解，含时间范围） ──────

async function extractByLLM(message) {
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: `从用户消息提取关键词、数量和时-间范围，输出纯JSON。

规则：
- keyword 只从用户输入中提取，不要编造
- count 默认100
- timeRange 从用户消息中解析时间范围：
  - "3个月内"/"最近三个月" → {"value":3,"unit":"months"}
  - "1周内"/"一周内" → {"value":1,"unit":"weeks"}
  - "30天内"/"最近30天" → {"value":30,"unit":"days"}
  - "半年内" → {"value":6,"unit":"months"}
  - "1年内" → {"value":1,"unit":"years"}
  - 没有时间范围 → 不包含 timeRange 字段
- 格式：{"keyword":"...","count":...,"timeRange":{"value":...,"unit":"..."}}
- 无法提取时：{"keyword":null,"reply":"请说具体关键词"}` },
          { role: 'user', content: message },
        ],
        temperature: 0,
        max_tokens: 300,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.keyword) {
      const tr = parsed.timeRange;
      console.log(`[parser:llm] "${message}" → keyword="${parsed.keyword}" count=${parsed.count}${tr ? ` timeRange=${tr.value}${tr.unit}` : ''}`);
      return parsed;
    }
    return null;
  } catch (err) {
    console.error(`[parser:llm] 异常: ${err.message}`);
    return null;
  }
}

// ── 主入口 ──────────────────────────────────────

export async function parseUserIntent(message) {
  // 规则优先 — 零幻觉，只负责 keyword + count
  const ruleResult = extractByRule(message);

  // 如果消息可能含时间语义，交给 LLM 补充理解
  const hasTimeHint = /[月周天年]|内|最近|近|这|半/.test(message);

  if (ruleResult && !hasTimeHint) {
    // 纯关键词请求，规则结果直接返回
    return ruleResult;
  }

  // 走 LLM（时间语义 or 规则失败）
  const llmResult = await extractByLLM(message);
  if (llmResult) return llmResult;

  // LLM 失败时回退到规则结果
  if (ruleResult) return ruleResult;

  return { keyword: null, reply: '没理解，请说具体关键词，比如"成都驾校 200条"' };
}
