---
title: Hello-Agents 第七章（四）：全章总结与课后习题详解
date: 2026-11-13 13:00:00
updated: 2026-11-13 13:00:00
categories:
  - 技术科普
tags:
  - Hello-Agents
  - Agent
  - 框架设计
  - 课后习题
  - 工程化
series: hello-agents
description: 总结 Hello-Agents 第七章，并详细回答框架设计、模型接入、Agent 范式、工具系统和扩展性习题。
---

{% cq %}
框架的终点不是把所有能力都封装起来，而是让新的能力可以在不破坏旧代码的情况下加入。
{% endcq %}

## 一、全章总结

第七章完成了一个从底层到上层的最小 Agent 框架：

{% mermaid %}
flowchart TB
    A["🔵 用户请求"] --> B["🟣 LLM 统一接口"]
    B --> C["🍑 Message 与 Config"]
    C --> D["🟡 Agent 基类"]
    D --> E["🟠 Simple / ReAct / Reflection / Plan"]
    E --> F["🟢 ToolRegistry 与 ToolChain"]
    F --> G["✅ 可扩展 Agent 应用"]
{% endmermaid %}

核心设计可以归纳为四句话：

1. 用标准 API 隔离模型供应商。
2. 用结构化 Message 统一上下文。
3. 用抽象 Agent 承载不同推理范式。
4. 用工具注册表把能力从 Agent 中解耦。

## 二、习题一：为什么要自建 Agent 框架

{% note info %}
题目：分析主流框架的四个局限；解释“万物皆为工具”的优缺点；对比第四章手写 Agent 和第七章框架化实现，并说明你会优先考虑的设计原则。
{% endnote %}

### 2.1 四个局限如何影响开发效率

#### 过度抽象

以一个带检索的问答任务为例，开发者可能要同时理解模型、Prompt、Chain、Retriever、VectorStore、Memory 和 Callback。抽象本身没有错，但当问题只是“为什么这次调用没有返回结果”时，排查路径会穿过多个对象。

对个人学习来说，影响是无法建立因果链；对项目开发来说，影响是定位一个错误需要阅读更多源码和文档。HelloAgents 选择小型接口，就是为了让模型调用、Agent 循环和工具执行可以直接被看见。

#### API 变化快

框架升级导致导入路径变化、参数改名或默认行为变化时，业务代码可能还没有变化，却无法运行。解决办法不是拒绝升级，而是：

- 固定依赖版本。
- 把第三方框架包在自己的适配层中。
- 为关键行为写最小回归测试。
- 在升级前记录旧版本的输入输出。

#### 黑盒化

如果工具调用、重试和消息拼接全部被封装，开发者很难知道模型为什么选择某个工具。调试时需要把中间消息、工具参数、工具结果和异常原因记录下来。

#### 依赖复杂

依赖越多，环境冲突概率越高。轻量框架可以降低学习成本，但生产环境仍应使用成熟组件处理鉴权、队列、数据库和观测，不应该为了“自己实现”而重复制造基础设施。

### 2.2 “万物皆为工具”的优势和局限

优势：

| 优势 | 说明 |
| --- | --- |
| 统一调用 | Agent 只需要理解名称、描述、输入和输出 |
| 易于替换 | Memory 可以从内存实现换成 Redis，Agent 接口不变 |
| 易于测试 | 可以把真实工具替换成 FakeTool |
| 降低学习成本 | 只需先掌握 Agent 与 Tool 的边界 |

局限：

| 局限 | 例子 |
| --- | --- |
| 生命周期表达不足 | RAG 索引构建、更新和查询不是一次函数调用 |
| 权限粒度不足 | 数据库工具可能需要按用户隔离权限 |
| 状态能力不足 | Memory 需要版本、回溯和持久化 |
| 观测能力不足 | 长链路任务需要独立 trace 和指标 |

我的判断是：把它当作统一入口很优秀，把所有复杂模块内部都压成一个函数则不够工程化。外部接口可以统一，内部实现应该允许分层。

### 2.3 手写 Agent 与框架化 Agent 的变化

| 对比项 | 第四章手写代码 | 第七章框架化 |
| --- | --- | --- |
| 模型调用 | 每个脚本单独实现 | HelloAgentsLLM 统一 |
| 消息历史 | 普通列表或字符串 | Message 结构化管理 |
| 配置 | 散落在函数参数中 | Config 集中管理 |
| Agent 行为 | 一个类承担所有逻辑 | 基类 + 子类范式 |
| 工具调用 | 手写条件判断 | ToolRegistry 统一发现 |
| 测试 | 端到端脚本测试 | 组件可以单独测试 |
| 扩展 | 修改原脚本 | 新增子类或工具 |

