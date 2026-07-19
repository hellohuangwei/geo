package com.geo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geo.dto.CreateTaskRequest;
import com.geo.dto.UpdateLeadRequest;
import com.geo.dto.UpdateTaskRequest;
import com.geo.entity.*;
import com.geo.repository.*;
import com.geo.dto.IntentAnalysisResult;
import com.geo.service.AcquisitionService;
import com.geo.service.CommentAnalysisService;
import com.geo.service.DouyinMessageService;
import com.geo.service.IntentAnalysisService;
import com.geo.service.PlatformAutomationService;
import com.geo.util.JwtUtil;
import com.geo.util.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/acquisition")
public class AcquisitionController {

    private static final Logger log = LoggerFactory.getLogger(AcquisitionController.class);

    private final AcquisitionService acquisitionService;
    private final IntentAnalysisService intentAnalysisService;
    private final JwtUtil jwtUtil;
    private final SysUserRepository userRepository;
    private final AcquisitionTaskRepository taskRepo;
    private final CapturedCommentRepository commentRepo;
    private final AcquisitionLeadRepository leadRepo;
    private final Map<String, PlatformAutomationService> platformServices;
    private final DouyinMessageService douyinMessageService;
    private final CommentAnalysisService commentAnalysisService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AcquisitionController(AcquisitionService acquisitionService,
                                  IntentAnalysisService intentAnalysisService,
                                  JwtUtil jwtUtil,
                                  SysUserRepository userRepository,
                                  AcquisitionTaskRepository taskRepo,
                                  CapturedCommentRepository commentRepo,
                                  AcquisitionLeadRepository leadRepo,
                                  List<PlatformAutomationService> platformServices,
                                  DouyinMessageService douyinMessageService,
                                  CommentAnalysisService commentAnalysisService) {
        this.acquisitionService = acquisitionService;
        this.intentAnalysisService = intentAnalysisService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.taskRepo = taskRepo;
        this.commentRepo = commentRepo;
        this.leadRepo = leadRepo;
        this.douyinMessageService = douyinMessageService;
        this.commentAnalysisService = commentAnalysisService;
        Map<String, PlatformAutomationService> map = new LinkedHashMap<>();
        for (PlatformAutomationService svc : platformServices) {
            map.put(svc.getPlatform().toLowerCase(), svc);
        }
        this.platformServices = map;
    }

    // ==================== 任务 ====================

    @GetMapping("/tasks")
    public Result<?> listTasks(@RequestHeader("Authorization") String authHeader,
                                @RequestParam(required = false) String platform) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        List<AcquisitionTask> tasks = platform != null
                ? acquisitionService.getTasksByUserAndPlatform(userId, platform)
                : acquisitionService.getTasksByUser(userId);

