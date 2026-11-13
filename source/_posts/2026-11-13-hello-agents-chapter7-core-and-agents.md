---
title: Hello-Agents 第七章（二）：核心接口与四种 Agent 范式
date: 2026-11-13 11:00:00
updated: 2026-11-13 11:00:00
categories:
  - 技术科普
tags:
  - Hello-Agents
  - Agent
  - ReAct
  - Reflection
  - Plan-and-Solve
  - Python
series: hello-agents
description: 记录 Message、Config、Agent 基类及 Simple、ReAct、Reflection、Plan-and-Solve 四种 Agent 的框架化实现。
---

{% cq %}
把 Agent 写成类，只是形式；真正的框架化，是让每种能力都能被替换、组合和测试。
{% endcq %}

## 一、为什么先设计核心接口

如果每个 Agent 都自己管理消息、配置和模型调用，代码很快会出现重复：每个类都重复拼接系统提示词，每个类都用不同的字典结构保存历史，每个类都自己读取环境变量，测试时也无法用同一个假模型替换真实模型。

第七章先实现 Message、Config 和 Agent，目的是让上层 Agent 共享稳定的底座。

## 二、Message：把对话数据变成结构化对象

消息至少要有 content、role、name 和 metadata。使用 Pydantic 的好处是：创建对象时就能验证字段，序列化时也有统一格式。

```python
from datetime import datetime
from typing import Any, Dict, Optional, Literal

from pydantic import BaseModel, Field


# 限定角色集合，避免把任意字符串直接传给模型 API。
Role = Literal["system", "user", "assistant", "tool"]


class Message(BaseModel):
    """Agent 内部使用的标准消息对象。"""

    # 空内容通常意味着上游拼接或工具返回出了问题，因此直接拒绝。
    content: str = Field(min_length=1)
    # role 决定模型如何解释这条消息，是消息协议的核心字段。
    role: Role
    # name 可用于标识具体 Agent 或工具，便于多 Agent 日志追踪。
    name: Optional[str] = None
    # metadata 不参与模型正文，但可保存 trace_id、耗时和工具版本。
    metadata: Dict[str, Any] = Field(default_factory=dict)
    # 创建时间用于审计和调试，不依赖模型返回内容。
    created_at: datetime = Field(default_factory=datetime.now)

    def to_openai(self) -> dict:
        """转换成 OpenAI 兼容的字典格式。"""
        # 只转换模型 API 需要的字段，内部 metadata 不直接泄露给模型。
        data = {
            "role": self.role,
            "content": self.content,
        }
        if self.name:
            data["name"] = self.name
        return data
```

结构化消息比直接使用字典更容易发现错误。例如把 role 写成不支持的值时，Pydantic 可以阻止非法数据进入模型调用层。

## 三、Config：统一管理运行参数

配置对象集中管理模型名、温度、最大 Token、最大循环次数和工具超时等参数。

```python
import os
from typing import Optional

from pydantic import BaseModel, Field


class Config(BaseModel):
    """HelloAgents 的运行配置。"""

    # 默认模型从环境变量读取，便于在不同环境切换而不改代码。
    model: str = Field(
        default_factory=lambda: os.getenv("LLM_MODEL_ID", "gpt-4o-mini")
    )
    # temperature 控制随机性；工具调用场景通常应设置得更低。
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    # max_steps 是所有循环型 Agent 的保险丝，防止无限调用模型。
    max_steps: int = 5
    tool_timeout: float = 30.0
    debug: bool = False

    class Config:
        # 允许从环境变量和普通字典创建配置。
        extra = "ignore"


_config: Config | None = None


def get_config() -> Config:
    """返回进程内共享的配置对象。"""
    # 通过全局引用保证同一进程内复用同一个默认配置对象。
    global _config
    if _config is None:
        _config = Config()
    return _config


def reset_config() -> None:
    """测试时清空单例，避免测试之间互相污染。"""
    global _config
    _config = None
```

单例的意义是让同一进程中的 Agent 读取同一套默认配置。测试时要提供 reset_config，否则前一个测试修改的配置可能影响后一个测试。

