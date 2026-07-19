package com.geo.service;

import com.geo.entity.AcquisitionTask;
import java.util.List;
import java.util.Map;

/**
 * 平台自动化采集接口，每个平台（抖音/小红书/快手等）各自实现
 */
public interface PlatformAutomationService {

    /** 平台标识 */
    String getPlatform();

    /** 执行采集，返回原始评论数据 */
    List<Map<String, Object>> execute(AcquisitionTask task) throws Exception;

    /** 是否支持该平台 */
    default boolean supports(String platform) {
        return getPlatform().equalsIgnoreCase(platform);
    }
}
