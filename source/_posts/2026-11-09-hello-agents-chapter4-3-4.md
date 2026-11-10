---
title: Hello-Agents 第四章 4.3-4.4 学习笔记：Plan-and-Solve 与 Reflection
date: 2026-11-09 10:00:00
updated: 2026-11-09 10:00:00
categories:
  - AI Agent
tags:
  - Agent
  - Plan-and-Solve
  - Reflection
  - Python
  - Hello-Agents
  - 学习笔记
series: hello-agents
description: 学习 Hello-Agents 第四章 4.3 Plan-and-Solve 与 4.4 Reflection，记录规划执行、短期记忆、代码优化和三种 Agent 范式的取舍。
---

{% cq %}
ReAct 解决“边观察边行动”，Plan-and-Solve 解决“先想清楚再执行”，Reflection 解决“做完以后再检查并改进”。
{% endcq %}

## 开篇：为什么还需要另外两种范式

在 4.1 和 4.2 中，我实现了一个能调用搜索工具的 ReAct Agent。它会根据当前的 `Observation` 决定下一步动作，适合信息不完整、需要动态探索的任务。

但 ReAct 并不是所有问题的最佳答案：如果任务的步骤可以提前拆清楚，边走边想会增加不必要的随机性；如果任务已经有一个初稿，仅仅得到结果也不够，还需要检查质量、发现问题并继续修改。

因此，第四章继续介绍两种互补的范式：

- **Plan-and-Solve**：先由规划器生成完整计划，再由执行器逐步完成。
- **Reflection**：先生成初稿，再让评审角色反思，最后根据反馈优化，循环直到满足停止条件。

## 一、4.3 Plan-and-Solve：先规划，后执行

### 1. 工作原理

Plan-and-Solve 将任务拆成两个阶段。规划阶段接收原始问题，输出结构化的步骤列表；执行阶段逐一完成步骤，并把前面步骤的结果作为后续上下文。

{% mermaid %}
flowchart LR
    Q["🔵 用户问题"] --> P["🟣 Planner<br>拆解任务"]
    P --> L["🟡 结构化计划<br>步骤1...步骤 n"]
    L --> E["🍑 Executor<br>按顺序执行"]
    E --> H["🟢 历史结果<br>作为上下文"]
    H --> E
    E --> A["🟢 最终答案"]
    style Q fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style P fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style L fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style E fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style H fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style A fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

规划器和执行器的职责必须分开。规划器关注“需要哪些步骤”，不急着回答问题；执行器关注“当前步骤怎么完成”，不需要也不应该重新安排整套计划。这个边界让代码更容易测试，也方便以后替换模型或增加动态重规划。

### 2. 规划阶段：输出可以解析的列表

课程示例要求模型把计划放进 ` ```python ` 代码围栏中，再用 `ast.literal_eval()` 将字符串安全地解析成 Python 列表。这里的 `literal_eval` 只解析字面量，不会像 `eval` 一样执行任意代码。

````python
import ast
from typing import Any


PLANNER_PROMPT_TEMPLATE = """
你是一位 AI 规划专家。请把用户的问题拆分成多个独立、可执行、顺序合理的步骤。

用户问题：
{question}

请严格输出 Python 列表，必须放在 ```python 和 ``` 之间，例如：
```python
["步骤1", "步骤2", "步骤3"]
```
不要输出列表以外的解释。
"""


class Planner:
    """调用 LLM 生成结构化执行计划。"""

    def __init__(self, llm_client: Any) -> None:
        self.llm_client = llm_client

    def plan(self, question: str) -> list[str]:
        """生成计划；格式不正确时返回空列表。"""
        prompt = PLANNER_PROMPT_TEMPLATE.format(question=question)
        response = self.llm_client.think(
            [{"role": "user", "content": prompt}]
        )
        if not response:
            return []

        try:
            # 只取代码围栏中的内容，避免把模型的解释文字传给解析器。
            plan_text = response.split("```python", 1)[1]
            plan_text = plan_text.split("```", 1)[0].strip()
            plan = ast.literal_eval(plan_text)

            # 不仅要检查外层是列表，还要检查每一步确实是字符串。
            if isinstance(plan, list) and all(
                isinstance(step, str) and step.strip() for step in plan
            ):
                return plan
        except (SyntaxError, ValueError, IndexError) as exc:
            print(f"计划解析失败：{exc}")

        return []
