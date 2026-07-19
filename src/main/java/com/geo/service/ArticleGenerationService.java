package com.geo.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.dto.ArticleGenerateRequest;
import com.geo.entity.GeneratedArticle;
import com.geo.entity.UserActivity;
import com.geo.llm.LlmProvider;
import com.geo.repository.GeneratedArticleRepository;
import com.geo.service.ActivityService;
import com.geo.util.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 文章生成服务 — 使用 LLM 根据话题/场景问题/产品生成文章，并持久化到数据库
 */
@Service
public class ArticleGenerationService {

    private static final Logger log = LoggerFactory.getLogger(ArticleGenerationService.class);

    private final LlmProvider llmProvider;
    private final ObjectMapper objectMapper;
    private final GeneratedArticleRepository articleRepository;
    private final ActivityService activityService;

    public ArticleGenerationService(LlmProvider llmProvider,
                                     GeneratedArticleRepository articleRepository,
                                     ActivityService activityService) {
        this.llmProvider = llmProvider;
        this.objectMapper = new ObjectMapper();
        this.articleRepository = articleRepository;
        this.activityService = activityService;
    }

    /**
     * 根据用户提交的表单生成文章
     */
    public Result<?> generate(ArticleGenerateRequest request, Long userId) {
        String systemPrompt = buildSystemPrompt();
        String userPrompt = buildUserPrompt(request);

        log.info("开始生成 {} 篇文章，话题: {}", request.getArticleCount(), request.getTopic());

        try {
            // 调用 LLM 生成内容
            String rawOutput = llmProvider.chat(systemPrompt, userPrompt);

            // 解析 LLM 返回的 JSON 结果
            List<Map<String, Object>> articles = parseArticles(rawOutput, request.getArticleCount());

            // 持久化到数据库
            List<Map<String, Object>> savedArticles = saveToDatabase(articles, request, userId);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("topic", request.getTopic());
            result.put("count", savedArticles.size());
            result.put("articles", savedArticles);

            return Result.success("文章生成完成", result);

        } catch (Exception e) {
            log.error("文章生成失败", e);
            return Result.error("文章生成失败: " + e.getMessage());
        }
    }

    /**
     * 构建系统提示词 — 生成咨询型洞察文章。
     * <p>
     * 目标：不是普通软文，而是让读者看到清晰判断、原因链和可执行建议。
     */
    private String buildSystemPrompt() {
        return """
                你是一名资深管理咨询顾问兼行业研究作者，擅长把复杂商业问题写成有判断、有推理、有行动建议的中文咨询文章。

                【写作目标】
                - 文章要像咨询公司给企业管理层写的洞察文章，而不是品牌软文、SEO 水文或产品宣传稿。
                - 必须先给出明确判断，再解释背后的原因链，最后给出可执行建议。
                - 每篇文章都要回答用户给出的场景问题，并围绕一个核心洞察展开，不要堆砌常识。

                【内容结构】
                正文必须使用 Markdown，建议包含以下模块，但标题可以自然变化：
                1. 开篇判断：用 2-3 段直接说清楚本文的核心结论
                2. 问题拆解：指出企业真正遇到的矛盾、误区或决策难点
                3. 深层原因：解释行业、组织、流程、技术或用户行为层面的原因
                4. 方法框架：给出 3-5 个可操作的分析框架、评估维度或落地步骤
                5. 产品/案例视角：自然提及用户指定产品，把它作为案例、工具或解决方案的一部分，不要硬广
                6. 行动建议：给管理者或业务负责人一组清晰建议

                【质量要求】
                - 正文 1400-2200 字，信息密度高，观点明确。
                - 每篇至少提出 3 个非显而易见的洞察，避免“提高效率、降低成本、提升体验”这类空话。
                - 必须解释“为什么现在这个问题变得重要”，并说明“错误做法会带来什么代价”。
                - 可以使用框架、清单、对比，但不要写成模板化列表堆砌。
                - 没有来源时不要编造具体统计数据；可以使用“多数企业、典型团队、常见场景”等定性表达。
                - 语气专业、克制、像顾问给客户写简报：清楚、笃定、有边界。

                【禁止】
                - 禁止写成泛泛的品牌宣传稿。
                - 禁止使用“赋能、闭环、引爆、颠覆、全链路、解决方案矩阵”等空泛套话。
                - 禁止标题党和过度承诺。
                - 禁止虚构公司名称、研究报告、百分比数据或客户案例。

                返回纯 JSON（不要 markdown 代码块标记）：
                {
                  "articles": [
                    {
                      "title": "标题",
                      "summary": "摘要（50字内）",
                      "content": "正文（Markdown，## 小标题，不少于1000字）",
                      "tags": ["标签1","标签2","标签3"]
                    }
                  ]
                }
                """;
    }

