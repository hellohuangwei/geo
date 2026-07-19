package com.geo.service;

import com.geo.util.Result;

public interface ActivityService {

    /** 记录一条用户活动 */
    void logActivity(Long userId, String activityType, String title, String description);

    /** 记录一条用户活动（带关联目标ID，如文章ID） */
    void logActivity(Long userId, String activityType, String title, String description, Long targetId);

    /** 获取用户最近活动列表 */
    Result<?> getRecentActivities(Long userId, int limit);
}
