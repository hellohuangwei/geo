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
            你是一个客户意向分析专家，任务是从社交媒体评论中帮商家识别**潜在付费客户**。

            商家视角：发评论的用户在相关视频下留言，商家想通过评论判断谁有购买需求。

            只返回合法的JSON，不要任何其他文字。
            JSON格式: {"level":"high|medium|low|none","score":85,"reason":"一句话判断理由","demandKeywords":["用户表达的需求关键词"]}

            意向级别严格判断标准：
            - high: 明确购买/消费意愿。例如：直接问价格、问怎么买、要联系方式、预约服务、询问上门、明确说"想做""需要"、比价、要报价
            - medium: 有兴趣但未到购买阶段。例如：问产品细节、问效果/质量、问案例、问资质、比较方案、表达痛点、说"考虑""纠结""想了解"
            - low: 泛兴趣或围观。例如：单纯点赞式评论、说"收藏""看看""以后再说"、表达好奇但不涉及需求
            - none: 完全不相关、纯表情、无意义灌水、与商家业务无关的闲聊

            注意：
            1. 评论可能包含回复其他人的部分（如"回复 xxx："），要忽略回复标记，分析用户自己的观点
            2. 用户如果是在询问其他评论者而非商家，仍然可能透露自身需求，不要忽略
            3. 表情符号（如😊👍）不算需求关键词
            4. score 打分：high 75-100, medium 45-74, low 15-44, none 0-14
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