如果由我设计框架，会优先考虑：接口稳定、可观测、可替换、可测试和安全边界。功能数量应该排在这些原则之后。

## 三、习题二：扩展模型供应商与本地推理

{% note info %}
题目：继承 HelloAgentsLLM 添加一个新供应商；分析自动检测优先级；比较 vLLM、SGLang 和 Ollama。
{% endnote %}

### 3.1 继承方式添加 Gemini Provider

下面展示一个兼容 OpenAI 风格网关的 Gemini 适配器。真正调用时要以当前网关的 API 兼容方式为准。

```python
import os
from typing import Optional

from openai import OpenAI
from hello_agents import HelloAgentsLLM


class GeminiLLM(HelloAgentsLLM):
    """通过兼容层把 Gemini 接入 HelloAgents。"""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        provider: Optional[str] = "auto",
        **kwargs,
    ):
        # 只处理 gemini，其他 Provider 仍走父类的统一配置逻辑。
        if provider != "gemini":
            # 其他供应商继续使用父类实现。
            super().__init__(
                model=model,
                api_key=api_key,
                base_url=base_url,
                provider=provider,
                **kwargs,
            )
            return

        self.provider = "gemini"
        # 构造参数优先于环境变量，方便单元测试注入不同配置。
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.base_url = (
            base_url
            or os.getenv("GEMINI_BASE_URL")
            or "https://generativelanguage.googleapis.com/v1beta/openai/"
        )

        # 尽早失败，避免真正请求时才暴露密钥缺失问题。
        if not self.api_key:
            raise ValueError("请设置 GEMINI_API_KEY")

        self.model = (
            model
            or os.getenv("GEMINI_MODEL")
            or "gemini-2.0-flash"
        )
        self.temperature = kwargs.get("temperature", 0.7)
        self.max_tokens = kwargs.get("max_tokens")
        self.timeout = kwargs.get("timeout", 60)

        # Gemini 通过 OpenAI 兼容网关接入，所以 Agent 层无需改动。
        self._client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
        )
```

配置与使用：

```dotenv
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.0-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
```

```python
from dotenv import load_dotenv
from gemini_llm import GeminiLLM

load_dotenv()

llm = GeminiLLM(provider="gemini")
print(llm.invoke([{"role": "user", "content": "解释 ReAct"}]))
```

### 3.2 自动检测的优先级

如果同时设置：

```dotenv
OPENAI_API_KEY=xxx
LLM_BASE_URL=http://localhost:11434/v1
```

推荐的结果是 Ollama，因为本地地址已经明确表达了调用目标。优先级应为：

1. 显式 provider。
2. base_url 的本地服务特征。
3. 云端密钥。
4. 没有足够信息时抛出异常。

如果先检查 OPENAI_API_KEY，就会因为密钥存在而忽略本地地址，导致请求发错位置。自动检测必须提供 debug 日志，例如“命中 LLM_BASE_URL=11434，因此选择 ollama”。

### 3.3 vLLM、SGLang 和 Ollama 对比

| 维度 | vLLM | SGLang | Ollama |
| --- | --- | --- | --- |
| 定位 | 高吞吐推理服务 | 面向结构化生成和复杂工作流的高性能运行时 | 本地模型管理与快速运行工具 |
| 易用性 | 中等，需要 GPU 环境 | 中等偏高，适合有推理工程经验的用户 | 高，安装后即可运行模型 |
| 资源占用 | 通常需要较大显存 | 依模型和运行时配置而定 | 适合个人电脑，但大模型仍需要较高资源 |
| 推理速度 | 高吞吐、连续批处理成熟 | 对结构化输出、长上下文和复杂程序有优势 | 方便优先，吞吐不是主要目标 |
| 适用场景 | 团队 API、在线服务 | 高级推理服务、复杂生成 | 本地开发、原型验证 |
| 运维成本 | 较高 | 较高 | 较低 |

三者的“精度”主要取决于模型权重、量化方式和运行参数，而不是服务框架本身。运行时更应该比较吞吐、延迟、显存占用和部署难度。

## 四、习题三：Message、Agent 基类与单例配置

{% note info %}
题目：分析 Pydantic Message 的优势；解释 run 与 execute 的设计模式；说明 Config 单例的作用和风险。
{% endnote %}

### 4.1 Pydantic 的优势

- 字段类型和必填项在入口处验证。
- 统一序列化，方便写入日志或数据库。
- 可以为 metadata、工具参数和结构化输出增加约束。
- 错误更早暴露，避免非法消息传到模型层。
- 方便和 FastAPI、队列、持久化系统连接。

