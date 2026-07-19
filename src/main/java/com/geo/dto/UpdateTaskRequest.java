package com.geo.dto;

/**
 * 更新采集任务请求
 */
public class UpdateTaskRequest {

    private String name;
    private String configJson;
    private String status;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