    /**
     * 构建用户提示词 — 从监测数据出发
     */
    private String buildUserPrompt(ArticleGenerateRequest req) {
        StringBuilder sb = new StringBuilder();

        sb.append("【文章主题】").append(req.getTopic()).append("\n");
        sb.append("请把它处理成一篇有咨询洞察的行业文章，不要写成普通介绍文。\n\n");

        if (req.getSceneQuestions() != null && !req.getSceneQuestions().isEmpty()) {
            sb.append("【必须回答的真实用户问题】\n");
            for (int i = 0; i < req.getSceneQuestions().size(); i++) {
                String q = req.getSceneQuestions().get(i);
                if (q != null && !q.isBlank()) {
                    sb.append(i + 1).append(". ").append(q.trim()).append("\n");
                }
            }
            sb.append("\n");
        }

        sb.append("【生成数量】请生成 ").append(req.getArticleCount()).append(" 篇文章。\n");

        if (req.getArticleCount() > 1) {
            sb.append("每篇必须从不同咨询视角切入，例如：战略判断、组织落地、工具选型、风险治理、经营效率。标题、观点和结构不要重复。\n");
        }

        if (req.getProduct() != null && !req.getProduct().isBlank()) {
            sb.append("\n【可提及的产品】").append(req.getProduct()).append("\n");
            sb.append("要求：只在合适位置自然出现，把它作为一个可考虑的工具、案例或落地选项。不要整篇围绕产品卖点写。\n");
        }

        if (req.getNotes() != null && !req.getNotes().isBlank()) {
            sb.append("\n【补充要求】").append(req.getNotes()).append("\n");
        }

        sb.append("""

                【输出要求】
                - title 要像咨询文章标题，体现判断或问题，不要标题党。
                - summary 用 50 字内概括核心结论。
                - content 使用 Markdown，二级标题用 ##。
                - tags 给 3-5 个，偏行业、管理、策略、工具选型方向。
                - 只返回 JSON，不要额外解释。
                """);

        return sb.toString();
    }

    /**
     * 将生成的文章保存到数据库，返回带 ID 的文章列表
     */
    private List<Map<String, Object>> saveToDatabase(List<Map<String, Object>> articles,
                                                      ArticleGenerateRequest request, Long userId) {
        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> article : articles) {
            GeneratedArticle entity = new GeneratedArticle();
            entity.setUserId(userId);
            entity.setTitle((String) article.getOrDefault("title", ""));
            entity.setSummary((String) article.getOrDefault("summary", ""));
            entity.setContent((String) article.getOrDefault("content", ""));
            entity.setTopic(request.getTopic());
            entity.setProduct(request.getProduct());
            entity.setNotes(request.getNotes());

            // tags 转为 JSON 字符串
            try {
                Object tagsObj = article.get("tags");
                entity.setTags(tagsObj != null ? objectMapper.writeValueAsString(tagsObj) : "[]");
            } catch (JsonProcessingException e) {
                entity.setTags("[]");
            }

            // sceneQuestions 转为 JSON 字符串
            try {
                entity.setSceneQuestions(objectMapper.writeValueAsString(request.getSceneQuestions()));
            } catch (JsonProcessingException e) {
                entity.setSceneQuestions("[]");
            }

            GeneratedArticle saved = articleRepository.save(entity);

            Map<String, Object> articleWithId = new LinkedHashMap<>(article);
            articleWithId.put("id", saved.getId());
            articleWithId.put("createTime", saved.getCreateTime().toString());
            result.add(articleWithId);
        }

        log.info("已保存 {} 篇文章到数据库", result.size());
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "发布文章",
            result.size() > 0 ? "已生成并发布 " + result.size() + " 篇关于「" + request.getTopic() + "」的文章" : "已开始文章创作");
        return result;
    }

    /**
     * 解析 LLM 返回的 JSON，提取文章列表
     */
    private List<Map<String, Object>> parseArticles(String rawOutput, int expectedCount) {
        List<Map<String, Object>> articles = new ArrayList<>();

        try {
            // 尝试清理可能的 markdown 代码块包裹
            String json = rawOutput.trim();
            if (json.startsWith("```json")) {
                json = json.substring(7);
            } else if (json.startsWith("```")) {
                json = json.substring(3);
            }
            if (json.endsWith("```")) {
                json = json.substring(0, json.length() - 3);
            }
            json = extractJsonObject(json.trim());

            JsonNode root = objectMapper.readTree(json);

            if (root.has("articles")) {
                JsonNode arr = root.get("articles");
                for (JsonNode node : arr) {
                    Map<String, Object> article = new LinkedHashMap<>();
                    article.put("title", node.has("title") ? node.get("title").asText() : "");
                    article.put("summary", node.has("summary") ? node.get("summary").asText() : "");
                    article.put("content", node.has("content") ? node.get("content").asText() : "");
                    article.put("tags", objectMapper.convertValue(
                            node.has("tags") ? node.get("tags") : objectMapper.createArrayNode(),
                            List.class));
                    article.put("id", UUID.randomUUID().toString().substring(0, 8));
                    article.put("createdAt", java.time.LocalDateTime.now().toString());
                    articles.add(article);
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("LLM 返回的 JSON 解析失败，使用原始输出: {}", e.getMessage());
            // 降级：将原始输出作为一篇文章
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("title", "生成结果");
            fallback.put("summary", "");
            fallback.put("content", rawOutput);
            fallback.put("tags", Collections.emptyList());
            fallback.put("id", UUID.randomUUID().toString().substring(0, 8));
            fallback.put("createdAt", java.time.LocalDateTime.now().toString());
            articles.add(fallback);
        }

        return articles;
    }

    /**
     * GPT usually follows JSON mode, but this keeps parsing resilient for other providers.
     */
    private String extractJsonObject(String text) {
        if (text.startsWith("{") && text.endsWith("}")) {
            return text;
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return text.substring(start, end + 1);
        }
        return text;
    }
}