需要注意的是，Pydantic 只验证数据结构，不保证业务语义正确。例如 role 合法，不代表这条消息一定属于当前用户。

### 4.2 run 与 execute 是什么模式

这是模板方法模式。run 是稳定的公开算法骨架，execute 是留给子类实现的变化步骤。它还体现了面向对象中的“好莱坞原则”：高层流程调用低层实现，子类不应该随意改变公共生命周期。

优点是统一入口、减少重复、方便插入日志、计时、鉴权和异常处理。

### 4.3 Config 单例的作用和风险

单例表示一个进程中只维护一个配置对象。好处是默认模型、超时和调试开关保持一致，避免不同 Agent 读取不同配置。

风险包括：

- 测试之间共享可变状态。
- 多租户服务无法使用不同租户配置。
- 运行时修改配置会影响所有 Agent。
- 并发程序需要考虑线程安全。

因此生产系统可以保留“默认配置单例”，但允许 Agent 构造时显式注入独立 Config。

## 五、习题四：四种 Agent 的改进与 Tree-of-Thought

{% note info %}
题目：比较第四章和第七章的 ReAct；为 ReflectionAgent 增加质量评分；设计 Tree-of-Thought Agent。
{% endnote %}

### 5.1 ReAct 的三个具体改进

1. **统一模型入口**：第四章可能直接调用 SDK，第七章通过 HelloAgentsLLM 隔离供应商。
2. **统一工具注册**：工具从 Agent 逻辑中移出，使用 ToolRegistry 管理名称、描述和执行。
3. **统一历史与终止条件**：Agent 基类保存消息，ReAct 只关注解析 Action、调用工具和控制最大步数。

这些改进让新增工具不需要改 ReAct 主循环，也能让测试使用假的 LLM 和假的工具。

### 5.2 为 ReflectionAgent 增加质量评分

质量评分应该由模型输出结构化结果，同时设置最大循环次数：

```python
from pydantic import BaseModel, Field


class ReviewResult(BaseModel):
    # 用结构化字段替代“感觉不错”这类无法自动判断的文本。
    score: float = Field(ge=0, le=10)
    passed: bool
    problems: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class ScoredReflectionAgent(Agent):
    """分数达到阈值就提前结束反思循环。"""

    def _execute(
        self,
        input_text: str,
        threshold: float = 8.0,
        max_rounds: int = 3,
        **kwargs,
    ) -> str:
        # 先得到一个可被审查的初稿，后续每轮只修改当前版本。
        answer = self.llm.invoke(
            [{"role": "user", "content": input_text}],
            **kwargs,
        )

        # max_rounds 是成本和延迟上限，防止反思循环失控。
        for _ in range(max_rounds):
            review_text = self.llm.invoke(
                [
                    {
                        "role": "user",
                        "content": (
                            "请输出 JSON：score、passed、problems、suggestions。\n"
                            f"答案：{answer}"
                        ),
                    }
                ],
                **kwargs,
            )
            # 解析失败应进入异常处理或人工审核，不能默认为通过。
            review = ReviewResult.model_validate_json(review_text)

            if review.passed and review.score >= threshold:
                break

            answer = self.llm.invoke(
                [
                    {
                        "role": "user",
                        "content": (
                            f"原问题：{input_text}\n"
                            f"当前答案：{answer}\n"
                            f"审查结果：{review.model_dump_json()}\n"
                            "请根据问题和建议输出改进后的完整答案。"
                        ),
                    }
                ],
                **kwargs,
            )

        return answer
```

评分机制的重点是把“是否满意”转成可测试的状态，而不是把循环终止交给模糊的自然语言。

### 5.3 Tree-of-Thought Agent

Tree-of-Thought（思维树）不是只生成一条思路，而是在每一步生成多个候选路径，再评分和剪枝。

