package com.geo.dto;

/**
 * 创建采集任务请求
 */
public class CreateTaskRequest {

    private String name;
    private String platform = "douyin";
    private String configJson = "{}";

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
