---
title: Hello-Agents 第四章 4.1-4.2 学习笔记：工具调用与 ReAct 智能体
date: 2026-11-08 10:00:00
updated: 2026-11-08 10:00:00
categories:
  - AI Agent
tags:
  - Agent
  - ReAct
  - 工具调用
  - SerpApi
  - Python
  - Hello-Agents
  - 学习笔记
series: hello-agents
description: 学习 Hello-Agents 第四章 4.1 环境准备与基础工具定义、4.2 ReAct 经典范式，整理 LLM 客户端、工具注册、SerpApi 搜索和 Thought-Action-Observation 循环。
---

> **Agent 的关键不是“模型会聊天”，而是模型能在合适的时机选择一个可验证的工具，并把工具结果带回下一轮推理。**

## 开篇：为什么要给大模型接工具

大语言模型（Large Language Model，LLM）擅长根据上下文生成文本，却有两个天然边界：训练数据不是实时的，而且模型本身不能直接访问网页、数据库或本地文件。

例如，用户问“今天的天气怎么样”，模型只能根据已有知识猜测；接入搜索工具后，模型可以先发起查询，再根据返回的观测结果组织答案。**工具把模型的语言能力接到了外部世界，ReAct 则规定了这条连接如何循环运行。**

这篇笔记对应《Hello-Agents》第四章：

- **4.1 环境准备与基础工具定义**：准备 Python 环境、配置 API 密钥、封装 LLM 客户端，并定义可以注册和执行的工具。
- **4.2 ReAct 经典范式**：让模型在 `Thought`、`Action` 和 `Observation` 之间反复迭代，直到输出 `Finish`。

## 一、4.1：先把运行环境准备好

### 1. 安装依赖

建议在项目虚拟环境中安装依赖。`openai` 用于调用兼容 OpenAI Chat Completions 协议的模型，`python-dotenv` 负责读取 `.env`，`google-search-results` 提供新版 SerpApi Python 客户端。

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

pip install openai python-dotenv google-search-results
```

如果使用其他模型服务，只要它提供兼容的 Chat Completions 接口，通常只需要替换 `LLM_BASE_URL` 和 `LLM_MODEL_ID`。

### 2. 使用环境变量保存密钥

在项目根目录创建 `.env`。密钥不要写进 Python 文件，也不要提交到 Git：

```dotenv
LLM_MODEL_ID="your-model-name"
LLM_API_KEY="your-llm-api-key"
LLM_BASE_URL="https://your-provider.example.com/v1"
LLM_TIMEOUT=60 # 可以在输入时赋值
SERPAPI_API_KEY="your-serpapi-key"
```

可以提交一个不包含真实密钥的 `.env.example`，方便其他人知道需要配置哪些变量。

### 3. 配置如何流入 Agent

`load_dotenv()` 会把 `.env` 中的键值加载到当前进程。程序启动时应尽早校验必需配置，这样缺少密钥时能得到清晰错误，而不是等到网络请求失败才排查。

{% mermaid %}
flowchart LR
    ENV["🔵 .env<br>模型与工具密钥"] --> LOAD["🟣 load_dotenv<br>加载配置"]
    LOAD --> CLIENT["🟣 LLM 客户端<br>OpenAI 兼容接口"]
    LOAD --> SEARCH["🍑 SerpApi 客户端<br>网页搜索"]
    CLIENT --> AGENT["🟣 ReAct Agent"]
    SEARCH --> AGENT
    style ENV fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style LOAD fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style CLIENT fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style SEARCH fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style AGENT fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

## 二、封装一个最小 LLM 客户端

下面的客户端只做一件事：接收标准消息列表，调用模型，并把流式响应拼接成字符串。将网络调用封装起来后，ReAct 逻辑不需要关心具体模型服务商。

```python
# llm_client.py
import os
from typing import Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI


# 读取项目根目录中的 .env 文件
load_dotenv()