```python
from dataclasses import dataclass
from typing import List


@dataclass
class ThoughtNode:
    # path 保存从根节点到当前节点的完整思路，便于最终回放。
    text: str
    score: float = 0.0
    path: List[str] | None = None


class TreeOfThoughtAgent(Agent):
    """每一层生成多个思路，保留评分最高的路径。"""

    def _execute(
        self,
        input_text: str,
        width: int = 3,
        depth: int = 3,
        **kwargs,
    ) -> str:
        # frontier 只保留当前层候选，避免一次性保存整棵树造成内存膨胀。
        frontier = [
            ThoughtNode(text="开始分析", path=[])
        ]

        for _ in range(depth):
            # 每一轮先扩展，再统一评分和剪枝。
            candidates: list[ThoughtNode] = []

            for node in frontier:
                prompt = (
                    f"问题：{input_text}\n"
                    f"已有路径：{node.path}\n"
                    f"当前节点：{node.text}\n"
                    f"请生成 {width} 个下一步思路，每行一个。"
                )
                # 一个节点生成多个候选，width 决定搜索分支数量。
                text = self.llm.invoke(
                    [{"role": "user", "content": prompt}],
                    **kwargs,
                )
                for item in text.splitlines():
                    if item.strip():
                        candidates.append(
                            ThoughtNode(
                                text=item.strip(),
                                path=(node.path or []) + [item.strip()],
                            )
                        )

            # 让模型给候选路径打分；真实项目可替换为规则或小模型。
            # 评分模型只负责排序，不直接修改候选路径内容。
            for candidate in candidates:
                score_text = self.llm.invoke(
                    [
                        {
                            "role": "user",
                            "content": (
                                f"问题：{input_text}\n"
                                f"路径：{candidate.path}\n"
                                "请只返回 0 到 10 的数字。"
                            ),
                        }
                    ],
                    **kwargs,
                )
                candidate.score = float(score_text.strip())

            # Beam Search 风格剪枝，只保留最高分的 width 条路径。
            frontier = sorted(
                candidates,
                key=lambda item: item.score,
                reverse=True,
            )[:width]

        best = max(frontier, key=lambda item: item.score)
        final_prompt = (
            f"问题：{input_text}\n"
            f"最佳思考路径：{best.path}\n"
            "请给出最终答案。"
        )
        return self.llm.invoke(
            [{"role": "user", "content": final_prompt}],
            **kwargs,
        )
```

Tree-of-Thought 的代价是模型调用次数约为宽度乘深度，还需要防止评分模型偏好“看起来完整”的路径。因此生产实现应增加预算、重复路径检测和人工接管。

## 六、习题五：统一工具接口、工具链和异步执行

{% note info %}
题目：解释 BaseTool 的统一接口；设计至少三个工具组成的应用场景；分析异步执行的收益。
{% endnote %}

### 6.1 为什么要统一接口

统一接口让 Agent 可以用同一种方式发现和调用工具。工具返回多个值时，使用结构化字典或 Pydantic 模型：

```python
class SearchResult(BaseModel):
    # 固定搜索结果字段，避免不同搜索源返回不同键名。
    title: str
    summary: str
    url: str


class SearchTool(BaseTool):
    name = "search"

    def execute(self, input_data: str) -> SearchResult:
        # 真实实现应在这里调用搜索服务并完成字段映射。
        return SearchResult(
            title="示例标题",
            summary="示例摘要",
            url="https://example.com",
        )
```

调用方可以稳定地读取 title、summary 和 url，工具内部以后换搜索服务也不会影响 Agent。

### 6.2 三工具研究链

场景：做一份技术选型报告，需要：

1. SearchTool 搜集候选方案。
2. CalculatorTool 计算成本或性能指标。
3. SummaryTool 生成结构化结论。

{% mermaid %}
flowchart LR
    A["🔵 研究问题"] --> B["🟣 SearchTool<br>检索资料"]
    B --> C["🍑 CalculatorTool<br>计算指标"]
    C --> D["🟡 SummaryTool<br>整理结论"]
    D --> E["🟢 评审与输出"]
{% endmermaid %}

三个工具之间有数据依赖，因此不能把它们全部并行；只有同一阶段的多个搜索源可以并行。

### 6.3 异步执行什么时候有效

当任务主要等待网络 I/O，并且任务之间互不依赖时，并行可以明显降低总耗时。若三个请求耗时 2 秒、3 秒、4 秒，串行约 9 秒，并行接近最长请求的 4 秒。

以下情况不适合并行：

- 后一个工具需要前一个工具的输出。
- 工具共享不可并发访问的资源。
- CPU 计算占满线程，线程池无法突破 GIL。
- 并发调用超过供应商限流。

因此异步执行器必须配合并发上限、超时、取消和失败聚合。

## 七、习题六：流式输出、多轮对话和插件系统

{% note info %}
题目：为 HelloAgents 增加流式输出、多轮对话分支与回溯，并设计无需修改核心代码的插件系统。
{% endnote %}

### 7.1 流式输出设计

需要修改三层：

1. LLM 层增加 stream_invoke，返回字符串迭代器。
2. Agent 层增加 stream_run，边消费边 yield。
3. UI 层逐块刷新，完整响应结束后再写入历史。

