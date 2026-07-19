package com.geo.controller;

import com.geo.service.DouyinScreenAutomationService;
import com.geo.util.Result;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/douyin/acquisition")
public class DouyinAcquisitionController {

    private final DouyinScreenAutomationService screenAutomationService;

    public DouyinAcquisitionController(DouyinScreenAutomationService screenAutomationService) {
        this.screenAutomationService = screenAutomationService;
    }

    @PostMapping("/tasks/{taskId}/run")
    public Result<?> runTask(@PathVariable String taskId,
                             @RequestBody Map<String, Object> body) {
        String keyword = stringValue(body.get("keyword"));
        String searchUrl = stringValue(body.get("searchUrl"));

        DouyinScreenAutomationService.RunResult runResult = screenAutomationService.run(taskId, keyword, searchUrl, body);

        List<String> fallbackSteps = List.of(
                "打开抖音首页，聚焦顶部搜索栏",
                "输入搜索关键词：" + (keyword.isBlank() ? "未设置关键词" : keyword),
                "进入搜索结果页：" + (searchUrl.isBlank() ? "https://www.douyin.com/" : searchUrl),
                "通过图标模板匹配搜索结果中的视频卡片",
                "匹配成功后触发系统鼠标点击事件",
                "进入每个视频详情页后打开评论区",
                "等待评论区加载，滚动评论列表采集评论",
                "抽取评论用户、抖音号、评论内容、点赞数、回复数和来源视频",
                "把评论返回前端，由前端规则分析意向并沉淀客户"
        );

        Map<String, Object> data = Map.of(
                "executorConnected", runResult.executorConnected(),
                "message", runResult.message(),
                "taskId", taskId,
                "searchUrl", searchUrl,
                "steps", runResult.steps().isEmpty() ? fallbackSteps : runResult.steps(),
                "comments", runResult.comments()
        );

        return Result.success(runResult.executorConnected() ? "自动采集执行器已运行" : "自动采集执行器待校准", data);
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
