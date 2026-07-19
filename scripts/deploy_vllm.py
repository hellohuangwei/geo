"""
vLLM 推理服务启动脚本 — 使用本地 Qwen3 GGUF 模型
用法:
    pip install vllm
    python scripts/deploy_vllm.py
"""
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ═══════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════
MODEL_PATH = PROJECT_ROOT / "models" / "qwen3-8b-q4_k_m.gguf"  # 本地 GGUF 文件
VLLM_HOST = "127.0.0.1"
VLLM_PORT = 8000
GPU_MEMORY = 0.9          # GPU 显存利用率
MAX_MODEL_LEN = 40960     # Qwen3 原生支持 40960 上下文


def main():
    if not MODEL_PATH.exists():
        print(f"❌ 模型文件不存在: {MODEL_PATH}")
        print(f"   请确认 models/qwen3-8b-q4_k_m.gguf 已就位")
        sys.exit(1)

    print(f"模型: {MODEL_PATH} ({MODEL_PATH.stat().st_size / 1e9:.1f} GB)")
    print(f"地址: http://{VLLM_HOST}:{VLLM_PORT}")

    cmd = [
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--model", str(MODEL_PATH),
        "--host", VLLM_HOST,
        "--port", str(VLLM_PORT),
        "--gpu-memory-utilization", str(GPU_MEMORY),
        "--max-model-len", str(MAX_MODEL_LEN),
        "--trust-remote-code",
    ]

    print(f"\n启动 vLLM 服务...")
    print(f"  {' '.join(cmd)}")
    print(f"\n就绪后 Spring Boot 自动对接: http://{VLLM_HOST}:{VLLM_PORT}/v1/chat/completions")
    print(f"按 Ctrl+C 停止\n")

    subprocess.run(cmd)


if __name__ == "__main__":
    main()
