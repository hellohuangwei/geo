package com.geo.dto;

import java.util.List;

public class ArticleGenerateRequest {

    private String topic;
    private List<String> sceneQuestions;
    private String product;
    private int articleCount;
    private String notes;

    public String getTopic() {
        return topic;
    }

    public void setTopic(String topic) {
        this.topic = topic;
    }

    public List<String> getSceneQuestions() {
        return sceneQuestions;
    }

    public void setSceneQuestions(List<String> sceneQuestions) {
        this.sceneQuestions = sceneQuestions;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public int getArticleCount() {
        return articleCount;
    }

    public void setArticleCount(int articleCount) {
        this.articleCount = articleCount;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
