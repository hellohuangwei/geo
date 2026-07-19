package com.geo.dto;

import java.util.List;

/**
 * AI 意向分析结果
 */
public class IntentAnalysisResult {

    private String level;    // high, medium, low, none
    private int score;       // 0-100
    private String reason;
    private List<String> demandKeywords;

    public IntentAnalysisResult() {}

    public IntentAnalysisResult(String level, int score, String reason, List<String> demandKeywords) {
        this.level = level;
        this.score = score;
        this.reason = reason;
        this.demandKeywords = demandKeywords;
    }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public List<String> getDemandKeywords() { return demandKeywords; }
    public void setDemandKeywords(List<String> demandKeywords) { this.demandKeywords = demandKeywords; }
}
