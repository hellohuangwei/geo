package com.geo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.llm.LlmProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 相关性过滤服务 — 用 AI 判断视频标题是否与搜索关键词相关。
 * <p>
 * 双层过滤：
 * <ol>
 *   <li>客户端脚本已做基础文本匹配（bigram/字符）；</li>
 *   <li>本服务提供可选 AI 语义过滤，默认关闭（通过 {@code acquisition.relevance-filter.enabled} 控制）。</li>
 * </ol>
 */
@Service
public class RelevanceFilterService {

    private static final Logger log = LoggerFactory.getLogger(RelevanceFilterService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final LlmProvider llmProvider;
    private final boolean enabled;
    private final double minScore;
    private final int maxBatchSize;

    public RelevanceFilterService(
            LlmProvider llmProvider,
            @Value("${acquisition.relevance-filter.enabled:false}") boolean enabled,
            @Value("${acquisition.relevance-filter.min-score:0.5}") double minScore,
            @Value("${acquisition.relevance-filter.max-batch:10}") int maxBatchSize) {
        this.llmProvider = llmProvider;
        this.enabled = enabled;
        this.minScore = minScore;
        this.maxBatchSize = maxBatchSize;
        log.info("RelevanceFilter: enabled={}, minScore={}, maxBatch={}", enabled, minScore, maxBatchSize);
    }

    /** 是否启用了 AI 相关性过滤 */
    public boolean isEnabled() {
        return enabled;
    }

    /** 最低相关性分数阈值 */
    public double getMinScore() {
        return minScore;
    }

    /**
     * 判断视频标题是否与搜索关键词相关。
     *
     * @param keyword 搜索关键词
     * @param title   视频标题
     * @return true 表示相关，应采集；false 表示不相关，应跳过
     */
    public boolean isRelevant(String keyword, String title) {
        if (!enabled) return true;
        if (keyword == null || keyword.isBlank()) return true;
        if (title == null || title.isBlank()) return false;

        // 先用本地算法做快速预判
        double quickScore = quickMatch(keyword, title);
        if (quickScore >= 0.8) {
            log.debug("Quick match: keyword='{}' title='{}' score={}", keyword, title.substring(0, Math.min(40, title.length())), quickScore);
            return true;
        }
        if (quickScore < 0.15) {
            log.debug("Quick reject: keyword='{}' title='{}' score={}", keyword, title.substring(0, Math.min(40, title.length())), quickScore);
            return false;
        }

        // 快速匹配不确定时，调用 AI
        try {
            String systemPrompt = "你是一个内容相关性判断助手。你需要判断视频标题是否与搜索关键词相关。"
                    + "只回复 JSON 格式：{\"relevant\": true/false, \"score\": 0.0-1.0, \"reason\": \"一句话简短理由(不超过20字)\"}";
            String userPrompt = String.format(
                    "搜索关键词: \"%s\"\n视频标题: \"%s\"\n\n请判断这个视频标题是否与搜索关键词相关。"
                            + "如果是同一话题、相关产品、相关场景、相关人群、或包含关键词的同义表达，就是相关的。"
                            + "如果话题完全不同、只是碰巧有相同字但不是同一个意思、或完全不搭边，就是不相关的。",
                    keyword, title);

            String response = llmProvider.chat(systemPrompt, userPrompt);
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(extractJson(response), Map.class);
            boolean relevant = Boolean.TRUE.equals(result.get("relevant"));
            Object scoreObj = result.get("score");
            double score = scoreObj instanceof Number n ? n.doubleValue() : 0.5;
            Object reasonObj = result.get("reason");
            String reason = reasonObj != null ? reasonObj.toString() : "";

            log.info("AI relevance: keyword='{}' title='{}...' relevant={} score={} reason='{}'",
                    keyword, title.substring(0, Math.min(50, title.length())), relevant, score, reason);

            return relevant && score >= minScore;
        } catch (Exception e) {
            log.warn("AI relevance check failed for '{}': {}, falling back to quick match", keyword, e.getMessage());
            return quickScore >= minScore;
        }
    }

    /**
     * 从采集结果中过滤掉不相关的项目。
     */
    public int filterResults(String keyword, List<Map<String, Object>> comments) {
        if (!enabled || comments.isEmpty()) return 0;

        int skipped = 0;
        // 按 videoTitle 分组去重过滤（避免同一视频的多条评论重复 AI 调用）
        var checkedTitles = new java.util.LinkedHashMap<String, Boolean>();
        var it = comments.iterator();
        while (it.hasNext()) {
            Map<String, Object> item = it.next();
            String title = String.valueOf(item.getOrDefault("videoTitle", ""));
            if (title.isBlank()) continue;

            Boolean relevant = checkedTitles.computeIfAbsent(title, t -> isRelevant(keyword, t));
            if (!relevant) {
                it.remove();
                skipped++;
            }
        }
        if (skipped > 0) {
            log.info("RelevanceFilter removed {} irrelevant comments (checked {} unique titles)",
                    skipped, checkedTitles.size());
        }
        return skipped;
    }

    // ==================== 内部方法 ====================

    /**
     * 本地快速匹配 — 与 .mjs 脚本中的 computeTitleMatch 逻辑一致。
     */
    static double quickMatch(String keyword, String title) {
        String kw = keyword.replaceAll("\\s+", "").toLowerCase();
        String tl = title.replaceAll("\\s+", "").toLowerCase();
        if (kw.isEmpty() || tl.isEmpty()) return 0;

        // 完整子串包含
        if (tl.contains(kw)) return 1.0;

        // 拆分搜索词
        String[] terms = keyword.split("[\\s,，、]+");
        double totalScore = 0;
        int validTerms = 0;

        for (String term : terms) {
            if (term.isBlank()) continue;
            validTerms++;
            String t = term.replaceAll("\\s+", "").toLowerCase();

            if (tl.contains(t)) {
                totalScore += 1.0;
                continue;
            }

            // bigram
            if (t.length() >= 2) {
                int matched = 0;
                int total = t.length() - 1;
                for (int i = 0; i < total; i++) {
                    if (tl.contains(t.substring(i, i + 2))) matched++;
                }
                if (total > 0 && (double) matched / total >= 0.5) {
                    totalScore += (double) matched / total;
                    continue;
                }
            }

            // char-level fallback
            double charMatch = 0;
            for (char c : t.toCharArray()) {
                if (tl.indexOf(c) >= 0) charMatch++;
            }
            totalScore += charMatch / t.length();
        }

        return validTerms > 0 ? totalScore / validTerms : 0;
    }

    static String extractJson(String text) {
        if (text == null) return "{}";
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return text.substring(start, end + 1);
        // 可能 Ollama 返回了 markdown 代码块
        start = text.indexOf("```json");
        if (start >= 0) {
            start = text.indexOf('{', start);
            end = text.lastIndexOf('}');
            if (start >= 0 && end > start) return text.substring(start, end + 1);
        }
        start = text.indexOf("```");
        if (start >= 0) {
            int bodyStart = text.indexOf('{', start);
            end = text.lastIndexOf('}');
            if (bodyStart >= 0 && end > bodyStart) return text.substring(bodyStart, end + 1);
        }
        return "{}";
    }
}
