package com.geo.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * DeepSeek 大模型实现 — 对接 DeepSeek API (OpenAI 兼容)。
 * <p>
 * DeepSeek 提供 OpenAI 兼容的 REST API，使用标准的 messages 格式。
 * <pre>
 * API 文档: https://platform.deepseek.com/api-docs
 * 默认端点: https://api.deepseek.com/v1/chat/completions
 *
 * 配置示例 (application.properties):
 *   llm.provider=deepseek
 *   deepseek.api-key=sk-xxxx
 *   deepseek.model=deepseek-chat
 * </pre>
 */
@Component
@ConditionalOnProperty(name = "llm.provider", havingValue = "deepseek")
public class DeepSeekLlmProvider implements LlmProvider {

    private static final Logger log = LoggerFactory.getLogger(DeepSeekLlmProvider.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final int maxTokens;
    private final double temperature;
    private final double topP;

    public DeepSeekLlmProvider(
            @Value("${deepseek.api-key}") String apiKey,
            @Value("${deepseek.base-url:https://api.deepseek.com}") String baseUrl,
            @Value("${deepseek.model:deepseek-chat}") String model,
            @Value("${deepseek.max-tokens:16384}") int maxTokens,
            @Value("${deepseek.temperature:0.7}") double temperature,
            @Value("${deepseek.top-p:0.9}") double topP) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.topP = topP;
        log.info("DeepSeek provider: baseUrl={}, model={}, maxTokens={}", baseUrl, model, maxTokens);
    }

    @Override
    public String chat(String systemPrompt, String userPrompt) {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
        );

        Map<String, Object> request = Map.of(
                "model", model,
                "messages", messages,
                "temperature", temperature,
                "top_p", topP,
                "max_tokens", maxTokens,
                "stream", false
        );

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

            String response = restTemplate.postForObject(
                    baseUrl + "/v1/chat/completions", entity, String.class);

            if (response == null) {
                throw new RuntimeException("DeepSeek 返回空响应");
            }

            JsonNode root = objectMapper.readTree(response);
            String content = root.path("choices").get(0)
                    .path("message").path("content").asText();

            // 打印 token 用量
            int promptTokens = root.path("usage").path("prompt_tokens").asInt(0);
            int completionTokens = root.path("usage").path("completion_tokens").asInt(0);
            log.info("DeepSeek generated {} characters (prompt={} tokens, completion={} tokens)",
                    content.length(), promptTokens, completionTokens);

            return content;

        } catch (Exception e) {
            log.error("DeepSeek 调用失败: {}", e.getMessage());
            throw new RuntimeException(
                    "DeepSeek 调用失败，请确认 API Key 有效且网络可达", e);
        }
    }

    @Override
    public String chatStream(String systemPrompt, String userPrompt, Consumer<String> onToken) {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
        );

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", messages,
                "temperature", temperature,
                "top_p", topP,
                "max_tokens", maxTokens,
                "stream", true
        );

        try {
            byte[] json = objectMapper.writeValueAsBytes(body);
            HttpURLConnection conn = (HttpURLConnection)
                    URI.create(baseUrl + "/v1/chat/completions").toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(300000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(json);
            }

            StringBuilder full = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    // SSE 格式: "data: {...}"
                    if (!line.startsWith("data: ")) continue;
                    String data = line.substring(6);
                    if ("[DONE]".equals(data)) break;

                    try {
                        JsonNode node = objectMapper.readTree(data);
                        JsonNode choices = node.path("choices");
                        if (choices.size() > 0) {
                            String token = choices.get(0).path("delta").path("content").asText("");
                            if (!token.isEmpty()) {
                                full.append(token);
                                onToken.accept(token);
                            }
                        }
                    } catch (Exception ignored) {
                        // 忽略解析错误的行
                    }
                }
            }

            log.info("DeepSeek streaming generated {} characters", full.length());
            return full.toString();

        } catch (Exception e) {
            log.error("DeepSeek 流式调用失败: {}", e.getMessage());
            throw new RuntimeException(
                    "DeepSeek 流式调用失败，请确认 API Key 有效且网络可达", e);
        }
    }
}