class HelloAgentsLLM:
    """一个面向 OpenAI 兼容接口的最小 LLM 客户端。"""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[int] = None,
    ):
        # 优先使用显式传入的参数，没有传入时再读取环境变量
        self.model = model or os.getenv("LLM_MODEL_ID")
        api_key = api_key or os.getenv("LLM_API_KEY")
        base_url = base_url or os.getenv("LLM_BASE_URL")
        timeout = timeout or int(os.getenv("LLM_TIMEOUT", "60"))

        # 配置不完整时尽早失败，避免后面出现难以定位的网络错误
        if not all([self.model, api_key, base_url]):
            raise ValueError(
                "必须提供 LLM_MODEL_ID、LLM_API_KEY 和 LLM_BASE_URL，"
                "可以通过构造参数或 .env 文件配置。"
            )

        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )

    def think(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0,
    ) -> str:
        """调用模型并返回完整文本；temperature=0 便于 ReAct 输出稳定。"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )

        chunks: List[str] = []
        for chunk in response:
            # 部分服务在结束块中没有 choices，需要跳过
            if not chunk.choices:
                continue
            content = chunk.choices[0].delta.content or ""
            print(content, end="", flush=True)
            chunks.append(content)

        print()  # 流式输出结束后换行
        return "".join(chunks)


if __name__ == "__main__":
    # 用一个最小请求验证模型配置是否正确
    llm = HelloAgentsLLM()
    answer = llm.think(
        [
            {"role": "system", "content": "你是一个 Python 助手。"},
            {"role": "user", "content": "用一句话解释什么是 Agent。"},
        ]
    )
    print("完整响应：", answer)
```

关于采样参数的含义，可以回看[上一章 3.2-3.3 笔记中的 `Temperature` 小节](/MyBlog/2026/11/07/hello-agents-chapter3-2-3/#Temperature)。这里把 `temperature` 设为 `0`，不是为了让模型“绝对正确”，而是为了降低格式随机性。ReAct 需要模型严格输出 `Action: Tool[...]` 或 `Action: Finish[...]`，格式越稳定，解析器越容易工作。

## 三、把外部能力封装成工具

### 1. 工具的最小接口

在 Agent 看来，工具不应该是一段散落在业务代码中的函数，而应该至少包含三部分：

| 组成 | 作用 | 示例 |
| --- | --- | --- |
| 名称 | 让模型选择工具 | `Search` |
| 描述 | 告诉模型何时使用 | 查询实时网页信息 |
| 函数 | 真正执行动作 | `search(query)` |

工具描述会被放进 Prompt，函数则由程序执行。**模型只能提出工具调用，是否真的执行由宿主程序决定。**

### 2. SerpApi 搜索工具

课程示例中的搜索工具调用方式发生了变化。现在使用 SerpApi Python 客户端：

```python
import serpapi

client = serpapi.Client(api_key=api_key)
results = client.search(params)
```

完整实现如下。这里优先返回搜索引擎提供的直接答案或知识图谱；没有直接答案时，再返回前三条自然搜索结果摘要，减少传给模型的无关文本。

```python
# tools.py
import os
from typing import Any, Callable, Dict

import serpapi
from dotenv import load_dotenv


# 让搜索工具可以独立运行，也可以被 ReAct.py 导入
load_dotenv()


def search(query: str) -> str:
    """使用 SerpApi 查询网页，并返回适合 LLM 阅读的摘要。"""
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        return "错误：没有配置 SERPAPI_API_KEY。"

    params = {
        "engine": "google",
        "q": query,
        "gl": "cn",       # 搜索地区：中国
        "hl": "zh-cn",    # 搜索语言：简体中文
    }

    try:
        # SerpApi 新版客户端：密钥传给 Client，参数传给 search
        client = serpapi.Client(api_key=api_key)
        results = client.search(params)

        # answer_box_list 可能包含多个直接答案片段
        if results.get("answer_box_list"):
            return "\n".join(str(item) for item in results["answer_box_list"])

        # answer_box.answer 通常是最直接的单条答案
        answer_box = results.get("answer_box", {})
        if answer_box.get("answer"):
            return str(answer_box["answer"])

        # 知识图谱适合返回实体的简短介绍
        knowledge_graph = results.get("knowledge_graph", {})
        if knowledge_graph.get("description"):
            return str(knowledge_graph["description"])

        # 没有直接答案时，只保留前三条结果的标题和摘要
        organic_results = results.get("organic_results", [])[:3]
        if organic_results:
            snippets = [
                f"[{index}] {item.get('title', '')}\n"
                f"{item.get('snippet', '')}"
                for index, item in enumerate(organic_results, start=1)
            ]
            return "\n\n".join(snippets)

        return f"没有找到关于“{query}”的有效信息。"
    except Exception as exc:
        # 工具错误也要转成字符串，让 Agent 能观察到并决定是否重试或结束
        return f"搜索时发生错误：{exc}"


class ToolExecutor:
    """保存工具元数据，并根据名称执行工具函数。"""

    def __init__(self) -> None:
        self.tools: Dict[str, Dict[str, Any]] = {}

    def register_tool(
        self,
        name: str,
        description: str,
        func: Callable[[str], str],
    ) -> None:
        """注册或覆盖一个工具。"""
        if name in self.tools:
            print(f"警告：工具 {name!r} 已存在，将被覆盖。")
        self.tools[name] = {"description": description, "func": func}

    def get_tool(self, name: str) -> Callable[[str], str] | None:
        """按名称取得工具函数；不存在时返回 None。"""
        tool = self.tools.get(name)
        return tool["func"] if tool else None

    def get_available_tools(self) -> str:
        """生成放入 ReAct Prompt 的工具清单。"""
        return "\n".join(
            f"- {name}: {info['description']}"
            for name, info in self.tools.items()
        )


if __name__ == "__main__":
    # 单独测试工具注册和调用，不需要先启动 Agent
    executor = ToolExecutor()
    executor.register_tool(
        "Search",
        "查询实时网页信息，适合回答时事和知识库之外的事实问题。",
        search,
    )
    print("可用工具：")
    print(executor.get_available_tools())
    print("\n搜索结果：")
    print(executor.get_tool("Search")("英伟达最新的 GPU 型号"))
```

这里使用 `get()` 读取 SerpApi 返回字段，是因为不同查询的响应结构可能不同。工具层统一返回字符串，ReAct 层就可以把成功结果和异常信息都当作 `Observation` 处理。

### 3. 工具白名单和参数校验

真实应用不能让模型执行任意 Python 代码。`ToolExecutor` 的工具注册表天然形成了一层白名单：模型只能选择已注册的名字。还可以在工具函数入口增加长度、格式和权限检查，例如限制搜索词长度，或拒绝包含敏感信息的请求。

## 四、4.2：ReAct 是怎样工作的

ReAct 是 **Reasoning and Acting** 的缩写，核心思想是让模型交替进行“推理”和“行动”：

1. **Thought**：分析当前问题，还缺哪些信息。
2. **Action**：选择一个工具并给出输入。
3. **Observation**：程序执行工具，把结果返回给模型。
4. 重复以上步骤，直到模型认为信息足够并输出 **Finish**。

{% mermaid %}
flowchart TD
    Q["🔵 用户问题"] --> P["🟣 组装 ReAct Prompt"]
    P --> L["🟣 LLM 输出 Thought + Action"]
    L --> C{"🟡 Action 类型？"}
    C -->|"调用工具"| E["🍑 ToolExecutor 执行"]
    E --> O["🟢 返回 Observation"]
    O --> P
    C -->|"Finish"| A["🟢 返回最终答案"]
    C -->|"格式错误"| R["🍓 记录错误或结束"]
    R --> P
    style Q fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style P fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style L fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style C fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style E fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style O fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style A fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style R fill:#FFB3C6,stroke:#E57373,stroke-width:2px,color:#333
{% endmermaid %}

一次完整交互可以长这样：

```text
Question: 华为最新的手机是哪一款？
Thought: 这是实时信息，我需要先查询网页。
Action: Search[华为最新手机型号和主要卖点]
Observation: [1] ... 搜索结果摘要 ...
Thought: 我已经拿到多个结果，可以概括共同信息并说明时间范围。
Action: Finish[根据搜索结果，当前可确认的是……]
```

`Observation` 不是模型自己生成的内容，而是宿主程序执行工具后的真实返回值。这一点决定了 ReAct 比“让模型直接编答案”更容易接入可验证的外部信息。

## 五、一个可运行的 ReAct Agent

下面的实现使用正则表达式解析模型输出。为了让格式更稳定，Prompt 明确规定了两种 Action：`ToolName[input]` 调用已注册工具，`Finish[answer]` 返回最终答案。

```python
# ReAct.py
import re
from typing import Optional, Tuple

from llm_client import HelloAgentsLLM
from tools import ToolExecutor, search


REACT_PROMPT_TEMPLATE = """
你是一个可以调用外部工具的智能助手。

