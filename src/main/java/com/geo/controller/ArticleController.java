package com.geo.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.dto.ArticleGenerateRequest;
import com.geo.entity.GeneratedArticle;
import com.geo.entity.SysUser;
import com.geo.entity.UserActivity;
import com.geo.repository.GeneratedArticleRepository;
import com.geo.repository.SysUserRepository;
import com.geo.llm.LlmProvider;
import com.geo.service.ActivityService;
import com.geo.service.ArticleGenerationService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;
import java.util.function.Consumer;

@RestController
@RequestMapping("/api/articles")
public class ArticleController {

    private final ArticleGenerationService generationService;
    private final GeneratedArticleRepository articleRepository;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final LlmProvider llmProvider;
    private final ActivityService activityService;

    public ArticleController(ArticleGenerationService generationService,
                             GeneratedArticleRepository articleRepository,
                             JwtUtil jwtUtil,
                             SysUserRepository userRepository,
                             LlmProvider llmProvider,
                             ActivityService activityService) {
        this.generationService = generationService;
        this.articleRepository = articleRepository;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.objectMapper = new ObjectMapper();
        this.llmProvider = llmProvider;
        this.activityService = activityService;
    }

    /** 从 Authorization header 提取 userId */
    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }

    /** 生成文章 */
    @PostMapping("/generate")
    public Result<?> generate(@RequestHeader("Authorization") String authHeader,
                              @RequestBody ArticleGenerateRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        if (request.getTopic() == null || request.getTopic().isBlank())
            return Result.error("话题不能为空");
        if (request.getSceneQuestions() == null || request.getSceneQuestions().isEmpty()
                || request.getSceneQuestions().stream().allMatch(String::isBlank))
            return Result.error("至少需要一个场景问题");
        if (request.getArticleCount() < 1 || request.getArticleCount() > 20)
            return Result.error("文章数量需在 1-20 之间");
        return generationService.generate(request, userId);
    }

    /** 获取当前用户的文章列表（分页） */
    @GetMapping
    public Result<?> list(@RequestHeader("Authorization") String authHeader,
                          @RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "10") int size) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        var pageable = PageRequest.of(page - 1, size, Sort.by("createTime").descending());
        var pageResult = articleRepository.findByUserIdOrderByCreateTimeDesc(userId, pageable);

        List<Map<String, Object>> items = new ArrayList<>();
        for (GeneratedArticle a : pageResult.getContent()) {
            items.add(toSummaryMap(a));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("total", pageResult.getTotalElements());
        result.put("page", page);
        result.put("size", size);
        result.put("totalPages", pageResult.getTotalPages());
        return Result.success(result);
    }

    /** 获取文章详情 */
    @GetMapping("/{id}")
    public Result<?> detail(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "文章不存在");
        return Result.success(toDetailMap(opt.get()));
    }

    /** 更新文章 */
    @PutMapping("/{id}")
    public Result<?> update(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id,
                            @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "文章不存在");

        GeneratedArticle a = opt.get();
        if (body.containsKey("title")) a.setTitle((String) body.get("title"));
        if (body.containsKey("summary")) a.setSummary((String) body.get("summary"));
        if (body.containsKey("content")) a.setContent((String) body.get("content"));
        if (body.containsKey("topic")) a.setTopic((String) body.get("topic"));
        if (body.containsKey("product")) a.setProduct((String) body.get("product"));
        if (body.containsKey("notes")) a.setNotes((String) body.get("notes"));
        if (body.containsKey("tags")) {
            try { a.setTags(objectMapper.writeValueAsString(body.get("tags"))); }
            catch (JsonProcessingException ignored) {}
        }
        articleRepository.save(a);
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "编辑文章——" + a.getTitle(),
            "已更新文章内容", a.getId());
        return Result.success("更新成功");
    }

    /** 单篇发布 */
    @PostMapping("/{id}/publish")
    public Result<?> publish(@RequestHeader("Authorization") String authHeader,
                             @PathVariable Long id,
                             @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "文章不存在");

        @SuppressWarnings("unchecked")
        List<String> platforms = (List<String>) body.getOrDefault("platforms", Collections.emptyList());
        GeneratedArticle a = opt.get();
        Map<String, String> status = parsePublishStatus(a.getPublishStatus());
        for (String platform : platforms) status.put(platform, "published");
        try { a.setPublishStatus(objectMapper.writeValueAsString(status)); }
        catch (JsonProcessingException e) { return Result.error("发布状态更新失败"); }
        articleRepository.save(a);
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "发布文章——" + a.getTitle(),
            "已将文章发布到 " + platforms.size() + " 个平台", a.getId());
        return Result.success("发布成功");
    }

    /** 批量发布 */
    @PostMapping("/batch-publish")
    public Result<?> batchPublish(@RequestHeader("Authorization") String authHeader,
                                  @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("ids", Collections.emptyList());
        @SuppressWarnings("unchecked")
        List<String> platforms = (List<String>) body.getOrDefault("platforms", Collections.emptyList());
        if (rawIds.isEmpty() || platforms.isEmpty()) return Result.error("文章和平台不能为空");

        int count = 0;
        for (Integer rawId : rawIds) {
            Long id = rawId.longValue();
            Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
            if (opt.isPresent()) {
                GeneratedArticle a = opt.get();
                Map<String, String> status = parsePublishStatus(a.getPublishStatus());
                for (String platform : platforms) status.put(platform, "published");
                try { a.setPublishStatus(objectMapper.writeValueAsString(status)); }
                catch (JsonProcessingException e) { continue; }
                articleRepository.save(a);
                count++;
            }
        }
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "批量发布文章",
            "成功发布 " + count + " 篇文章到 " + platforms.size() + " 个平台");
        return Result.success("成功发布 " + count + " 篇文章到 " + platforms.size() + " 个平台");
    }

    /** 当前用户的发布历史 */
    @GetMapping("/publish-history")
    public Result<?> publishHistory(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        List<GeneratedArticle> all = articleRepository.findByUserIdOrderByCreateTimeDesc(userId);
        List<Map<String, Object>> history = new ArrayList<>();
        for (GeneratedArticle a : all) {
            Map<String, String> status = parsePublishStatus(a.getPublishStatus());
            for (Map.Entry<String, String> entry : status.entrySet()) {
                Map<String, Object> record = new LinkedHashMap<>();
                record.put("articleId", a.getId());
                record.put("articleTitle", a.getTitle());
                record.put("platform", entry.getKey());
                record.put("platformLabel", getPlatformLabel(entry.getKey()));
                record.put("status", entry.getValue());
                record.put("publishTime", a.getCreateTime());
                history.add(record);
            }
        }
        return Result.success(history);
    }

    /** 删除文章 */
    @DeleteMapping("/{id}")
    public Result<?> delete(@RequestHeader("Authorization") String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");
        Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) return Result.error(404, "文章不存在");
        String title = opt.get().getTitle();
        articleRepository.delete(opt.get());
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "删除文章——" + title,
            "已删除文章", id);
        return Result.success("删除成功");
    }

    /** 批量删除 */
    @DeleteMapping("/batch")
    public Result<?> batchDelete(@RequestHeader("Authorization") String authHeader,
                                  @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("ids", Collections.emptyList());
        if (rawIds.isEmpty()) return Result.error("请选择文章");

        int count = 0;
        for (Integer rawId : rawIds) {
            Long id = rawId.longValue();
            Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
            if (opt.isPresent()) {
                articleRepository.delete(opt.get());
                count++;
            }
        }
        activityService.logActivity(userId, UserActivity.TYPE_ARTICLE,
            "批量删除文章", "已删除 " + count + " 篇文章");
        return Result.success("成功删除 " + count + " 篇文章");
    }

    /** 根据话题自动生成场景问题 */
    @PostMapping("/scene-questions/generate")
    public Result<?> generateSceneQuestions(@RequestHeader("Authorization") String authHeader,
                                           @RequestBody Map<String, String> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        String topic = body.get("topic");
        if (topic == null || topic.isBlank()) return Result.error("话题不能为空");

        String systemPrompt = "你是搜索意图分析专家。根据话题生成3个用户可能搜索的中文问题，每个问题像真实用户口语搜索一样自然。";

        String userPrompt = "Generate 3 Chinese search queries about this topic: " + topic + ". Output 3 lines. No JSON, no explanation.\n\n"
            + "Topic example: 外贸全流程陪跑\n"
            + "Good queries for that topic:\n"
            + "排名前十的外贸询盘无忧服务公司\n"
            + "专业的外贸询盘无忧服务商有哪些\n"
            + "有哪些口碑好的外贸全流程陪跑公司\n"
            + "口碑好的外贸全流程陪跑服务商有哪些\n"
            + "靠谱的外贸全流程陪跑服务商推荐\n";

        try {
            String raw = llmProvider.chat(systemPrompt, userPrompt);
            List<String> questions = parseSceneQuestions(raw);
            if (questions.isEmpty()) return Result.error("AI 未能生成有效问题，请重试");
            return Result.success("生成成功", questions);
        } catch (Exception e) {
            return Result.error("生成失败: " + e.getMessage());
        }
    }

    /** 鲁棒解析 AI 返回的场景问题 — 兼容各种模型的不可预测输出 */
    private List<String> parseSceneQuestions(String raw) {
        // 1. 先尝试当 JSON 数组解析
        String cleaned = raw.trim();
        if (cleaned.startsWith("```")) {
            int start = cleaned.indexOf("\n");
            if (start > 0) cleaned = cleaned.substring(start + 1);
            int end = cleaned.lastIndexOf("```");
            if (end > 0) cleaned = cleaned.substring(0, end);
        }
        cleaned = cleaned.trim();

        // JSON 数组
        if (cleaned.startsWith("[")) {
            try {
                @SuppressWarnings("unchecked")
                List<String> arr = objectMapper.readValue(cleaned, List.class);
                return arr.stream().map(Object::toString).filter(s -> !s.isBlank()).toList();
            } catch (Exception ignored) {}
        }
        // JSON 对象 — 提取所有 value 中的字符串
        if (cleaned.startsWith("{")) {
            try {
                List<String> result = new java.util.ArrayList<>();
                JsonNode root = objectMapper.readTree(cleaned);
                extractStrings(root, result);
                if (!result.isEmpty()) return result;
            } catch (Exception ignored) {}
        }

        // 2. 按行解析 — 去掉编号、引号等
        List<String> lines = new java.util.ArrayList<>();
        for (String line : raw.split("\\n")) {
            String s = line.trim();
            if (s.isEmpty() || s.startsWith("```") || s.startsWith("{")) continue;
            // 去编号 "1. " "1、" "1）" "1)" 等
            s = s.replaceFirst("^[\\d]+[.、．）)]\\s*", "");
            // 去首尾引号
            s = s.replaceAll("^[\"']|[\"']$", "");
            if (!s.isBlank() && s.length() >= 4) lines.add(s);
        }
        return lines.stream().limit(5).toList();
    }

    /** 递归提取 JSON 树中所有字符串值 */
    private void extractStrings(JsonNode node, List<String> out) {
        if (node.isTextual()) {
            String s = node.asText().trim();
            if (!s.isBlank() && s.length() >= 4) out.add(s);
        } else if (node.isArray()) {
            for (JsonNode child : node) extractStrings(child, out);
        } else if (node.isObject()) {
            for (JsonNode child : node) extractStrings(child, out);
        }
    }

    /** AI 辅助编辑（流式）：通过 SSE 实时返回 AI 生成的每个 token */
    @PostMapping(value = "/{id}/ai-edit/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter aiEditStream(@RequestHeader("Authorization") String authHeader,
                                   @PathVariable Long id,
                                   @RequestBody Map<String, Object> body) {
        SseEmitter emitter = new SseEmitter(300000L); // 5分钟超时

        Long userId = getUserId(authHeader);
        if (userId == null) {
            try { emitter.send(SseEmitter.event().name("error").data("未登录或 Token 无效")); }
            catch (Exception ignored) {}
            emitter.complete();
            return emitter;
        }

        Optional<GeneratedArticle> opt = articleRepository.findByIdAndUserId(id, userId);
        if (opt.isEmpty()) {
            try { emitter.send(SseEmitter.event().name("error").data("文章不存在")); }
            catch (Exception ignored) {}
            emitter.complete();
            return emitter;
        }

        String currentContent = (String) body.getOrDefault("content", "");
        String userMessage = (String) body.getOrDefault("message", "");
        if (userMessage.isBlank()) {
            try { emitter.send(SseEmitter.event().name("error").data("请提供修改指令")); }
            catch (Exception ignored) {}
            emitter.complete();
            return emitter;
        }

        String systemPrompt = """
            你是一个专业的内容编辑助手。用户会给你一篇 Markdown 文章，告诉你如何修改。

            回复格式（必须严格遵守，分两块内容）：
            【修改说明】
            具体说明你做了哪些修改，包括：
            - 改了什么内容（标题、段落、结构、语气等）
            - 修改的理由
            （这部分会在聊天中展示给用户，让用户知道哪里改了）

            【完整文章】
            （这里放修改后的完整文章，必须使用标准 Markdown 语法）
            （这部分会自动应用到编辑器中，不会在聊天中显示）

            标准 Markdown 语法：
            ## 这是二级标题（#后必须有空格）
            这是**加粗文字**（两个星号包裹）
            - 这是列表项（-后必须有空格）
            段落之间必须有一个空行。
            """;

        // 在新线程中执行，避免阻塞主线程
        new Thread(() -> {
            try {
                llmProvider.chatStream(systemPrompt,
                    "原始文章内容：\n\n" + currentContent + "\n\n修改指令：" + userMessage,
                    token -> {
                        try {
                            // 转义换行符避免破坏 SSE 协议
                            String safe = token.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r");
                            emitter.send(SseEmitter.event().name("token").data(safe));
                        } catch (Exception e) {
                            throw new RuntimeException(e);
                        }
                    });
                emitter.send(SseEmitter.event().name("done").data(""));
                emitter.complete();
            } catch (Exception e) {
                try {
                    emitter.send(SseEmitter.event().name("error").data("AI 处理失败: " + e.getMessage()));
                } catch (Exception ignored) {}
                emitter.complete();
            }
        }).start();

        return emitter;
    }

    // ==================== helpers ====================

    private Map<String, Object> toSummaryMap(GeneratedArticle a) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", a.getId());
        item.put("title", a.getTitle());
        item.put("summary", a.getSummary());
        item.put("topic", a.getTopic());
        item.put("product", a.getProduct());
        item.put("tags", parseJsonArray(a.getTags()));
        item.put("publishStatus", parsePublishStatus(a.getPublishStatus()));
        item.put("createTime", a.getCreateTime());
        return item;
    }

    private Map<String, Object> toDetailMap(GeneratedArticle a) {
        Map<String, Object> item = toSummaryMap(a);
        item.put("content", a.getContent());
        item.put("sceneQuestions", parseJsonArray(a.getSceneQuestions()));
        item.put("notes", a.getNotes());
        return item;
    }

    @SuppressWarnings("unchecked")
    private List<String> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return objectMapper.readValue(json, List.class); }
        catch (JsonProcessingException e) { return Collections.emptyList(); }
    }

    private Map<String, String> parsePublishStatus(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            @SuppressWarnings("unchecked")
            Map<String, String> map = objectMapper.readValue(json, Map.class);
            return new LinkedHashMap<>(map);
        } catch (JsonProcessingException e) { return new LinkedHashMap<>(); }
    }

    private String getPlatformLabel(String key) {
        return switch (key) {
            case "zhihu" -> "知乎";
            case "baijiahao" -> "百家号";
            case "gzh" -> "微信公众号";
            case "juejin" -> "掘金";
            case "csdn" -> "CSDN";
            case "jianshu" -> "简书";
            case "36kr" -> "36氪";
            case "souhu" -> "搜狐号";
            default -> key;
        };
    }
}