## 四、Agent 抽象基类

基类的 run 是公开入口，负责统一的前置处理、历史记录和异常处理；子类只实现 execute，定义自己的推理逻辑。这属于 Template Method（模板方法）模式。

```python
from abc import ABC, abstractmethod
from typing import List, Optional

from .config import Config, get_config
from .message import Message


class Agent(ABC):
    """所有 Agent 的公共生命周期。"""

    def __init__(
        self,
        name: str,
        llm,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None,
    ):
        # 这些字段是所有子类都会使用的公共状态。
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt or "你是一个有帮助的 AI 助手。"
        self.config = config or get_config()
        self._history: List[Message] = []

    def run(self, input_text: str, **kwargs) -> str:
        """统一公开接口，子类不需要重复实现历史管理。"""
        # 在进入模型调用前校验输入，避免浪费一次请求。
        if not input_text.strip():
            raise ValueError("输入内容不能为空")

        # 先记录用户输入，使 _execute 可以直接读取完整历史。
        self.add_message(Message(role="user", content=input_text))

        try:
            # 子类只实现推理过程，公共生命周期仍由基类控制。
            result = self._execute(input_text, **kwargs)
        except Exception:
            # 真实项目中这里还应记录 trace_id 和完整堆栈。
            raise

        # 只有成功得到最终结果后，才写入 assistant 历史。
        self.add_message(Message(role="assistant", content=result))
        return result

    @abstractmethod
    def _execute(self, input_text: str, **kwargs) -> str:
        """由具体 Agent 实现。"""
        raise NotImplementedError

    def add_message(self, message: Message) -> None:
        self._history.append(message)

    def get_history(self) -> List[Message]:
        return list(self._history)

    def clear_history(self) -> None:
        self._history.clear()
```

这个设计带来三个好处：外部调用统一、内部实现可替换、日志和鉴权等公共逻辑可以集中维护。

## 五、SimpleAgent：最小闭环

SimpleAgent 只负责把历史消息交给模型，不主动规划，也不调用工具。

```python
from hello_agents import Agent


class SimpleAgent(Agent):
    """最基础的单轮或多轮对话 Agent。"""

    def _execute(self, input_text: str, **kwargs) -> str:
        messages = []

        if self.system_prompt:
            messages.append(
                {"role": "system", "content": self.system_prompt}
            )

        for item in self._history:
            messages.append(item.to_openai())

        # Agent 基类已经记录了当前 user 消息。
        return self.llm.invoke(messages, **kwargs)
```

SimpleAgent 是后续实现的基准。只有先跑通它，才有必要继续增加循环、反思和工具调用。

## 六、ReActAgent：推理与行动循环

ReAct（Reasoning and Acting）把每一轮分成 Thought、Action 和 Observation，直到模型输出 Finish。

{% mermaid %}
flowchart TD
    A["🔵 用户问题"] --> B["🟣 生成 Thought + Action"]
    B --> C{"需要工具？"}
    C -->|"是"| D["🍑 执行 Tool"]
    D --> E["🟡 写入 Observation"]
    E --> B
    C -->|"否"| F["🟢 Finish 最终回答"]
{% endmermaid %}

自定义 ReAct Agent 的完整核心代码：

