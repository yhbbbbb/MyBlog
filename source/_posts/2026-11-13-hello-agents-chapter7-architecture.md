---
title: Hello-Agents 第七章（一）：从零设计智能体框架
date: 2026-11-13 10:00:00
updated: 2026-11-13 10:00:00
categories:
  - 技术科普
tags:
  - Hello-Agents
  - Agent
  - LLM
  - Python
  - 框架设计
series: hello-agents
description: 记录 Hello-Agents 第七章的框架设计动机、分层架构、统一 LLM 接口与本地模型接入。
---

{% cq %}
真正理解 Agent，不只是会调用框架，而是知道框架为什么这样组织代码。
{% endcq %}

## 一、为什么要自己构建 Agent 框架

第七章的任务不是再学习一个现成框架，而是从零开始搭建一个轻量的 HelloAgents。目标不是和 LangChain、AutoGen 等成熟框架比功能数量，而是把智能体运行时拆开，让我们看清每个组件的职责。

成熟框架通常会遇到四类问题：

| 问题 | 具体表现 | 对学习和开发的影响 |
| --- | --- | --- |
| 抽象层过多 | 完成一个简单调用需要理解 Chain、Memory、Retriever、Tool 等多个对象 | 初学者难以定位真正执行模型调用的代码 |
| API 变化快 | 版本升级后类名、参数和导入路径变化 | 示例代码容易失效，维护成本增加 |
| 内部逻辑黑盒化 | 工具选择、消息拼接和重试逻辑被封装 | 出问题时只能反复查文档 |
| 依赖关系复杂 | 一个小项目需要安装大量依赖 | 容易出现版本冲突和环境膨胀 |

自建框架的价值在于把“使用者”变成“构建者”。当我亲手实现模型客户端、消息对象、Agent 基类和工具注册表时，才会知道一个 Agent 的最小闭环到底是什么：

1. 接收用户输入。
2. 组织系统提示词和历史消息。
3. 调用语言模型。
4. 判断是否需要工具。
5. 执行工具并把结果写回上下文。
6. 在满足终止条件后返回结果。

## 二、HelloAgents 的四个设计理念

### 2.1 轻量级与教学友好

HelloAgents 把核心代码拆成可理解的小模块，尽量只依赖 OpenAI SDK、Pydantic 和少量工具库。依赖越少，越容易从异常堆栈反查真实原因。

### 2.2 基于标准 API

HelloAgents 选择兼容 OpenAI 风格的接口。这样做的好处是，切换 OpenAI、ModelScope、Ollama 或 vLLM 时，Agent 层不需要重写，只修改模型客户端的配置。

### 2.3 渐进式学习

框架按章节递进。先实现统一模型调用，再加入 Message、Config 和 Agent 基类，最后扩展 ReAct、Reflection、Plan-and-Solve 与工具系统。每一步都建立在上一层接口之上。

### 2.4 万物皆为工具

HelloAgents 用一个非常简化的观点统一扩展能力：除了 Agent 核心循环之外，Memory、RAG、MCP、数据库查询和搜索服务都可以视作工具。

这种做法适合教学，因为调用边界很清楚：

- Agent 负责决定“什么时候调用”。
- Tool 负责完成“具体做什么”。
- 工具结果以统一格式回到 Agent。

但在生产系统中，Memory 和 RAG 往往还需要独立的生命周期、权限、索引和可观测性。因此“万物皆为工具”适合作为统一入口，不代表所有模块的内部实现都应该真的写成一个函数。

## 三、框架整体架构

课程给出的目录体现了分层解耦：

```text
hello-agents/
├── hello_agents/
│   ├── core/
│   │   ├── agent.py          # Agent 抽象基类
│   │   ├── llm.py            # 统一模型接口
│   │   ├── message.py        # 消息对象
│   │   ├── config.py         # 全局配置
│   │   └── exceptions.py     # 自定义异常
│   ├── agents/
│   │   ├── simple_agent.py
│   │   ├── react_agent.py
│   │   ├── reflection_agent.py
│   │   └── plan_solve_agent.py
│   └── tools/
│       ├── base.py
│       ├── registry.py
│       ├── chain.py
│       ├── async_executor.py
│       └── builtin/
└── tests/
```

这套结构可以理解成三层：

1. `core` 是稳定底座，负责消息、配置、模型和生命周期。
2. `agents` 是行为层，负责不同的智能体范式。
3. `tools` 是能力层，负责让 Agent 访问外部世界。