```python
class Agent(ABC):
    def stream_run(self, input_text: str, **kwargs):
        """默认流式接口，子类可以覆盖。"""
        # 流式阶段只向调用方 yield 分片，不要为每个 token 写一条历史消息。
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": input_text},
        ]

        # 用列表累积分片，结束后再拼成完整 assistant 消息。
        full_response = []
        for chunk in self.llm.stream_invoke(messages, **kwargs):
            full_response.append(chunk)
            yield chunk

        # 只有完整响应结束后才写入一条 assistant 消息。
        # 只有完整响应形成后才写历史，避免断线留下半截上下文。
        self.add_message(
            Message(
                role="assistant",
                content="".join(full_response),
            )
        )
```

流式输出要处理断线、重试和半截响应。UI 不应该把每个 token 都当成一条历史消息，否则历史会膨胀。

### 7.2 多轮对话、分支与回溯

建议新增 Conversation、Turn 和 ConversationStore：

```python
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class Turn:
    # parent_id 把线性对话连接成可分支、可回溯的树。
    id: str
    parent_id: Optional[str]
    messages: List[Message] = field(default_factory=list)


class ConversationStore:
    """保存对话树，而不是只有一条线性列表。"""

    def __init__(self):
        self.turns: Dict[str, Turn] = {}
        self.active_id: Optional[str] = None

    def append(self, turn: Turn) -> None:
        # 新增一轮后将它设为当前活动分支。
        self.turns[turn.id] = turn
        self.active_id = turn.id

    def branch(self, source_id: str, new_id: str) -> Turn:
        # 分支复制历史，不删除原分支，便于比较不同回答。
        source = self.turns[source_id]
        new_turn = Turn(
            id=new_id,
            parent_id=source.id,
            messages=list(source.messages),
        )
        self.append(new_turn)
        return new_turn

    def rollback(self, turn_id: str) -> None:
        # 回溯只切换指针，不删除旧数据，审计记录仍然保留。
        if turn_id not in self.turns:
            raise KeyError(turn_id)
        self.active_id = turn_id

    def history(self) -> List[Message]:
        # 取出当前分支给 Agent 使用；复杂实现可沿 parent_id 逐层合并。
        current = self.turns.get(self.active_id)
        return list(current.messages) if current else []
```

分支的本质是把对话历史从列表升级成树。回溯时不删除旧数据，而是切换 active_id，便于审计和比较不同回答。

### 7.3 插件系统架构

插件系统需要稳定的注册接口、版本信息和生命周期钩子：

{% mermaid %}
flowchart TB
    A["🔵 PluginManager<br>发现插件"] --> B["🟣 PluginManifest<br>名称与版本"]
    B --> C["🍑 register_agents<br>注册 Agent"]
    B --> D["🍑 register_tools<br>注册 Tool"]
    B --> E["🍑 register_hooks<br>注册钩子"]
    C --> F["🟡 HelloAgents Runtime"]
    D --> F
    E --> F
    F --> G["🟢 业务应用"]
{% endmermaid %}

关键接口示例：

```python
from typing import Protocol


class Plugin(Protocol):
    name: str
    version: str

    def register(self, runtime) -> None:
        # 插件只能通过运行时公开接口注册能力，避免修改核心模块。
        """把 Agent、Tool 或 Hook 注册到运行时。"""
        ...


class PluginManager:
    def __init__(self, runtime):
        self.runtime = runtime
        self.plugins: dict[str, Plugin] = {}

    def load(self, plugin: Plugin) -> None:
        # 加载前检查名称，防止两个插件覆盖同一个注册项。
        if plugin.name in self.plugins:
            raise ValueError(f"插件重复：{plugin.name}")

        # 注册成功后再写入管理器，注册失败不会留下半加载状态。
        plugin.register(self.runtime)
        self.plugins[plugin.name] = plugin
```

第三方插件可以通过 Python entry points 自动发现，也可以先用显式配置列表加载。必须校验插件版本、权限和依赖，不能让插件默认获得文件系统和网络的全部权限。

## 八、我的学习结论

第七章最重要的收获不是记住某个类名，而是理解扩展方向：

- 新模型通过适配器扩展。
- 新 Agent 通过继承基类扩展。
- 新能力通过工具注册表扩展。
- 新工作流通过工具链扩展。
- 新产品能力通过插件和生命周期钩子扩展。

当一个框架可以持续加入能力，同时不要求修改核心循环时，它才真正具备可维护性。

## 参考资料

- Datawhale《Hello-Agents》第七章：构建你的 Agent 框架
- [HelloAgents GitHub](https://github.com/jjyaoao/helloagents)
- [Python Entry Points 文档](https://packaging.python.org/en/latest/specifications/entry-points/)