```python
import re
from typing import List, Optional

from hello_agents import Config, HelloAgentsLLM, Message, ReActAgent, ToolRegistry


MY_REACT_PROMPT = """你是一个具备推理和行动能力的 AI 助手。

## 可用工具
{tools}

## 输出格式
Thought: 分析问题和下一步行动。
Action: 使用 Tool[参数]，或使用 Finish[最终答案]。

## 当前问题
{question}

## 执行历史
{history}
"""


class MyReActAgent(ReActAgent):
    """展示如何基于框架基类重写 ReAct 行为。"""

    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        tool_registry: ToolRegistry,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None,
        max_steps: int = 5,
        custom_prompt: Optional[str] = None,
    ):
        super().__init__(name, llm, system_prompt, config)
        self.tool_registry = tool_registry
        self.max_steps = max_steps
        self.current_history: List[str] = []
        self.prompt_template = custom_prompt or MY_REACT_PROMPT

    def _execute(self, input_text: str, **kwargs) -> str:
        # 每次 run 都从新的一棵推理树开始，避免串入上一轮任务。
        self.current_history = []

        # max_steps 同时限制成本、延迟和模型输出格式错误造成的循环。
        for step in range(1, self.max_steps + 1):
            prompt = self.prompt_template.format(
                tools=self.tool_registry.get_tools_description(),
                question=input_text,
                history="\n".join(self.current_history),
            )
            # 每一轮都把历史观察结果重新放入提示词，形成 ReAct 上下文。
            response = self.llm.invoke(
                [{"role": "user", "content": prompt}],
                **kwargs,
            )

            thought, action = self._parse_output(response)
            # Finish 是唯一允许结束循环的动作，其余动作必须经过工具注册表。
            if action.startswith("Finish"):
                return self._parse_action_input(action)

            tool_name, tool_input = self._parse_action(action)
            # Agent 不直接调用函数，由 Registry 负责查找、执行和统一异常。
            observation = self.tool_registry.execute_tool(
                tool_name,
                tool_input,
            )
            self.current_history.extend(
                [
                    f"Step {step} Thought: {thought}",
                    f"Step {step} Action: {action}",
                    f"Step {step} Observation: {observation}",
                ]
            )

        # 超限时返回明确失败信息，调用方可以据此转人工或重试。
        return "抱歉，未能在最大步数内完成任务。"

    @staticmethod
    def _parse_output(text: str) -> tuple[str, str]:
        """解析模型输出中的 Thought 和 Action。"""
        thought_match = re.search(
            r"Thought:\s*(.*?)(?=Action:|$)",
            text,
            flags=re.S,
        )
        action_match = re.search(
            r"Action:\s*(.*)",
            text,
            flags=re.S,
        )
        # 解析失败时返回空字符串，让上层可以记录格式错误并决定是否重试。
        thought = thought_match.group(1).strip() if thought_match else ""
        action = action_match.group(1).strip() if action_match else ""
        return thought, action

    @staticmethod
    def _parse_action(action: str) -> tuple[str, str]:
        """解析 ToolName[input]。"""
        match = re.match(r"([^\[]+)\[(.*)\]", action, flags=re.S)
        if not match:
            raise ValueError(f"无法解析 Action: {action}")
        return match.group(1).strip(), match.group(2).strip()

    @staticmethod
    def _parse_action_input(action: str) -> str:
        match = re.match(r"Finish\[(.*)\]", action, flags=re.S)
        if not match:
            raise ValueError("Finish 格式错误")
        return match.group(1).strip()
```

工程重点不是让模型输出一段漂亮的思考，而是让 Action 可解析、工具执行可控、循环次数有上限。

## 七、ReflectionAgent：执行、反思和优化

ReflectionAgent 先生成结果，再让模型担任审查者。如果审查不通过，就把反馈送回模型进行修订。

```python
class ReflectionAgent(Agent):
    """通过反思循环改进答案质量。"""

    def _execute(self, input_text: str, max_rounds: int = 3, **kwargs) -> str:
        # 第一轮先产生候选答案，后续循环只围绕这个答案进行审查和修订。
        answer = self.llm.invoke(
            [{"role": "user", "content": input_text}],
            **kwargs,
        )

        # max_rounds 防止模型在“继续优化”与“仍需修改”之间无限循环。
        for round_index in range(1, max_rounds + 1):
            review_prompt = (
                "请审查下面的答案，输出问题、改进建议和是否通过。\n\n"
                f"答案：{answer}"
            )
            review = self.llm.invoke(
                [{"role": "user", "content": review_prompt}],
                **kwargs,
            )

            # 教学示例用字符串判断；生产实现应改成结构化 JSON 字段。
            if "通过" in review or "PASS" in review.upper():
                break

            revise_prompt = (
                f"原问题：{input_text}\n"
                f"当前答案：{answer}\n"
                f"审查意见：{review}\n"
                "请只输出修订后的完整答案。"
            )
            answer = self.llm.invoke(
                [{"role": "user", "content": revise_prompt}],
                **kwargs,
            )

        return answer
```