{% mermaid %}
flowchart TB
    U["🔵 用户请求"] --> L["🟣 LLM 适配层<br>统一 Provider"]
    L --> C["🍑 Core<br>Message + Config"]
    C --> A["🟡 Agent 层<br>推理循环"]
    A --> T["🟠 Tool 层<br>外部能力"]
    T --> R["🟢 结果与日志"]
    style U fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style L fill:#E8D5F5,stroke:#CE93D8,color:#333
    style C fill:#FFDAB9,stroke:#FFB74D,color:#333
    style A fill:#FFF9C4,stroke:#F9A825,color:#333
    style T fill:#FFDAB9,stroke:#FFB74D,color:#333
    style R fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

## 四、先运行一个最小 Agent

安装第七章对应版本：

```bash
# Python 版本需要 3.10 或更高
pip install "hello-agents==0.1.1"
pip install python-dotenv
```

在项目根目录准备 `.env`。下面的变量名只作为示例，真实密钥不要提交到 Git：

```dotenv
# OpenAI 兼容服务的 API 密钥
OPENAI_API_KEY=your-api-key

# 可选：指定模型名称
LLM_MODEL_ID=gpt-4o-mini

# 可选：指定兼容服务地址
# LLM_BASE_URL=https://api.openai.com/v1
```

最小调用程序如下：

```python
# quick_start.py
from dotenv import load_dotenv
from hello_agents import SimpleAgent, HelloAgentsLLM

# 从当前目录的 .env 读取 API 密钥等配置。
load_dotenv()

# provider="auto" 时，框架会根据环境变量自动判断服务商。
llm = HelloAgentsLLM(provider="auto")

# Agent 只关心“如何对话”，不需要知道底层服务商是谁。
agent = SimpleAgent(
    name="AI助手",
    llm=llm,
    system_prompt="你是一个有帮助、讲事实、会说明不确定性的 AI 助手。",
)

response = agent.run("请用三句话解释什么是 Agent。")
print(response)
```

运行：

```bash
python quick_start.py
```

如果出现密钥缺失、模型不存在或连接失败，优先检查 `.env` 是否被正确加载，再检查 `provider` 和 `base_url` 是否匹配。

## 五、扩展 HelloAgentsLLM 支持新的模型供应商

### 5.1 为什么使用继承扩展

直接修改已安装的框架源码会导致升级困难。更稳妥的方式是继承 `HelloAgentsLLM`，只重写新供应商需要变化的部分，其余行为交给父类。

下面是课程中使用 ModelScope 的完整示例：

```python
# my_llm.py
import os
from typing import Optional

from openai import OpenAI
from hello_agents import HelloAgentsLLM


class MyLLM(HelloAgentsLLM):
    """通过继承为 HelloAgents 增加 ModelScope Provider。"""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        provider: Optional[str] = "auto",
        **kwargs,
    ):
        # 只拦截自定义的 modelscope，其余 Provider 交给父类。
        if provider == "modelscope":
            print("正在使用自定义的 ModelScope Provider")

            self.provider = "modelscope"
            self.api_key = api_key or os.getenv("MODELSCOPE_API_KEY")
            self.base_url = (
                base_url
                or "https://api-inference.modelscope.cn/v1/"
            )

            # 在客户端创建前就验证凭证，避免运行到请求阶段才失败。
            if not self.api_key:
                raise ValueError(
                    "请设置 MODELSCOPE_API_KEY 环境变量。"
                )

            # 允许调用方传入模型，否则使用环境变量或默认模型。
            self.model = (
                model
                or os.getenv("LLM_MODEL_ID")
                or "Qwen/Qwen2.5-VL-72B-Instruct"
            )
            self.temperature = kwargs.get("temperature", 0.7)
            self.max_tokens = kwargs.get("max_tokens")
            self.timeout = kwargs.get("timeout", 60)

            # ModelScope 兼容 OpenAI SDK，因此只需替换 base_url。
            self._client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=self.timeout,
            )
        else:
            # OpenAI 等内置 Provider 仍使用父类逻辑。
            super().__init__(
                model=model,
                api_key=api_key,
                base_url=base_url,
                provider=provider,
                **kwargs,
            )
```

对应配置：

```dotenv
# .env
MODELSCOPE_API_KEY=your-modelscope-api-key
LLM_MODEL_ID=Qwen/Qwen2.5-VL-72B-Instruct
```

调用代码：

