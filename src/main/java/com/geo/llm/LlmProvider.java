package com.geo.llm;

import java.util.function.Consumer;

/**
 * 大模型抽象接口，支持接入不同后端（Ollama / OpenAI / Claude）
 */
public interface LlmProvider {

    /**
     * 发送 prompt 并获取生成文本
     *
     * @param systemPrompt 系统提示词
     * @param userPrompt   用户提示词
     * @return 生成的文本
     */
    String chat(String systemPrompt, String userPrompt);

    /**
     * 流式 chat，每收到一个 token 回调 consumer
     *
     * @param systemPrompt 系统提示词
     * @param userPrompt   用户提示词
     * @param onToken      每个 token 的回调
     * @return 完整生成文本
     */
    default String chatStream(String systemPrompt, String userPrompt, Consumer<String> onToken) {
        String result = chat(systemPrompt, userPrompt);
        onToken.accept(result);
        return result;
    }
}