真实项目中最好让反思结果输出结构化 JSON，例如 passed、score、missing_points，而不是只搜索字符串“通过”。

## 八、Plan-and-SolveAgent：先计划再执行

Plan-and-Solve 适合多步骤任务。它把规划和执行分开，便于观察中间状态，也便于失败后从某一步重试。

```python
class PlanAndSolveAgent(Agent):
    """先生成步骤计划，再逐步执行。"""

    def _execute(self, input_text: str, **kwargs) -> str:
        plan_prompt = (
            "请把任务拆成有序步骤。"
            "每一步都要有明确输入、输出和完成标准。\n"
            f"任务：{input_text}"
        )
        # 先单独生成计划，便于把规划结果记录下来或让人工审核。
        plan_text = self.llm.invoke(
            [{"role": "user", "content": plan_prompt}],
            **kwargs,
        )

        solve_prompt = (
            f"任务：{input_text}\n"
            f"计划：{plan_text}\n"
            "请按计划执行，并在最终结果中列出完成情况。"
        )
        # 执行阶段带上原任务和计划，避免模型只看到局部步骤。
        return self.llm.invoke(
            [{"role": "user", "content": solve_prompt}],
            **kwargs,
        )
```

如果计划需要真实工具，应该把每个步骤保存为结构化任务对象，而不是把整段计划再次拼进提示词。

## 九、FunctionCallAgent：结构化工具调用

Function calling 的核心是让模型返回工具名和参数，而不是让 Agent 从自然语言中猜测工具调用。

```python
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict = Field(default_factory=dict)


class FunctionCallAgent(Agent):
    """使用结构化工具调用协议的 Agent。"""

    def __init__(self, *args, tool_registry=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.tool_registry = tool_registry

    def _execute(self, input_text: str, **kwargs) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": input_text},
        ]

        # 结构化调用让模型返回工具名和参数，避免从自然语言中猜测。
        decision = self.llm.invoke_with_tools(
            messages,
            tools=self.tool_registry.schemas(),
            **kwargs,
        )

        # 模型可以直接结束，也可以请求工具；两条路径都要显式处理。
        if decision.get("type") == "final":
            return decision["content"]

        call = ToolCall(
            name=decision["name"],
            arguments=decision.get("arguments", {}),
        )
        # Registry 仍然是权限和参数校验的最后一道边界。
        result = self.tool_registry.execute_structured(
            call.name,
            call.arguments,
        )
        messages.append({"role": "tool", "content": str(result)})

        return self.llm.invoke(messages, **kwargs)
```

## 十、四种范式怎么选

| 范式 | 核心循环 | 适合任务 | 主要风险 |
| --- | --- | --- | --- |
| Simple | 直接问答 | FAQ、聊天、摘要 | 没有主动行动 |
| ReAct | 思考→行动→观察 | 搜索、计算、工具调用 | 格式错误和循环失控 |
| Reflection | 生成→审查→修改 | 写作、代码、方案优化 | 成本高、容易自我重复 |
| Plan-and-Solve | 规划→逐步执行 | 复杂多步骤任务 | 计划错误会级联 |
| Function calling | 结构化决策→工具 | 生产级工具调用 | 依赖模型的函数调用能力 |

## 十一、实践检查

1. 先用 SimpleAgent 验证模型密钥和基础调用。
2. 再用无副作用的计算器测试 ReAct。
3. 给 ReflectionAgent 设置最大反思轮数，观察是否提前结束。
4. 给 Plan-and-Solve 的每一步增加日志，确认失败位置可以定位。
5. 把工具调用结果保存到 Message.metadata，便于追踪。

## 参考资料

- Datawhale《Hello-Agents》第七章：框架接口实现与 Agent 范式
- [HelloAgents GitHub](https://github.com/jjyaoao/helloagents)

