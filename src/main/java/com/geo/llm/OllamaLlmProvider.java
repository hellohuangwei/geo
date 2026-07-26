package com.geo.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
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
import java.util.Map;
import java.util.function.Consumer;

@Component
@ConditionalOnProperty(name = "llm.provider", havingValue = "ollama")
public class OllamaLlmProvider implements LlmProvider {

    private static final Logger log = LoggerFactory.getLogger(OllamaLlmProvider.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final String keepAlive;
    private final boolean warmup;

    public OllamaLlmProvider(
            @Value("${ollama.base-url:http://localhost:11434}") String baseUrl,
            @Value("${ollama.model:qwen3}") String model,
            @Value("${ollama.keep-alive:0}") String keepAlive,
            @Value("${ollama.warmup:true}") boolean warmup) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
        this.model = model;
        this.keepAlive = keepAlive;
        this.warmup = warmup;
        log.info("Ollama provider: baseUrl={}, model={}, keepAlive={}", baseUrl, model, keepAlive);
    }

    /** 启动时预热，后续请求秒级响应 */
    @PostConstruct
    public void warmupModel() {
        if (!warmup) return;
        log.info("预热模型 {} ...", model);
        long start = System.currentTimeMillis();
        try {
            Map<String, Object> req = Map.of(
                    "model", model, "prompt", "ping",
                    "stream", false, "keep_alive", keepAlive,
                    "options", Map.of("num_predict", 1));
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.APPLICATION_JSON);
            restTemplate.postForObject(baseUrl + "/api/generate", new HttpEntity<>(req, h), String.class);
            log.info("预热完成 ({}s)，模型常驻内存", (System.currentTimeMillis() - start) / 1000);
        } catch (Exception e) {
            log.warn("预热失败: {}。请确认 Ollama 已启动且已安装模型 {}", e.getMessage(), model);
        }
    }

    private Map<String, Object> buildOptions() {
        // temperature 采样保持话题跟随性（mirostat 容易导致话题漂移）
        return Map.of("temperature", 0.7, "top_p", 0.9, "num_predict", 16384);
    }

    /** 文章生成专用 — 高 token 预算 + 温和采样确保话题不漂 */
    private Map<String, Object> buildOptionsForGenerate() {
        return Map.of("temperature", 0.7, "top_p", 0.9, "num_predict", 16384);
    }

    @Override
    public String chat(String systemPrompt, String userPrompt) {
        Map<String, Object> request = Map.of(
                "model", model,
                "prompt", systemPrompt + "\n\n" + userPrompt,
                "stream", false,
                "keep_alive", keepAlive,
                "options", buildOptionsForGenerate());

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            String response = restTemplate.postForObject(
                    baseUrl + "/api/generate", new HttpEntity<>(request, headers), String.class);
            if (response == null) throw new RuntimeException("Ollama 返回空响应");

            JsonNode node = objectMapper.readTree(response);
            String text = node.get("response").asText();
            log.info("Ollama 生成 {} 字符", text.length());
            return text;
        } catch (Exception e) {
            log.error("Ollama 调用失败: {}", e.getMessage());
            throw new RuntimeException("Ollama 调用失败", e);
        }
    }

    @Override
    public String chatStream(String systemPrompt, String userPrompt, Consumer<String> onToken) {
        Map<String, Object> body = Map.of(
                "model", model,
                "prompt", systemPrompt + "\n\n" + userPrompt,
                "stream", true,
                "keep_alive", keepAlive,
                "options", buildOptions());

        try {
            byte[] json = objectMapper.writeValueAsBytes(body);
            HttpURLConnection conn = (HttpURLConnection) URI.create(baseUrl + "/api/generate").toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(300000);

            try (OutputStream os = conn.getOutputStream()) { os.write(json); }

            StringBuilder full = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    try {
                        JsonNode node = objectMapper.readTree(line);
                        String token = node.get("response").asText("");
                        if (!token.isEmpty()) { full.append(token); onToken.accept(token); }
                    } catch (Exception e) {
                        log.warn("Ollama SSE 行解析失败: {}", e.getMessage());
                    }
                }
            }
            log.info("Ollama 流式生成 {} 字符", full.length());
            return full.toString();
        } catch (Exception e) {
            log.error("Ollama 流式调用失败: {}", e.getMessage());
            throw new RuntimeException("Ollama 流式调用失败", e);
        }
    }
}