```python
# my_main.py
from dotenv import load_dotenv
from my_llm import MyLLM

# 先加载环境变量，再实例化模型客户端。
load_dotenv()

# 明确指定自定义 Provider。
llm = MyLLM(provider="modelscope")

messages = [
    {"role": "user", "content": "你好，请介绍一下你自己。"}
]

# think() 返回流式结果，逐块打印可以实现打字效果。
response_stream = llm.think(messages)

print("ModelScope Response:")
for chunk in response_stream:
    # 如果 think() 内部已经打印，这里只需要消费迭代器。
    # print(chunk, end="", flush=True)
    pass
```

继承扩展的关键是“只处理差异”。如果新供应商仍然兼容 OpenAI API，就不需要重写消息格式、Agent 逻辑和工具系统。

## 六、本地模型：vLLM 与 Ollama

### 6.1 vLLM

vLLM 面向高吞吐推理，适合 GPU 服务器和并发请求。它通过 PagedAttention、连续批处理等机制提高显存利用率。

安装与启动：

```bash
pip install vllm

# 启动 OpenAI 兼容服务
python -m vllm.entrypoints.openai.api_server ^
    --model Qwen/Qwen2.5-7B-Instruct ^
    --host 0.0.0.0 ^
    --port 8000
```

Windows 下如果使用 PowerShell，可以将命令写成一行：

```powershell
python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct --host 0.0.0.0 --port 8000
```

连接本地 vLLM：

```python
from hello_agents import HelloAgentsLLM

llm = HelloAgentsLLM(
    provider="vllm",
    base_url="http://localhost:8000/v1",
    api_key="EMPTY",
    model="Qwen/Qwen2.5-7B-Instruct",
)
```

### 6.2 Ollama

Ollama 更适合个人电脑快速运行本地模型。安装客户端后：

```bash
ollama run llama3
```

Ollama 默认暴露 `http://localhost:11434/v1`：

```python
from hello_agents import HelloAgentsLLM

llm = HelloAgentsLLM(
    provider="ollama",
    base_url="http://localhost:11434/v1",
    api_key="ollama",
    model="llama3",
)
```

### 6.3 三种部署方式的选择

| 方案 | 适合人群 | 优点 | 局限 |
| --- | --- | --- | --- |
| 云端 API | 快速验证、无 GPU 用户 | 上手快、模型强、无需维护 | 有调用成本、数据需出网 |
| vLLM | GPU 服务器、团队服务 | 吞吐高、兼容 OpenAI、适合并发 | 部署复杂、显存要求高 |
| Ollama | 个人学习、本地 Demo | 安装简单、模型管理方便 | 高并发和大模型能力有限 |

选择顺序应该是：先用云端 API 验证业务，再用 Ollama 完成本地学习，最后根据并发、隐私和成本决定是否使用 vLLM。

## 七、自动检测 Provider 的工程思路

自动检测通常有三个优先级：

1. 显式传入 `provider`，优先级最高。
2. 根据 `LLM_BASE_URL` 判断本地 vLLM、Ollama 或其他兼容服务。
3. 最后根据环境变量密钥推断云端 Provider。

例如同时设置：

```dotenv
OPENAI_API_KEY=xxx
LLM_BASE_URL=http://localhost:11434/v1
```

如果框架把 `LLM_BASE_URL` 的判断放在密钥判断前，最终应选择本地 Ollama；如果先检查 `OPENAI_API_KEY`，就会错误地把请求发往 OpenAI。自动检测的核心不是“猜得准”，而是优先级稳定、可解释，并允许用户显式覆盖。

建议把检测逻辑写成纯函数并测试：

```python
def detect_provider(
    explicit_provider: str | None,
    base_url: str | None,
    openai_key: str | None,
) -> str:
    """按照显式配置 > 地址特征 > 密钥的顺序选择 Provider。"""
    if explicit_provider and explicit_provider != "auto":
        return explicit_provider

    if base_url:
        lowered = base_url.lower()
        if "11434" in lowered or "ollama" in lowered:
            return "ollama"
        if "8000" in lowered or "vllm" in lowered:
            return "vllm"

    if openai_key:
        return "openai"

    raise ValueError("没有足够的配置判断模型 Provider")
```

## 八、这一篇的回顾

第七章的第一步不是写 Agent，而是先确定边界：

- 框架核心层不应该依赖具体业务。
- Agent 层只负责推理循环和状态更新。
- 工具层负责外部能力和权限边界。
- 模型客户端负责供应商差异。
- 自动检测必须允许显式配置覆盖。

## 参考资料

- Datawhale《Hello-Agents》第七章：构建你的 Agent 框架
- [HelloAgents GitHub](https://github.com/jjyaoao/helloagents)
- [vLLM 官方文档](https://docs.vllm.ai/)
- [Ollama 官方文档](https://ollama.com/)

