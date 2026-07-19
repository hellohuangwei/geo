package com.geo.service;

import com.geo.entity.AcquisitionLead;
import com.geo.entity.AcquisitionRunLog;
import com.geo.entity.AcquisitionTask;
import com.geo.entity.CapturedComment;

import java.util.List;

/**
 * 采集编排服务接口
 */
public interface AcquisitionService {

    // --- 任务管理 ---
    AcquisitionTask createTask(Long userId, String name, String platform, String configJson);
    AcquisitionTask updateTask(Long userId, Long taskId, String name, String configJson);
    void deleteTask(Long userId, Long taskId);
    AcquisitionTask runTask(Long userId, Long taskId);
    void pauseTask(Long userId, Long taskId);
    List<AcquisitionTask> getTasksByUser(Long userId);
    List<AcquisitionTask> getTasksByUserAndPlatform(Long userId, String platform);

    // --- 评论管理 ---
    List<CapturedComment> getCommentsByTask(Long userId, Long taskId);
    java.util.Map<String, Object> getCommentsByTaskPaged(Long userId, Long taskId, int page, int size);
    java.util.Map<String, Object> getCommentsByTaskPaged(Long userId, Long taskId, String keyword, int page, int size);
    java.util.Map<String, Object> searchComments(Long userId, Long taskId, String keyword, String search, int page, int size);
    AcquisitionLead addLeadFromComment(Long userId, Long commentId);
    List<AcquisitionLead> batchAddLeadsFromComments(Long userId, List<Long> commentIds);
    void ignoreComment(Long userId, Long commentId);

    // --- 客户管理 ---
    List<AcquisitionLead> getLeadsByUser(Long userId);
    List<AcquisitionLead> getLeadsByTask(Long userId, Long taskId);
    AcquisitionLead updateLead(Long userId, Long leadId, String status, String note);

    // --- 日志 ---
    List<AcquisitionRunLog> getLogsByTask(Long userId, Long taskId);

    // --- 统计 ---
    java.util.Map<String, Object> getStats(Long userId);
}