        return Result.success("ok", tasks);
    }

    @PostMapping("/tasks")
    public Result<?> createTask(@RequestHeader("Authorization") String authHeader,
                                 @RequestBody CreateTaskRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        AcquisitionTask task = acquisitionService.createTask(
                userId, request.getName(), request.getPlatform(), request.getConfigJson());
        return Result.success("任务已创建", task);
    }

    @PutMapping("/tasks/{taskId}")
    public Result<?> updateTask(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long taskId,
                                 @RequestBody UpdateTaskRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = acquisitionService.updateTask(
                    userId, taskId, request.getName(), request.getConfigJson());
            return Result.success("任务已更新", task);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @DeleteMapping("/tasks/{taskId}")
    public Result<?> deleteTask(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.deleteTask(userId, taskId);
            return Result.success("任务已删除", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/tasks/{taskId}/run")
    public Result<?> runTask(@RequestHeader("Authorization") String authHeader,
                              @PathVariable Long taskId,
                              @RequestBody(required = false) Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task == null) return Result.error(400, "Task not found");
            if (!task.getUserId().equals(userId)) return Result.error(403, "Access denied");

            String platformKey = task.getPlatform() != null ? task.getPlatform().toLowerCase() : "douyin";
            PlatformAutomationService platformSvc = platformServices.get(platformKey);
            if (platformSvc == null) return Result.error(400, "Unsupported platform: " + platformKey);

            Map<String, Object> config = new LinkedHashMap<>(parseConfig(task.getConfigJson()));
            String configKeyword = extractKeyword(config);
            String requestKeyword = body == null ? "" : String.valueOf(body.getOrDefault("keyword", "")).trim();
            String returnUrl = body == null ? "" : String.valueOf(body.getOrDefault("returnUrl", "")).trim();
            String keyword = !requestKeyword.isBlank() ? requestKeyword : configKeyword;
            config.put("keyword", keyword);
            if (!returnUrl.isBlank()) {
                config.put("returnUrl", returnUrl);
            }
            String searchUrl = buildSearchUrl(keyword);
            log.info("Acquisition run: taskId={}, keyword='{}', searchUrl='{}'",
                    taskId, keyword, searchUrl);

            task.setConfigJson(objectMapper.writeValueAsString(config));
            task.setCurrentKeyword(keyword);
            task.setLastSearchUrl(searchUrl);
            task.setStatus("running");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            // 同步调用平台自动化，返回所有评论
            List<Map<String, Object>> rawList = platformSvc.execute(task);
            log.info("Collected {} raw comments", rawList.size());

            // 先检查验证码标记（在去重过滤之前）
            boolean captchaDetected = rawList.stream().anyMatch(
                c -> Boolean.TRUE.equals(c.get("_captchaDetected")));

            // 去重统计 + 存库
            Set<String> seenComments = new HashSet<>();
            Set<String> seenVideos = new HashSet<>();
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> raw : rawList) {
                if (Boolean.TRUE.equals(raw.get("_captchaDetected"))) continue;
                String content = String.valueOf(raw.getOrDefault("content", ""));
                if (content.isBlank()) continue;
                String videoUrl = String.valueOf(raw.getOrDefault("videoUrl", ""));
                String nickname = String.valueOf(raw.getOrDefault("nickname", ""));
                String dedupeKey = String.join("|", videoUrl, nickname, content);
                if (!seenComments.add(dedupeKey)) continue;
                if (!videoUrl.isBlank()) seenVideos.add(videoUrl);
                result.add(raw);

                // 保存到数据库
                CapturedComment comment = new CapturedComment();
                comment.setUserId(userId);
                comment.setTaskId(taskId);
                comment.setPlatform(platformKey);
                comment.setKeyword(keyword);
                comment.setVideoUrl(videoUrl.isBlank() ? null : videoUrl);
                comment.setVideoTitle(strVal(raw.get("videoTitle"), null));
                comment.setVideoAuthorName(strVal(raw.get("videoAuthorName"), null));
                comment.setCommenterNickname(nickname);
                comment.setCommenterPlatformId(strVal(raw.get("douyinId"), null));
                comment.setCommenterAvatarUrl(strVal(raw.get("avatarUrl"), null));
                comment.setContent(content);
                comment.setLikes(raw.get("likes") instanceof Number n ? n.intValue() : 0);
                comment.setReplyCount(raw.get("replyCount") instanceof Number n ? n.intValue() : 0);
                String publishedAt = strVal(raw.get("publishedAt"), null);
                if (publishedAt != null && !publishedAt.isBlank()) {
                    try { comment.setPublishedAt(LocalDateTime.parse(publishedAt.substring(0, 19))); } catch (Exception ignored) {}
                }
                commentRepo.save(comment);
            }

            task.setAnalyzedCommentCount(task.getAnalyzedCommentCount() + result.size());
            task.setCollectedVideoCount(task.getCollectedVideoCount() + seenVideos.size());
            task.setStatus(captchaDetected ? "executor_required" : "completed");
            task.setLastRunAt(LocalDateTime.now());
            taskRepo.save(task);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("taskId", task.getId());
            data.put("keyword", keyword);
            data.put("searchUrl", searchUrl);
            data.put("commentCount", result.size());
            data.put("videoCount", seenVideos.size());
            data.put("captchaDetected", captchaDetected);
            data.put("comments", result);
            String msg = "采集完成，共 " + result.size() + " 条评论"
                + (captchaDetected ? "（检测到验证码，请去抖音页面完成验证后重试）" : "");
            return Result.success(msg, data);
        } catch (Exception e) {
            log.error("Collection failed: {}", e.getMessage(), e);
            return Result.error(500, "采集失败: " + e.getMessage());
        }
    }

    @PostMapping("/tasks/{taskId}/pause")
    public Result<?> pauseTask(@RequestHeader("Authorization") String authHeader,
                                @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.pauseTask(userId, taskId);
            return Result.success("任务已暂停", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 评论 ====================

    @GetMapping("/tasks/{taskId}/comments")
    public Result<?> getComments(@RequestHeader("Authorization") String authHeader,
                                  @PathVariable Long taskId,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "50") int size,
                                  @RequestParam(required = false) String keyword,
                                  @RequestParam(required = false) String search) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> data;
            if (search != null && !search.isBlank()) {
                data = acquisitionService.searchComments(userId, taskId, keyword, search, page, size);
            } else {
                data = acquisitionService.getCommentsByTaskPaged(userId, taskId, keyword, page, size);
            }
            return Result.success("ok", data);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/comments/{commentId}/add-lead")
    public Result<?> addLeadFromComment(@RequestHeader("Authorization") String authHeader,
                                         @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionLead lead = acquisitionService.addLeadFromComment(userId, commentId);
            return Result.success("已加入客户库", lead);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    @PostMapping("/batch-add-leads")
    public Result<?> batchAddLeadsFromComments(@RequestHeader("Authorization") String authHeader,
                                                @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("commentIds", List.of());
        List<Long> commentIds = rawIds.stream().map(Integer::longValue).toList();
        if (commentIds.isEmpty()) return Result.error(400, "请选择至少一条评论");

        List<AcquisitionLead> leads = acquisitionService.batchAddLeadsFromComments(userId, commentIds);
        return Result.success("成功加入 " + leads.size() + " 位客户，跳过 " + (commentIds.size() - leads.size()) + " 条", leads);
    }

    @PostMapping("/comments/{commentId}/ignore")
    public Result<?> ignoreComment(@RequestHeader("Authorization") String authHeader,
                                    @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            acquisitionService.ignoreComment(userId, commentId);
            return Result.success("已忽略", null);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 客户 ====================

    @GetMapping("/leads")
    public Result<?> listLeads(@RequestHeader("Authorization") String authHeader,
                                @RequestParam(required = false) Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        List<AcquisitionLead> leads = taskId != null
                ? acquisitionService.getLeadsByTask(userId, taskId)
                : acquisitionService.getLeadsByUser(userId);

        return Result.success("ok", leads);
    }

    @PostMapping("/leads/send-messages")
    public Result<?> batchSendMessages(@RequestHeader("Authorization") String authHeader,
                                        @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Integer> rawIds = (List<Integer>) body.getOrDefault("leadIds", List.of());
        String message = String.valueOf(body.getOrDefault("message", ""));
        if (rawIds.isEmpty() || message.isBlank()) {
            return Result.error(400, "leadIds 和 message 不能为空");
        }

        List<Long> leadIds = rawIds.stream().map(Integer::longValue).toList();
        List<AcquisitionLead> leads = new ArrayList<>();
        for (Long id : leadIds) {
            AcquisitionLead lead = leadRepo.findById(id).orElse(null);
            if (lead != null && lead.getUserId().equals(userId)) {
                leads.add(lead);
            }
        }

        if (leads.isEmpty()) return Result.error(400, "没有找到有效的客户");

        Map<String, Object> result = douyinMessageService.sendBatchMessages(leads, message);
        return Result.success("发送完成：" + result.get("success") + " 成功，" + result.get("failed") + " 失败", result);
    }

    @PutMapping("/leads/{leadId}")
    public Result<?> updateLead(@RequestHeader("Authorization") String authHeader,
                                 @PathVariable Long leadId,
                                 @RequestBody UpdateLeadRequest request) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionLead lead = acquisitionService.updateLead(
                    userId, leadId, request.getStatus(), request.getNote());
            return Result.success("客户已更新", lead);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 日志 ====================

    @GetMapping("/tasks/{taskId}/logs")
    public Result<?> getLogs(@RequestHeader("Authorization") String authHeader,
                              @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            List<AcquisitionRunLog> logs = acquisitionService.getLogsByTask(userId, taskId);
            return Result.success("ok", logs);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 统计 ====================

    @GetMapping("/stats")
    public Result<?> getStats(@RequestHeader("Authorization") String authHeader) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        Map<String, Object> stats = acquisitionService.getStats(userId);
        return Result.success("ok", stats);
    }

    // ==================== AI 分析 ====================

    @PostMapping("/comments/analyze")
    public Result<?> analyzeComments(@RequestHeader("Authorization") String authHeader,
                                     @RequestBody Map<String, Object> body) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> comments = (List<Map<String, Object>>) body.getOrDefault("comments", List.of());
        String keyword = String.valueOf(body.getOrDefault("keyword", ""));
        String industry = String.valueOf(body.getOrDefault("industry", ""));

        Map<String, Object> aiContext = new LinkedHashMap<>();
        aiContext.put("keyword", keyword);
        aiContext.put("industryRole", industry);

        List<Map<String, Object>> results = new ArrayList<>();
        for (Map<String, Object> c : comments) {
            String content = String.valueOf(c.getOrDefault("content", ""));
            if (content.isBlank()) {
                results.add(Map.of("content", "", "analysis", Map.of(
                    "level", "none", "score", 0, "reason", "", "demandKeywords", List.of())));
                continue;
            }
            IntentAnalysisResult analysis = intentAnalysisService.analyze(content, aiContext);
            Map<String, Object> item = new LinkedHashMap<>(c);
            item.put("analysis", Map.of(
                "level", analysis.getLevel(),
                "score", analysis.getScore(),
                "reason", analysis.getReason(),
                "demandKeywords", analysis.getDemandKeywords()
            ));
            results.add(item);
        }
        return Result.success("AI 分析完成，共 " + results.size() + " 条", Map.of("comments", results));
    }

    // ==================== 批量 AI 分析（核心新接口） ====================

    /**
     * 对任务下所有未分析评论执行 AI 意向分析
     * 同步执行（少量评论）或异步执行（大量评论）
     */
    @PostMapping("/tasks/{taskId}/analyze")
    public Result<?> analyzeTaskComments(@RequestHeader("Authorization") String authHeader,
                                         @PathVariable Long taskId,
                                         @RequestParam(defaultValue = "false") boolean async) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task == null) return Result.error(400, "任务不存在");
            if (!task.getUserId().equals(userId)) return Result.error(403, "无权访问");

            List<CapturedComment> unanalyzed = commentRepo
                    .findByTaskIdAndIsIgnoredFalseAndIntentLevelIsNull(taskId);
            if (unanalyzed.isEmpty()) {
                return Result.success("没有需要分析的评论", Map.of("total", 0, "message", "所有评论已分析"));
            }

            if (async || unanalyzed.size() > 20) {
                // 大量评论走异步，立即返回
                commentAnalysisService.analyzeTaskCommentsAsync(userId, taskId);
                return Result.success("已提交异步分析任务，共 " + unanalyzed.size() + " 条评论，稍后查看结果",
                        Map.of("total", unanalyzed.size(), "async", true));
            } else {
                // 少量评论同步执行，立即返回结果
                Map<String, Object> stats = commentAnalysisService.analyzeTaskComments(userId, taskId);
                return Result.success("AI 分析完成", stats);
            }
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    /**
     * 单条评论重新 AI 分析
     */
    @PostMapping("/comments/{commentId}/analyze")
    public Result<?> analyzeSingleComment(@RequestHeader("Authorization") String authHeader,
                                          @PathVariable Long commentId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> result = commentAnalysisService.analyzeSingleComment(userId, commentId);
            return Result.success("分析完成", result);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    /**
     * 获取任务的意向分布统计
     */
    @GetMapping("/tasks/{taskId}/intent-stats")
    public Result<?> getIntentStats(@RequestHeader("Authorization") String authHeader,
                                    @PathVariable Long taskId) {
        Long userId = getUserId(authHeader);
        if (userId == null) return Result.error(401, "未登录或 Token 无效");

        try {
            Map<String, Object> stats = commentAnalysisService.getIntentStats(userId, taskId);
            return Result.success("ok", stats);
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // ==================== 内部方法 ====================

    private Long getUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        String token = authHeader.substring(7);
        if (!jwtUtil.validateToken(token)) return null;
        String username = jwtUtil.getUsernameFromToken(token);
        SysUser user = userRepository.findByUsername(username).orElse(null);
        return user != null ? user.getId() : null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseConfig(String configJson) {
        try {
            return objectMapper.readValue(configJson, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String extractKeyword(Map<String, Object> config) {
        Object value = config.get("keyword");
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String buildSearchUrl(String keyword) {
        if (keyword == null || keyword.isBlank()) return "https://www.douyin.com/";
        return "https://www.douyin.com/search/" +
                java.net.URLEncoder.encode(keyword.trim(), java.nio.charset.StandardCharsets.UTF_8) + "?type=video";
    }

    private String strVal(Object value, String fallback) {
        if (value instanceof String s && !s.isBlank()) return s;
        if (value != null) {
            String s = value.toString().trim();
            if (!s.isEmpty()) return s;
        }
        return fallback;
    }

}
