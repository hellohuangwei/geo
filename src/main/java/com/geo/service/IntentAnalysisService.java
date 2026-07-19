package com.geo.service;

import com.geo.dto.IntentAnalysisResult;

import java.util.Map;

/**
 * AI 意向分析服务接口
 */
public interface IntentAnalysisService {

    /**
     * 分析单条评论的客户意向
     * @param commentContent 评论内容
     * @param context 上下文信息（行业、关键词、品牌等）
     * @return 意向分析结果
     */
    IntentAnalysisResult analyze(String commentContent, Map<String, Object> context);
}
