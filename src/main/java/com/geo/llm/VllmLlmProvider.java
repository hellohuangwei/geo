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
 * vLLM 大模型实现 — 对接 vLLM 的 OpenAI 兼容 API
 * <p>
 * vLLM 是一个高性能 LLM 推理引擎，提供 OpenAI 兼容的 REST API。
 * <pre>
 * 启动 vLLM:
 *   pip install vllm
 *   vllm serve Qwen/Qwen3-4B-Instruct --host 127.0.0.1 --port 8000
 *
 * 或者:
 *   python scripts/deploy_vllm.py all
 * </pre>
 */
@Component
@ConditionalOnProperty(name = "llm.provider", havingValue = "vllm")
public class VllmLlmProvider implements LlmProvider {

    private static final Logger log = LoggerFactory.getLogger(VllmLlmProvider.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final int maxTokens;
    private final double temperature;
    private final double topP;

    public VllmLlmProvider(
            @Value("${vllm.base-url:http://127.0.0.1:8000}") String baseUrl,
            @Value("${vllm.model:Qwen/Qwen3-4B-Instruct}") String model,
            @Value("${vllm.max-tokens:4096}") int maxTokens,
            @Value("${vllm.temperature:0.7}") double temperature,
            @Value("${vllm.top-p:0.9}") double topP) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.topP = topP;
        log.info("vLLM provider initialized: baseUrl={}, model={}, maxTokens={}", baseUrl, model, maxTokens);
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
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

            String response = restTemplate.postForObject(
                    baseUrl + "/v1/chat/completions", entity, String.class);

            if (response == null) {
                throw new RuntimeException("vLLM 返回空响应");
            }

            JsonNode root = objectMapper.readTree(response);
            String content = root.path("choices").get(0)
                    .path("message").path("content").asText();

            // 打印 token 用量
            int promptTokens = root.path("usage").path("prompt_tokens").asInt(0);
            int completionTokens = root.path("usage").path("completion_tokens").asInt(0);
            log.info("vLLM generated {} characters (prompt={} tokens, completion={} tokens)",
                    content.length(), promptTokens, completionTokens);

            return content;

        } catch (Exception e) {
            log.error("vLLM 调用失败: {}", e.getMessage());
            throw new RuntimeException(
                    "vLLM 调用失败，请确认 vLLM 已启动 (python scripts/deploy_vllm.py serve) 且模型可用", e);
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

            log.info("vLLM streaming generated {} characters", full.length());
            return full.toString();

        } catch (Exception e) {
            log.error("vLLM 流式调用失败: {}", e.getMessage());
            throw new RuntimeException(
                    "vLLM 流式调用失败，请确认 vLLM 已启动且模型可用", e);
        }
    }
}
