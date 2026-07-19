package com.geo.dto;

/**
 * 更新客户线索请求
 */
public class UpdateLeadRequest {

    private String status;
    private String note;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
