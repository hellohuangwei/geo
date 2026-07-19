package com.geo.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.entity.SysUser;
import com.geo.entity.Topic;
import com.geo.entity.UserActivity;
import com.geo.llm.LlmProvider;
import com.geo.repository.SysUserRepository;
import com.geo.repository.TopicRepository;
import com.geo.service.ActivityService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/topics")
public class TopicController {

    private final TopicRepository topicRepository;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;
    private final LlmProvider llmProvider;
    private final ActivityService activityService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TopicController(TopicRepository topicRepository, JwtUtil jwtUtil,
                           SysUserRepository userRepository, LlmProvider llmProvider,
                           ActivityService activityService) {
        this.topicRepository = topicRepository;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.llmProvider = llmProvider;
        this.activityService = activityService;
    }

    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }

    @GetMapping
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");
        List<Topic> topics = topicRepository.findByUserIdOrderByCreateTimeDesc(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Topic t : topics) result.add(toMap(t));
        return Result.success(result);
    }

    @PostMapping
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authHeader,
                            @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");
        String name = (String) body.get("name");
        if (name == null || name.isBlank()) return Result.error("话题名称不能为空");
        if (topicRepository.existsByNameAndUserId(name.trim(), userId))
            return Result.error("话题已存在");
        Topic topic = new Topic();
        topic.setName(name.trim());
        topic.setUserId(userId);
        topic.setEnabled(true);
        topic.setSceneQuestions("[]");
        topicRepository.save(topic);
        activityService.logActivity(userId, UserActivity.TYPE_TOPIC,
            "配置话题关键词",
            "已添加监控话题——" + topic.getName(),
            topic.getId());
        return Result.success("创建成功", toMap(topic));
    }

    /** AI 生成场景问题 — 必须在 /{id} 之前，否则 generate-questions 会被当成 id */
    @PostMapping("/generate-questions")
    public Result<?> generateQuestions(@RequestHeader(value = "Authorization", required = false) String authHeader,
                                       @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");

        String topicName = (String) body.get("topicName");
        if (topicName == null || topicName.isBlank()) return Result.error("话题名称不能为空");

        @SuppressWarnings("unchecked")
        List<String> existing = (List<String>) body.getOrDefault("existing", Collections.emptyList());

        String prompt = buildQuestionGenPrompt(topicName, existing);
        try {
            String raw = llmProvider.chat(
                "你是一个市场研究专家，擅长为品牌监测设计场景问题。只返回 JSON 数组。",
                prompt
            );
            List<String> questions = parseGeneratedQuestions(raw);
            return Result.success(questions);
        } catch (Exception e) {
            return Result.error("生成失败: " + e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<?> update(@RequestHeader(value = "Authorization", required = false) String authHeader,
                            @PathVariable Long id,
                            @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");
        Topic topic = topicRepository.findById(id).orElse(null);
        if (topic == null || !topic.getUserId().equals(userId))
            return Result.error("话题不存在");
        if (body.containsKey("name")) topic.setName((String) body.get("name"));
        if (body.containsKey("enabled")) topic.setEnabled((Boolean) body.get("enabled"));
        if (body.containsKey("sceneQuestions")) {
            try { topic.setSceneQuestions(objectMapper.writeValueAsString(body.get("sceneQuestions"))); }
            catch (JsonProcessingException e) { return Result.error("场景问题格式错误"); }
        }
        topicRepository.save(topic);
        return Result.success("更新成功", toMap(topic));
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");
        Topic topic = topicRepository.findById(id).orElse(null);
        if (topic == null || !topic.getUserId().equals(userId))
            return Result.error("话题不存在");
        topicRepository.delete(topic);
        return Result.success("已删除");
    }

    @PutMapping("/{id}/toggle")
    public Result<?> toggle(@RequestHeader(value = "Authorization", required = false) String authHeader,
                            @PathVariable Long id) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录");
        Topic topic = topicRepository.findById(id).orElse(null);
        if (topic == null || !topic.getUserId().equals(userId))
            return Result.error("话题不存在");
        topic.setEnabled(!topic.getEnabled());
        topicRepository.save(topic);
        return Result.success(topic.getEnabled() ? "已启用" : "已禁用", toMap(topic));
    }

    private String buildQuestionGenPrompt(String topicName, List<String> existing) {
        StringBuilder sb = new StringBuilder();
        sb.append("你是品牌 AI 可见度分析师。用户正在监测品牌在 AI 平台上的出现率。\n\n");
        sb.append("话题：「").append(topicName).append("」\n\n");
        sb.append("请生成 8 个真实用户可能向 ChatGPT、DeepSeek、Kimi、豆包 等 AI 平台提问的场景问题。\n\n");
        sb.append("【要求】\n");
        sb.append("1. 必须与话题「").append(topicName).append("」高度相关，不要跑题\n");
        sb.append("2. 模拟真实用户的口吻和搜索习惯（口语化、直接、具体）\n");
        sb.append("3. 覆盖以下角度各 1-2 个：\n");
        sb.append("   - 排名/推荐：「XX 最好的有哪些」「XX 排行榜」\n");
        sb.append("   - 对比/选择：「A 和 B 哪个好」「XX 怎么选」\n");
        sb.append("   - 问题/痛点：「XX 有哪些坑」「XX 为什么难」\n");
        sb.append("   - 趋势/观点：「XX 未来的发展方向」「XX 值不值得」\n");
        sb.append("   - 实操/教程：「XX 怎么用」「XX 入门指南」\n");
        sb.append("4. 每个问题 10-40 字，简洁有力\n");
        if (!existing.isEmpty()) {
            sb.append("5. 不要与已有问题重复\n");
            sb.append("\n已有问题：\n");
            for (String q : existing) sb.append("- ").append(q).append("\n");
        }
        sb.append("\n只返回 JSON 字符串数组：[\"问题1\", \"问题2\", ...]");
        return sb.toString();
    }

    private List<String> parseGeneratedQuestions(String raw) {
        try {
            return objectMapper.readValue(raw.trim(), new TypeReference<List<String>>() {});
        } catch (Exception e) {
            // 尝试提取 [...] 部分
            String s = raw.trim();
            int start = s.indexOf('[');
            int end = s.lastIndexOf(']');
            if (start >= 0 && end > start) {
                try {
                    return objectMapper.readValue(s.substring(start, end + 1), new TypeReference<List<String>>() {});
                } catch (Exception ignored) {}
            }
            return Collections.emptyList();
        }
    }

    private Map<String, Object> toMap(Topic t) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", t.getId());
        map.put("name", t.getName());
        map.put("enabled", t.getEnabled());
        try { map.put("sceneQuestions", objectMapper.readValue(t.getSceneQuestions(), new TypeReference<List<String>>() {})); }
        catch (Exception e) { map.put("sceneQuestions", Collections.emptyList()); }
        map.put("createTime", t.getCreateTime() != null ? t.getCreateTime().toString() : null);
        return map;
    }
}