````

这里的关键不是“让模型输出 Python”，而是**让模型输出一种宿主程序可以验证的协议**。生产环境可以把列表替换成 JSON Schema 或 Pydantic 模型，减少代码围栏、单引号和额外解释导致的解析失败。

### 3. 执行阶段：维护步骤结果

执行器每完成一个步骤，就把当前步骤和结果写入 `history`。下一步的 Prompt 可以看到之前发生了什么，因此不会把每个子任务当成互不相关的问题。

```python
EXECUTOR_PROMPT_TEMPLATE = """
你是一位 AI 执行专家。请严格按照计划解决当前步骤。

原始问题：
{question}

完整计划：
{plan}

历史步骤与结果：
{history}

当前步骤：
{current_step}

请只完成当前步骤，并给出清晰、可供下一步使用的结果。
"""


class Executor:
    """按顺序执行计划，并保存每一步的结果。"""

    def __init__(self, llm_client: Any) -> None:
        self.llm_client = llm_client

    def execute(self, question: str, plan: list[str]) -> str:
        history: list[str] = []

        for index, current_step in enumerate(plan, start=1):
            print(f"\n-> 正在执行步骤 {index}/{len(plan)}：{current_step}")
            prompt = EXECUTOR_PROMPT_TEMPLATE.format(
                question=question,
                plan="\n".join(
                    f"{i}. {step}" for i, step in enumerate(plan, start=1)
                ),
                history="\n".join(history) or "（这是第一步，暂无历史结果）",
                current_step=current_step,
            )
            result = self.llm_client.think(
                [{"role": "user", "content": prompt}]
            )
            result = result or "执行失败：模型没有返回结果。"
            history.append(f"步骤 {index}：{current_step}\n结果：{result}")

        return history[-1] if history else "没有可执行的步骤。"
```

### 4. 组合成完整 Agent

`PlanAndSolveAgent` 只是协调器：先调用 `Planner`，校验计划，再调用 `Executor`。它不把规划细节和执行细节混在一起，体现了“组合优于继承”的设计思路。

```python
class PlanAndSolveAgent:
    """先生成计划，再执行计划的 Agent。"""

    def __init__(self, llm_client: Any) -> None:
        self.planner = Planner(llm_client)
        self.executor = Executor(llm_client)

    def run(self, question: str) -> str | None:
        print(f"\n--- 开始处理问题 ---\n问题：{question}")
        plan = self.planner.plan(question)
        if not plan:
            print("无法生成有效计划，任务终止。")
            return None

        print("✅ 计划已生成：")
        for index, step in enumerate(plan, start=1):
            print(f"{index}. {step}")

        final_answer = self.executor.execute(question, plan)
        print(f"\n--- 任务完成 ---\n最终结果：{final_answer}")
        return final_answer
```

例如水果店问题可以被拆成“计算周一销量→计算周二销量→计算周三销量→求三天总量”。每一步结果都进入下一步上下文，最后得到 `15 + 30 + 25 = 70`。这个例子虽然简单，却能清楚验证规划、状态传递和执行顺序。

### 5. 适用场景与局限

| 维度 | Plan-and-Solve 表现 |
| --- | --- |
| 结构化 | ✅ 先拆步骤，过程清晰 |
| 可预测性 | ✅ 执行顺序固定，容易复现 |
| 适用任务 | 多步数学题、代码模块设计、固定流程文档生成 |
| 环境变化 | ⚠️ 中途出现新信息时，原计划可能过时 |
| 计划错误 | ⚠️ 第一步拆错，后续可能沿着错误路线继续 |
| 延迟与成本 | ⚠️ 规划阶段额外调用一次模型，步骤多时仍会串行执行 |

它适合“可以提前画出蓝图”的任务，不适合每一步都依赖外部反馈、经常改变方向的探索任务。遇到执行失败时，可以在执行器中增加重试或动态重规划，而不是盲目继续原计划。

## 二、4.4 Reflection：让 Agent 检查并改进自己

### 1. 核心思想

Reflection 模仿人类写完初稿后校对、解完题后验算的过程。它把一次性输出改造成一个质量迭代环：先执行得到初稿，再由评审角色指出问题，最后由优化角色修改。

