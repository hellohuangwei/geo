package com.geo.service;

import com.geo.dto.IntentAnalysisResult;
import com.geo.entity.*;
import com.geo.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 评论意向批量分析服务
 * 从评论中识别潜在客户，回写意向字段并自动创建线索
 */
@Service
public class CommentAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(CommentAnalysisService.class);

    private final CapturedCommentRepository commentRepo;
    private final AcquisitionLeadRepository leadRepo;
    private final AcquisitionTaskRepository taskRepo;
    private final AcquisitionRunLogRepository logRepo;
    private final BrandProfileRepository brandProfileRepo;
    private final IntentAnalysisService intentAnalysisService;

    public CommentAnalysisService(
            CapturedCommentRepository commentRepo,
            AcquisitionLeadRepository leadRepo,
            AcquisitionTaskRepository taskRepo,
            AcquisitionRunLogRepository logRepo,
            BrandProfileRepository brandProfileRepo,
            IntentAnalysisService intentAnalysisService) {
        this.commentRepo = commentRepo;
        this.leadRepo = leadRepo;
        this.taskRepo = taskRepo;
        this.logRepo = logRepo;
        this.brandProfileRepo = brandProfileRepo;
        this.intentAnalysisService = intentAnalysisService;
    }

    /**
     * 批量分析任务下的所有未分析评论
     * @return 分析结果统计
     */
    @Transactional
    public Map<String, Object> analyzeTaskComments(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("任务不存在"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("无权访问");

        List<CapturedComment> comments = commentRepo
                .findByTaskIdAndIsIgnoredFalseAndIntentLevelIsNull(taskId);

        if (comments.isEmpty()) {
            return Map.of("message", "没有需要分析的评论", "total", 0, "analyzed", 0);
        }

        log.info("开始批量分析 taskId={}, 共 {} 条评论", taskId, comments.size());

        // 构建 business context
        Map<String, Object> context = buildBusinessContext(userId, task);

        // 更新任务状态
        task.setStatus("analyzing");
        taskRepo.save(task);
        addLog(userId, taskId, "analyzing", "开始 AI 分析 " + comments.size() + " 条评论");

        int highCount = 0, mediumCount = 0, lowCount = 0, noneCount = 0;
        int leadCreated = 0;

        for (int i = 0; i < comments.size(); i++) {
            CapturedComment comment = comments.get(i);
            try {
                IntentAnalysisResult result = intentAnalysisService
                        .analyze(comment.getContent(), context);

                // 回写到评论
                comment.setIntentLevel(result.getLevel());
                comment.setIntentScore(result.getScore());
                comment.setIntentReason(result.getReason());
                if (result.getDemandKeywords() != null) {
                    comment.setIntentKeywordsJson(toJson(result.getDemandKeywords()));
                }
                comment.setUpdateTime(LocalDateTime.now());
                commentRepo.save(comment);

                // 统计
                switch (result.getLevel()) {
                    case "high" -> highCount++;
                    case "medium" -> mediumCount++;
                    case "low" -> lowCount++;
                    default -> noneCount++;
                }

                // high/medium 自动创建线索
                if ("high".equals(result.getLevel()) || "medium".equals(result.getLevel())) {
                    if (leadRepo.findByCommentId(comment.getId()).isEmpty()) {
                        createLeadFromComment(comment);
                        comment.setLead(true);
                        commentRepo.save(comment);
                        leadCreated++;
                    }
                }

                // 每 10 条输出一次进度
                if ((i + 1) % 10 == 0) {
                    log.info("分析进度: {}/{}", i + 1, comments.size());
                }

            } catch (Exception e) {
                log.error("分析评论 #{} 失败: {}", comment.getId(), e.getMessage());
                comment.setIntentLevel("none");
                comment.setIntentScore(0);
                comment.setIntentReason("分析失败: " + e.getMessage());
                commentRepo.save(comment);
                noneCount++;
            }
        }

        // 更新任务统计
        updateTaskStats(task, highCount, mediumCount, lowCount, leadCreated);
        task.setStatus("completed");
        task.setLastRunAt(LocalDateTime.now());
        taskRepo.save(task);

        addLog(userId, taskId, "completed", String.format(
                "AI 分析完成: high=%d, medium=%d, low=%d, none=%d, 创建线索=%d",
                highCount, mediumCount, lowCount, noneCount, leadCreated));

        return Map.of(
                "total", comments.size(),
                "analyzed", comments.size(),
                "high", highCount,
                "medium", mediumCount,
                "low", lowCount,
                "none", noneCount,
                "leadsCreated", leadCreated
        );
    }

    /**
     * 异步批量分析（不阻塞 HTTP 请求）
     */
    @Async("acquisitionTaskExecutor")
    public void analyzeTaskCommentsAsync(Long userId, Long taskId) {
        try {
            analyzeTaskComments(userId, taskId);
        } catch (Exception e) {
            log.error("异步分析任务 #{} 失败: {}", taskId, e.getMessage(), e);
            AcquisitionTask task = taskRepo.findById(taskId).orElse(null);
            if (task != null) {
                task.setStatus("failed");
                taskRepo.save(task);
            }
            addLog(userId, taskId, "failed", "批量分析失败: " + e.getMessage());
        }
    }

    /**
     * 单条评论重新分析
     */
    @Transactional
    public Map<String, Object> analyzeSingleComment(Long userId, Long commentId) {
        CapturedComment comment = commentRepo.findById(commentId)
                .orElseThrow(() -> new RuntimeException("评论不存在"));
        if (!comment.getUserId().equals(userId)) throw new RuntimeException("无权访问");

        AcquisitionTask task = taskRepo.findById(comment.getTaskId()).orElse(null);
        Map<String, Object> context = buildBusinessContext(userId, task);

        IntentAnalysisResult result = intentAnalysisService
                .analyze(comment.getContent(), context);

        comment.setIntentLevel(result.getLevel());
        comment.setIntentScore(result.getScore());
        comment.setIntentReason(result.getReason());
        if (result.getDemandKeywords() != null) {
            comment.setIntentKeywordsJson(toJson(result.getDemandKeywords()));
        }
        comment.setUpdateTime(LocalDateTime.now());
        commentRepo.save(comment);

        // 如果之前不是线索但现在 high/medium，自动创建
        if (!comment.isLead() && ("high".equals(result.getLevel()) || "medium".equals(result.getLevel()))) {
            if (leadRepo.findByCommentId(commentId).isEmpty()) {
                createLeadFromComment(comment);
                comment.setLead(true);
                commentRepo.save(comment);
            }
        }

        return Map.of(
                "commentId", commentId,
                "level", result.getLevel(),
                "score", result.getScore(),
                "reason", result.getReason(),
                "demandKeywords", result.getDemandKeywords(),
                "isLead", comment.isLead()
        );
    }

    /**
     * 获取任务的意向分布统计
     */
    public Map<String, Object> getIntentStats(Long userId, Long taskId) {
        AcquisitionTask task = taskRepo.findById(taskId)
                .orElseThrow(() -> new RuntimeException("任务不存在"));
        if (!task.getUserId().equals(userId)) throw new RuntimeException("无权访问");

        long total = commentRepo.countByUserIdAndIsIgnoredFalse(userId);
        long analyzed = total - commentRepo
                .findByTaskIdAndIsIgnoredFalseAndIntentLevelIsNull(taskId).size();
        long high = commentRepo.countByTaskIdAndIntentLevel(taskId, "high");
        long medium = commentRepo.countByTaskIdAndIntentLevel(taskId, "medium");
        long low = commentRepo.countByTaskIdAndIntentLevel(taskId, "low");
        long none = commentRepo.countByTaskIdAndIntentLevel(taskId, "none");

        long leadsFromTask = leadRepo.findByTaskIdOrderByCreateTimeDesc(taskId).size();

        return Map.of(
                "taskId", taskId,
                "totalComments", total,
                "analyzed", analyzed,
                "unanalyzed", total - analyzed,
                "high", high,
                "medium", medium,
                "low", low,
                "none", none,
                "leadsCreated", leadsFromTask
        );
    }

    // ==================== 内部方法 ====================

    /**
     * 构建 AI 分析所需的业务上下文
     */
    private Map<String, Object> buildBusinessContext(Long userId, AcquisitionTask task) {
        Map<String, Object> context = new LinkedHashMap<>();

        BrandProfile brand = brandProfileRepo.findByUserId(userId).orElse(null);
        if (brand != null) {
            context.put("brandName", brand.getBrandName() != null ? brand.getBrandName() : "未设置");
            context.put("industryRole", brand.getIndustry() != null ? brand.getIndustry() + "行业" : "未设置");
            context.put("targetCustomer", brand.getTargetCustomers() != null ? brand.getTargetCustomers() : "未设置");
            if (brand.getDescription() != null) {
                context.put("brandDescription", brand.getDescription());
            }
            if (brand.getPainPoints() != null) {
                context.put("painPoints", brand.getPainPoints());
            }
        } else {
            context.put("brandName", "未设置品牌");
            context.put("industryRole", "未设置行业");
            context.put("targetCustomer", "未设置");
        }

        // 从任务获取关键词
        context.put("keyword", task.getCurrentKeyword() != null ? task.getCurrentKeyword() : "");

        return context;
    }

    private void createLeadFromComment(CapturedComment comment) {
        AcquisitionLead lead = new AcquisitionLead();
        lead.setUserId(comment.getUserId());
        lead.setTaskId(comment.getTaskId());
        lead.setCommentId(comment.getId());
        lead.setPlatform(comment.getPlatform());
        lead.setSourceVideoUrl(comment.getVideoUrl());
        lead.setSourceVideoTitle(comment.getVideoTitle());
        lead.setKeyword(comment.getKeyword());
        lead.setNickname(comment.getCommenterNickname());
        lead.setPlatformUserId(comment.getCommenterPlatformId());
        lead.setCommentContent(comment.getContent());
        lead.setIntentLevel(comment.getIntentLevel());
        lead.setIntentScore(comment.getIntentScore());
        lead.setDemandKeywordsJson(comment.getIntentKeywordsJson());
        lead.setStatus("new");
        leadRepo.save(lead);

        // 更新任务线索计数
        taskRepo.findById(comment.getTaskId()).ifPresent(task -> {
            task.setLeadCount(task.getLeadCount() + 1);
            taskRepo.save(task);
        });
    }

    private void updateTaskStats(AcquisitionTask task, int high, int medium, int low, int leadCount) {
        task.setAnalyzedCommentCount(task.getAnalyzedCommentCount() + high + medium + low);
        // leadCount 已在 createLeadFromComment 中累加
    }

    private void addLog(Long userId, Long taskId, String status, String message) {
        AcquisitionRunLog logEntry = new AcquisitionRunLog();
        logEntry.setUserId(userId);
        logEntry.setTaskId(taskId);
        logEntry.setStatus(status);
        logEntry.setMessage(message);
        logRepo.save(logEntry);
    }

    @SuppressWarnings("unchecked")
    private String toJson(List<String> list) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(list);
        } catch (Exception e) {
            return "[]";
        }
    }
}