可用工具：
{tools}

请严格使用下面的格式：
Thought: 分析问题和下一步计划
Action: ToolName[工具输入]

如果已经有足够信息，请使用：
Thought: 说明为什么可以回答
Action: Finish[最终答案]

不要输出 Action 以外的调用格式。当前问题：
Question: {question}

历史记录：
{history}
"""


class ReActAgent:
    """通过 Thought-Action-Observation 循环完成任务。"""

    def __init__(
        self,
        llm_client: HelloAgentsLLM,
        tool_executor: ToolExecutor,
        max_steps: int = 5,
    ) -> None:
        self.llm_client = llm_client
        self.tool_executor = tool_executor
        self.max_steps = max_steps
        self.history: list[str] = []

    def run(self, question: str) -> Optional[str]:
        """运行 Agent；达到步数上限或模型调用失败时返回 None。"""
        self.history = []

        for step in range(1, self.max_steps + 1):
            print(f"\n--- 第 {step} 步 ---")
            prompt = REACT_PROMPT_TEMPLATE.format(
                tools=self.tool_executor.get_available_tools(),
                question=question,
                history="\n".join(self.history) or "（暂无历史）",
            )

            try:
                response = self.llm_client.think(
                    [{"role": "user", "content": prompt}]
                )
            except Exception as exc:
                print(f"LLM 调用失败：{exc}")
                return None

            thought, action = self._parse_output(response)
            if thought:
                print(f"Thought: {thought}")
            if not action:
                self.history.append("Observation: 没有解析出有效 Action")
                print("没有解析出有效 Action，流程结束。")
                return None

            # Finish 是终止指令，不应该再交给工具执行
            if action.startswith("Finish["):
                final_answer = self._parse_bracket_content(action)
                print(f"最终答案：{final_answer}")
                return final_answer

            tool_name, tool_input = self._parse_tool_action(action)
            if not tool_name:
                self.history.append("Observation: Action 格式错误")
                continue

            tool = self.tool_executor.get_tool(tool_name)
            if tool is None:
                observation = f"错误：未注册名为 {tool_name!r} 的工具。"
            else:
                observation = tool(tool_input)

            print(f"Action: {tool_name}[{tool_input}]")
            print(f"Observation: {observation}")
            self.history.extend(
                [
                    f"Thought: {thought or ''}",
                    f"Action: {action}",
                    f"Observation: {observation}",
                ]
            )

        print(f"已达到最大步数 {self.max_steps}，流程结束。")
        return None

    @staticmethod
    def _parse_output(text: str) -> Tuple[Optional[str], Optional[str]]:
        """从一次模型响应中提取 Thought 和 Action。"""
        thought_match = re.search(
            r"Thought:\s*(.*?)(?=\nAction:|$)", text, re.DOTALL
        )
        action_match = re.search(r"Action:\s*(.*?)\s*$", text, re.DOTALL)
        thought = thought_match.group(1).strip() if thought_match else None
        action = action_match.group(1).strip() if action_match else None
        return thought, action

    @staticmethod
    def _parse_tool_action(action: str) -> Tuple[Optional[str], str]:
        """解析 ToolName[input]，允许输入中包含换行和中括号。"""
        match = re.fullmatch(r"([A-Za-z_]\w*)\[(.*)\]", action, re.DOTALL)
        if not match or match.group(1) == "Finish":
            return None, ""
        return match.group(1), match.group(2).strip()

    @staticmethod
    def _parse_bracket_content(action: str) -> str:
        """提取 Finish[answer] 中的最终答案。"""
        match = re.fullmatch(r"Finish\[(.*)\]", action, re.DOTALL)
        return match.group(1).strip() if match else ""


if __name__ == "__main__":
    llm = HelloAgentsLLM()
    executor = ToolExecutor()
    executor.register_tool(
        "Search",
        "查询实时网页信息，适合时事、事实和知识库之外的问题。",
        search,
    )

    agent = ReActAgent(llm, executor, max_steps=5)
    agent.run("华为最新的手机是哪一款？它的主要卖点是什么？")
```

### 代码中的几个关键点

1. `history` 保存了之前的 `Action` 和 `Observation`，下一轮 Prompt 才知道工具返回了什么。
2. `max_steps` 是硬性停止条件，避免模型反复调用工具造成死循环和额外费用。
3. 工具不存在时，程序把错误作为 `Observation` 返回给模型，模型仍有机会改用正确工具或结束任务。
4. `Finish[...]` 在 Agent 内部直接返回，不会进入 `ToolExecutor`。
5. `temperature=0`、固定输出格式和正则解析共同降低了协议错误，但生产环境仍建议使用结构化输出或函数调用协议。

## 六、ReAct 与普通问答的区别

| 维度 | 普通 LLM 问答 | ReAct Agent |
| --- | --- | --- |
| 信息来源 | 主要来自上下文和参数记忆 | 上下文 + 外部工具结果 |
| 推理过程 | 一次生成 | 多轮 Thought-Action-Observation |
| 实时信息 | ❌ 容易过时 | ✅ 可以调用搜索或 API |
| 错误处理 | 通常只能重新提问 | ⚠️ 需要工具异常、解析失败和步数上限 |
| 工程复杂度 | 较低 | 较高，需要工具白名单和状态管理 |
| 可观测性 | 主要看最终文本 | 可以记录每次 Action 和 Observation |

ReAct 的收益不是“模型多想几遍”这么简单，而是把**推理决策**和**外部动作**放在同一条可追踪链路里。代价是每次工具调用都会增加延迟、费用和失败点，因此工具应该短小、描述清楚、返回结果可控。

## 七、从示例走向可靠系统

### 1. 不要把 Thought 当作安全审计日志

Prompt 中的 Thought 是模型生成的文本，可能不完整，也可能包含不可靠的解释。真正需要审计的内容应来自程序日志：用户请求、选中的工具、经过校验的参数、执行耗时、返回状态和最终结果。

### 2. 搜索结果必须带时间和来源意识

SerpApi 返回的是搜索结果摘要，不代表每条摘要都可靠。回答时应保留来源标题，必要时展示链接，并明确“根据当前搜索结果”的时间范围，避免把搜索摘要当作绝对事实。

### 3. 给每个工具设置边界

工具函数应限制输入长度和调用次数；涉及写数据库、发邮件、执行命令等副作用操作时，还应增加权限检查和人工确认。搜索工具是只读示例，风险相对低，但同样需要处理密钥泄露、请求超时和第三方服务限额。

### 4. 逐步替换文本协议

正则解析适合学习 ReAct 的基本原理，却容易受到模型多输出一句话、括号嵌套和格式漂移影响。生产系统可以进一步使用模型供应商的 function calling、JSON Schema 或 Pydantic 校验，让 Action 的名称和参数拥有明确类型。

## 八、我的复习提纲

```text
环境变量与依赖
    ↓
LLM 客户端：把模型调用封装成 think(messages)
    ↓
工具函数：把外部能力封装成 search(query)
    ↓
ToolExecutor：登记名称、描述和函数，形成工具白名单
    ↓
ReAct Prompt：约定 Thought / Action / Observation / Finish
    ↓
循环执行：模型决定是否调用工具，程序执行并返回观察结果
    ↓
停止条件：Finish、调用失败、解析失败或达到最大步数
```

我对这一节最重要的理解是：**LLM 负责提出下一步行动，程序负责验证和执行行动，Observation 再把真实世界的反馈送回模型。** 只有把这三个边界分清，Agent 才不会变成一段不可控的“自动生成文本”。

## 参考资料

- [Datawhale《Hello-Agents》第四章：智能体经典范式构建](https://datawhalechina.github.io/hello-agents/)
- SerpApi Python client：`serpapi.Client(api_key=api_key)` 与 `client.search(params)`
- 个人实践代码：`llm_client.py`、`tools.py`、`ReAct.py`

本文是个人学习笔记。示例代码用于理解 Agent 的基本流程，真实项目还需要加入重试、超时、日志、权限、成本控制和更严格的结构化输出校验。