{% mermaid %}
flowchart TD
    T["🔵 任务"] --> E["🟣 Execution<br>生成初稿"]
    E --> M["🟡 Memory<br>保存尝试"]
    M --> R["🍑 Reflection<br>评审反馈"]
    R --> D{"是否需要改进？"}
    D -->|"是"| F["🟣 Refinement<br>根据反馈优化"]
    F --> M
    D -->|"否"| A["🟢 输出最终结果"]
    M -.->|"达到最大轮数"| A
    style T fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style E fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style M fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style R fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style D fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style F fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style A fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

Reflection 与 ReAct 的反馈来源不同：ReAct 主要利用工具返回的外部 `Observation`，Reflection 主要利用评审模型对已有结果的批判。它因此可以发现代码结构、算法复杂度和表达质量等更高层次的问题，但也会增加模型调用次数。

### 2. 短期记忆：保存执行与反思轨迹

如果每次反思只能看到最新代码，它很难知道之前改过什么。`Memory` 将每轮执行结果和评审反馈保存成轨迹，并把轨迹序列化后放入下一轮 Prompt。

```python
from typing import Any


class Memory:
    """保存 Reflection Agent 的短期轨迹。"""

    def __init__(self) -> None:
        self.records: list[dict[str, str]] = []

    def add_record(self, record_type: str, content: str) -> None:
        """增加一条 execution 或 reflection 记录。"""
        if record_type not in {"execution", "reflection"}:
            raise ValueError("record_type 必须是 execution 或 reflection")
        self.records.append({"type": record_type, "content": content})

    def get_trajectory(self) -> str:
        """把轨迹整理为可嵌入提示词的文本。"""
        parts: list[str] = []
        for record in self.records:
            title = "上一轮尝试" if record["type"] == "execution" else "评审员反馈"
            parts.append(f"--- {title} ---\n{record['content']}")
        return "\n\n".join(parts) or "（暂无历史轨迹）"

    def get_last_execution(self) -> str | None:
        """获取最近一次生成的结果。"""
        for record in reversed(self.records):
            if record["type"] == "execution":
                return record["content"]
        return None
```

### 3. 三类提示词

Reflection 至少需要三个角色提示词：执行者负责生成代码，评审员专门找问题，优化者根据反馈重写代码。角色分离可以减少“自己生成、自己马上说完美”的偏差。

````python
INITIAL_PROMPT_TEMPLATE = """
你是一位资深 Python 程序员。请完成下面的任务：
{task}

代码必须包含完整函数签名、文档字符串，并遵循 PEP 8。
请只输出 Python 代码，不要添加解释。
"""

REFLECT_PROMPT_TEMPLATE = """
你是一位严格的代码评审专家和算法工程师。
请审查下面的 Python 代码，重点分析正确性、时间复杂度和空间复杂度。

原始任务：
{task}

待审查代码：
```python
{code}
```

请给出具体、可执行的改进建议。如果算法和实现已经足够合理，最后明确写出“无需改进”。
"""

REFINE_PROMPT_TEMPLATE = """
你是一位资深 Python 程序员。请根据评审意见优化代码。

原始任务：
{task}

上一轮代码：
```python
{code}
```

评审意见：
{feedback}

请输出完整的优化后 Python 代码，保留函数签名和文档字符串，不要输出额外解释。
"""
````

### 4. Reflection Agent 的完整实现

下面的代码把执行、评审、优化和停止条件串起来。它不假设模型一定会收敛，所以同时设置“评审说无需改进”和“达到最大迭代次数”两个出口。

```python
class ReflectionAgent:
    """通过执行、反思、优化循环提升结果质量。"""

    def __init__(self, llm_client: Any, max_iterations: int = 3) -> None:
        self.llm_client = llm_client
        self.max_iterations = max_iterations
        self.memory = Memory()

    def _ask(self, prompt: str) -> str:
        """统一调用 LLM，避免每个阶段重复构造消息格式。"""
        response = self.llm_client.think(
            [{"role": "user", "content": prompt}]
        )
        return response or ""

    def run(self, task: str) -> str:
        # 第一次执行：先得到一个可以被评审的初稿。
        code = self._ask(INITIAL_PROMPT_TEMPLATE.format(task=task))
        self.memory.add_record("execution", code)

        for iteration in range(1, self.max_iterations + 1):
            print(f"\n--- 第 {iteration} 轮反思 ---")
            feedback = self._ask(
                REFLECT_PROMPT_TEMPLATE.format(task=task, code=code)
            )
            self.memory.add_record("reflection", feedback)
            print(f"评审反馈：{feedback}")

            if "无需改进" in feedback:
                print("✅ 评审认为当前结果无需改进。")
                break

            # 没有明确反馈时不继续盲目生成，避免把错误放大。
            if not feedback.strip():
                print("评审没有返回有效反馈，停止迭代。")
                break

            code = self._ask(
                REFINE_PROMPT_TEMPLATE.format(
                    task=task,
                    code=code,
                    feedback=feedback,
                )
            )
            self.memory.add_record("execution", code)

        print(f"\n--- 最终结果 ---\n{code}")
        return code
```

