package com.geo.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.dto.IntentAnalysisResult;
import com.geo.llm.LlmProvider;
import com.geo.service.IntentAnalysisService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 基于 Ollama 大模型的评论意向分析服务
 */
@Service
public class OllamaIntentAnalysisService implements IntentAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(OllamaIntentAnalysisService.class);

    private final LlmProvider llmProvider;
    private final ObjectMapper objectMapper;

    public OllamaIntentAnalysisService(LlmProvider llmProvider) {
        this.llmProvider = llmProvider;
        this.objectMapper = new ObjectMapper();
    }

    private static final String SYSTEM_PROMPT = """
            你是一个销售意向分析专家。分析社交媒体评论，判断用户是否有购买/服务意向。
            只返回合法的JSON，不要任何其他文字。
            JSON格式: {"level":"high|medium|low|none","score":85,"reason":"一句话理由","demandKeywords":["关键词1","关键词2"]}

            意向级别判断标准：
            - high: 明确咨询价格、预约、要联系方式、表达购买意愿、询问上门/到店
            - medium: 表达兴趣、询问细节、比较选择、询问资质或可靠性
            - low: 泛兴趣、收藏了解、围观
            - none: 完全不相关、纯表情、无意义内容
            """;

    @Override
    public IntentAnalysisResult analyze(String commentContent, Map<String, Object> context) {
        if (commentContent == null || commentContent.isBlank()) {
            return new IntentAnalysisResult("none", 0, "空评论", List.of());
        }

        String brandName = stringValue(context.get("brandName"), "未设置品牌");
        String industry = stringValue(context.get("industryRole"), "未设置行业");
        String targetCustomer = stringValue(context.get("targetCustomer"), "未设置");
        String keyword = stringValue(context.get("keyword"), "未设置关键词");
        int likes = intValue(context.get("likes"), 0);

        String userPrompt = String.format("""
                根据以下信息分析这条评论的客户意向级别：

                【品牌/产品】%s - %s
                【目标客户】%s
                【搜索关键词】%s
                【评论内容】%s
                【评论点赞数】%d
                """, brandName, industry, targetCustomer, keyword, commentContent, likes);

        try {
            String response = llmProvider.chat(SYSTEM_PROMPT, userPrompt);
            log.debug("AI 分析原始响应: {}", response);

            // 尝试从响应中提取 JSON
            String json = extractJson(response);
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<>() {});

            String level = stringValue(parsed.get("level"), "none").toLowerCase();
            int score = intValue(parsed.get("score"), 0);
            String reason = stringValue(parsed.get("reason"), "AI 分析未返回理由");
            @SuppressWarnings("unchecked")
            List<String> keywords = (List<String>) parsed.getOrDefault("demandKeywords", List.of());

            // 限制 level 有效值
            if (!List.of("high", "medium", "low", "none").contains(level)) {
                level = "none";
            }
            // 限制分数范围
            score = Math.max(0, Math.min(100, score));

            return new IntentAnalysisResult(level, score, reason, keywords);

        } catch (Exception e) {
            log.error("AI 意向分析失败: {}", e.getMessage());
            // 降级到简单关键词匹配
            return fallbackAnalysis(commentContent);
        }
    }

    private String extractJson(String response) {
        // 尝试直接解析
        String trimmed = response.trim();
        if (trimmed.startsWith("{")) {
            int end = trimmed.lastIndexOf("}");
            if (end > 0) return trimmed.substring(0, end + 1);
        }
        // 尝试从 markdown 代码块提取
        int start = trimmed.indexOf("```json");
        if (start >= 0) {
            start += 7;
            int end = trimmed.indexOf("```", start);
            if (end > start) return trimmed.substring(start, end).trim();
        }
        // 尝试找任何 {...}
        start = trimmed.indexOf("{");
        int end = trimmed.lastIndexOf("}");
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return "{}";
    }

    /** 当 AI 调用失败时的降级关键词匹配分析 */
    private IntentAnalysisResult fallbackAnalysis(String content) {
        String text = content.toLowerCase();

        boolean high = false;
        boolean medium = false;

        for (String w : new String[]{"多少钱", "价格", "报价", "怎么收费", "能上门", "上门吗", "怎么买",
                "预约", "联系方式", "电话", "微信", "私信"}) {
            if (text.contains(w)) { high = true; break; }
        }
        if (!high) {
            for (String w : new String[]{"在哪里", "怎么做", "怎么选", "推荐", "能不能", "适合",
                    "靠谱吗", "多久", "报告", "资质", "标准"}) {
                if (text.contains(w)) { medium = true; break; }
            }
        }

        if (high) {
            return new IntentAnalysisResult("high", 80, "评论包含明确购买/服务需求关键词", List.of("明确咨询"));
        }
        if (medium) {
            return new IntentAnalysisResult("medium", 55, "评论包含服务兴趣关键词", List.of("服务兴趣"));
        }

        boolean low = false;
        for (String w : new String[]{"收藏", "学习", "了解", "看看", "有用", "路过"}) {
            if (text.contains(w)) { low = true; break; }
        }
        return new IntentAnalysisResult(low ? "low" : "none", low ? 30 : 10,
                low ? "泛兴趣围观" : "未识别明显意向", List.of());
    }

    private String stringValue(Object value, String fallback) {
        return value != null ? String.valueOf(value) : fallback;
    }

    private int intValue(Object value, int fallback) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s) {
            try { return Integer.parseInt(s); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }
}