### 5. 运行案例：优化素数函数

课程使用“找出 1 到 n 之间所有素数”作为示例。初稿可能逐个数字试除，时间复杂度接近 `O(n√n)`；评审员指出瓶颈后，优化阶段可以改用埃拉托斯特尼筛法，将复杂度降到 `O(n log log n)`，空间复杂度为 `O(n)`。

```python
task = "编写一个 Python 函数，找出 1 到 n 之间所有的素数。"
agent = ReflectionAgent(llm_client, max_iterations=3)
final_code = agent.run(task)
```

这个例子体现了 Reflection 的三个价值：它不满足于“能运行”，会检查算法效率；它把反馈传给下一轮，而不是重新随机生成；它通过停止条件让迭代最终收敛。

### 6. 成本、收益与边界

| 维度 | Reflection 表现 |
| --- | --- |
| 结果质量 | ✅ 能把功能正确的初稿继续优化 |
| 纠错能力 | ✅ 可以发现逻辑、性能和表达问题 |
| 调用成本 | ❌ 每轮至少增加评审和优化调用 |
| 总延迟 | ❌ 串行循环，轮数越多等待越久 |
| Prompt 复杂度 | ⚠️ 执行、评审、优化需要分别设计和测试 |
| 收敛风险 | ⚠️ 评审标准不清时可能反复修改或过度优化 |

Reflection 是典型的“用成本换质量”。代码审查、技术报告、研究分析等对质量敏感且不要求秒级返回的任务适合使用；简单问答、实时客服和预算严格的任务应限制迭代轮数，或只在低置信度时触发反思。

## 三、三种范式如何选择

| 范式 | 核心循环 | 最适合的问题 | 主要风险 |
| --- | --- | --- | --- |
| ReAct | Thought → Action → Observation | 需要外部工具和动态探索 | 串行调用、格式错误、原地循环 |
| Plan-and-Solve | Plan → Solve | 步骤清晰、结构稳定的多步任务 | 计划过时，缺少动态调整 |
| Reflection | Execute → Reflect → Refine | 初稿可生成但需要质量提升 | 成本和延迟增加，可能过度优化 |

三种范式也可以组合。例如先用 Plan-and-Solve 生成项目实施计划，再用 ReAct 查询资料和调用工具，最后用 Reflection 审查代码或报告。组合时要明确每个阶段的输入、输出和停止条件，避免多个循环互相嵌套后失去可观测性。

## 四、第四章小结

这一章从零实现了三种 Agent Loop：

1. **ReAct** 把推理和行动放在同一循环中，通过工具观察结果动态调整。
2. **Plan-and-Solve** 先生成结构化计划，再按顺序执行，强调过程稳定和步骤传递。
3. **Reflection** 保存执行轨迹，让评审角色检查初稿，再根据反馈迭代优化，强调结果质量。

我的理解是，Agent 的“智能”不只来自更大的模型，也来自对循环结构、状态、工具边界和终止条件的设计。选择范式时，先问清楚任务最需要什么：是外部事实、全局规划，还是结果审查；然后只引入解决该问题所需的循环。

{% note primary %}
复习这章时可以记住三句话：ReAct 是边走边看，Plan-and-Solve 是先画蓝图再施工，Reflection 是交付前复盘并返工。
{% endnote %}

## 参考资料

- [Datawhale《Hello-Agents》第四章：智能体经典范式构建](https://datawhalechina.github.io/hello-agents/)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [Plan-and-Solve Prompting](https://arxiv.org/abs/2305.04091)
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)

本文是个人学习笔记。示例代码用于理解范式原理，真实项目还需要加入超时、重试、结构化输出校验、日志脱敏、权限控制和成本预算。
