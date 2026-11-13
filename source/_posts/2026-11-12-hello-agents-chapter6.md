---
title: Hello-Agents 第六章学习笔记：四种智能体框架的设计哲学
date: 2026-11-12 10:00:00
updated: 2026-11-12 15:51:00
categories:
  - AI Agent
tags:
  - Agent
  - AutoGen
  - AgentScope
  - CAMEL
  - LangGraph
  - 多智能体
  - 工作流
  - Hello-Agents
  - 学习笔记
series: hello-agents
description: 详细记录 Hello-Agents 第六章中的 AutoGen、AgentScope、CAMEL 和 LangGraph，理解对话协作、消息驱动、角色扮演与状态图四种框架路线。
---

{% cq %}
框架不是替你思考的答案，而是把“如何组织智能体”变成可以复用、调试和维护的工程结构。
{% endcq %}

## 开篇：为什么要从手写 Agent 走向框架

第四章中，我用 Python 手动实现了 ReAct、Plan-and-Solve 和 Reflection。手写代码的价值在于看清 Agent Loop：模型如何决定下一步、工具如何返回结果、状态如何继续传递。

但当任务从一个脚本变成多个智能体、多个工具和长时间运行的业务系统时，问题会迅速增加：谁负责调度？消息怎么传递？历史怎么持久化？失败如何重试？如何知道某个智能体为什么做出这个决定？

智能体框架的价值，就是把这些重复问题抽象成稳定组件，让开发者关注业务角色和流程设计。**框架提高的是工程起点，不会自动消除模型的不确定性。**

{% mermaid %}
flowchart LR
    A["🔵 手写 Agent<br>理解原理"] --> B["🟣 框架抽象<br>复用组件"]
    B --> C["🍑 多智能体协作<br>角色与消息"]
    C --> D["🟡 工作流控制<br>状态与分支"]
    D --> E["🟢 生产系统<br>监控、容错、审计"]
    style A fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style B fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style C fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style D fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

## 一、四个框架先记住什么

第六章没有把四个框架当成同一种工具的不同品牌，而是展示了四种组织智能体的方式：

| 框架 | 核心抽象 | 协作方式 | 控制方式 | 更适合的任务 |
| --- | --- | --- | --- | --- |
| AutoGen | 可对话的智能体与 Team | 多角色对话、群聊 | 由对话和终止条件推动 | 软件开发团队、讨论式任务 |
| AgentScope | Message、Memory、Model、Tool 和 Agent | 消息中心、异步事件 | 组合式组件与消息流 | 高并发、分布式、生产级多 Agent |
| CAMEL | 角色、任务和 Inception Prompt | 角色扮演、自主对话 | 主要依赖提示词和终止标记 | 两个或多个专家自主协作 |
| LangGraph | State、Node、Edge 和 Graph | 状态在节点间流动 | 显式图结构、条件边、循环 | 可审计工作流、反思和修复循环 |

可以用四个问题快速区分：

1. 想让多个角色像团队一样讨论，优先想到 **AutoGen**。
2. 想把消息、模型、工具和部署能力工程化，优先想到 **AgentScope**。
3. 想用少量代码让两个角色围绕共同目标自主协作，优先想到 **CAMEL**。
4. 想明确规定每一步、每个分支和每个循环，优先想到 **LangGraph**。

## 二、框架开发前必须具备的共同抽象

不同框架的 API 不同，但底层问题高度相似。理解这些共同抽象，比记住某个类名更重要。

### 1. 模型客户端

模型客户端负责把消息发送给 LLM，并返回文本或结构化结果。它应该独立于业务 Agent，便于切换 OpenAI、DeepSeek、通义千问、Ollama 或其他兼容服务。

### 2. Agent

Agent 通常包含身份、目标、提示词、模型、工具和记忆。框架把这些能力封装起来，但开发者仍然要明确：它能做什么、不能做什么、什么时候应该停止。

### 3. Tool

工具是 Agent 与外部世界的边界，例如搜索、数据库查询、代码执行和发送邮件。工具必须定义输入、输出、权限和失败行为，不能因为框架提供了注册接口，就把所有系统权限交给模型。

### 4. State 或 Memory

短期状态保存当前任务的中间结果，长期记忆保存跨会话信息。状态越多不等于 Agent 越聪明；无关历史会增加 Token 成本，也会干扰模型判断。

### 5. Orchestrator

编排器负责决定谁先运行、下一步运行谁、何时重试、何时结束。AutoGen 主要通过 Team/群聊编排，AgentScope 通过消息和运行时编排，CAMEL 通过角色对话自然推进，LangGraph 通过图的边和条件函数编排。

### 6. Observability

生产系统不能只保存最终答案，还要记录请求、模型、工具、输入输出、耗时、Token、错误和终止原因。可观测性决定了系统出了问题之后能不能回答“哪一步错了”。

## 三、AutoGen：用对话驱动协作

### 1. 核心设计

AutoGen 把多智能体系统看成一场自动化群聊。每个智能体拥有自己的角色和系统消息，通过消息对话完成任务。课程使用的 AutoGen `0.7.4` 示例采用分层架构和异步优先设计，实际使用时应以当前版本文档为准。

{% mermaid %}
flowchart TD
    U["👤 用户任务"] --> PM["🟣 ProductManager<br>拆解需求"]
    PM --> E["🍑 Engineer<br>编写代码"]
    E --> R["🟡 CodeReviewer<br>审查代码"]
    R --> Q{"审查通过？"}
    Q -->|"否"| E
    Q -->|"是"| T["🟢 UserProxy / Tester<br>执行验证"]
    T --> F["✅ 完成交付"]
    style U fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style PM fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style E fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style R fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style Q fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style T fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style F fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

课程案例是一个模拟软件开发团队：产品经理把模糊需求变成计划，工程师实现代码，代码审查员检查质量，用户代理负责发起任务、执行代码和验收结果。

### 2. 0.7.4 示例中的核心组件

- `autogen-core`：提供模型交互、消息和底层运行能力。
- `autogen-agentchat`：提供更高层的对话式 Agent API。
- `AssistantAgent`：封装模型，扮演产品经理、工程师或审查员等角色。
- `UserProxyAgent`：代表用户，也可以执行代码或调用工具，把结果反馈给团队。
- `RoundRobinGroupChat`：按预设顺序轮流发言，适合流程相对固定的团队协作。
- 终止条件：例如出现“代码审查完成”或达到最大轮数时停止。

简化后的角色定义可以写成下面这样：

````python
from autogen_agentchat.agents import AssistantAgent


product_manager = AssistantAgent(
    name="ProductManager",
    model_client=model_client,
    system_message="""
你是一名产品经理。
1. 把用户需求拆成可执行的功能和验收标准。
2. 明确输入、输出、异常情况和技术约束。
3. 需求分析完成后，请工程师开始实现。
""",
)

engineer = AssistantAgent(
    name="Engineer",
    model_client=model_client,
    system_message="""
你是一名 Python 工程师。
1. 根据需求实现完整代码。
2. 处理网络异常、输入校验和配置问题。
3. 完成后请求代码审查员检查。
""",
)
````

轮询群聊的优点是容易理解。缺点也很明显：固定顺序不等于真正的流程控制，如果审查不通过，需要显式设计回退、重试、最大轮数和失败转人工机制，否则对话可能偏离主题或无限循环。

### 3. AutoGen 的优势与局限

| 维度 | 优势 | 局限 |
| --- | --- | --- |
| 协作表达 | 对话很接近人类团队协作，角色分工直观 | 对话越长，Token 成本和上下文噪声越大 |
| 开发体验 | 主要定义角色和职责，不必手写完整状态机 | 流程依赖模型遵循约定，行为可能不稳定 |
| 人类参与 | UserProxy 天然支持人类在环 | 人工介入点和权限边界仍需自己设计 |
| 调试 | 能看到完整对话轨迹 | 出错时要从长对话中定位原因，不像传统程序有清晰堆栈 |

AutoGen 适合“协作本身就是任务”的场景，例如需求讨论、代码编写与审查、研究员和编辑协同。若每一步都必须严格审计，应该把关键决策移到结构化状态或显式工作流中。

## 四、AgentScope：面向生产的消息驱动框架

### 1. 核心设计

AgentScope 的重点不只是让多个 Agent 对话，而是把消息、记忆、模型、工具、异步运行、容错和分布式部署组织成一套工程平台。它更像一个“智能体运行时”，而不是单纯的聊天编排器。

{% mermaid %}
flowchart TB
    subgraph APP["🟣 应用编排层"]
        A["多智能体应用"]
        B["游戏 / 研究 / 业务流程"]
    end
    subgraph AGENT["🍑 Agent 基础设施层"]
        C["ReAct Agent"]
        D["异步执行与状态管理"]
        E["并行工具调用与钩子"]
    end
    subgraph CORE["🟡 基础组件层"]
        F["Message"]
        G["Memory"]
        H["Model API"]
        I["Tool"]
    end
    subgraph OPS["🟢 工程运行层"]
        J["并发"]
        K["容错"]
        L["分布式部署"]
        M["可观测性"]
    end
    APP --> AGENT --> CORE
    AGENT --> OPS
    CORE --> OPS
    style APP fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style AGENT fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style CORE fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style OPS fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

基础组件层定义统一消息、记忆、模型和工具接口；Agent 层在此之上提供 ReAct、异步执行、状态管理和并行调用；应用层负责组合多个 Agent；运行层处理并发、恢复、部署和监控。

### 2. MsgHub 与消息驱动

课程使用 `MsgHub` 管理“三国狼人杀”中多个角色的通信。消息驱动和直接函数调用的区别在于：发送者不需要直接知道接收者的内部实现，消息可以被广播、排队、记录和异步处理。

```python
from agentscope.message import Msg
from agentscope.msghub import msghub


async with msghub(participants=[player_a, player_b, moderator]) as hub:
    await player_a("请讨论今晚的投票目标")
    # 消息由消息中心分发，其他参与者按规则接收。
    await moderator("请主持发言并检查轮次")
```

消息驱动适合参与者数量多、事件不规则、需要异步或跨进程通信的场景，例如实时游戏、客服会话、分布式研究任务和事件总线。代价是系统会引入消息顺序、重复投递、幂等和最终一致性等新问题。

### 3. 结构化输出让 Agent 遵守规则

狼人杀中的行动不能只返回自然语言。比如女巫是否使用解药、猎人是否开枪，都应该由结构化模型约束：

````python
from pydantic import BaseModel, Field, field_validator


class HunterAction(BaseModel):
    """猎人在死亡时提交的结构化动作。"""

    should_shoot: bool = Field(description="是否发动技能")
    target: str | None = Field(default=None, description="目标玩家编号")
    reason: str = Field(min_length=1, max_length=200)

    @field_validator("target")
    @classmethod
    def validate_target(cls, value: str | None, info):
        # 不开枪时不应携带目标，避免出现互相矛盾的动作。
        if not info.data.get("should_shoot") and value is not None:
            raise ValueError("不开枪时 target 必须为空")
        return value
````

结构化输出的价值在于把“模型说了什么”变成“程序可以验证什么”。模型仍可能给出错误字段，所以还要做角色状态、目标是否存活、技能是否已使用等业务校验。

### 4. AgentScope 的优势与局限

AgentScope 的优势是工程化：消息和组件边界清晰，异步和并发能力更自然，也更容易扩展到分布式部署。它适合长期运行、参与者较多、需要恢复和监控的系统。

局限是学习成本更高。开发者需要理解异步编程、消息通信、结构化输出和分布式问题。对于一个简单的两轮对话，用 AgentScope 可能是过度工程化；对于生产级多 Agent，额外复杂度往往是值得的。

## 五、CAMEL：用角色扮演让协作自然发生

### 1. 核心设计

CAMEL 的起点是一个很有启发性的想法：如果给两个 Agent 分配清晰的角色、共同目标和初始任务，它们能否在较少人工干预的情况下自主协作？

它通常用两个角色描述协作边界：一个角色提出需求或负责目标，另一个角色负责实现；通过 Inception Prompting 把角色职责、沟通方式和完成标准写清楚。

{% mermaid %}
sequenceDiagram
    participant U as 👤 用户
    participant R as 🧠 研究员
    participant W as ✍️ 作者
    participant G as ✅ 终止检查
    U->>R: 提出共同任务
    R->>W: 提供理论与素材要求
    W->>R: 返回章节草稿与问题
    R->>W: 审阅、补充和纠偏
    W->>G: 提交当前成果
    G-->>R: 未完成则继续讨论
    G-->>W: 未完成则继续修改
    G-->>U: 检测到任务完成标志
{% endmermaid %}

### 2. 电子书案例

课程让“AI 心理学家”和“AI 作者”共同创作关于拖延症心理学的短篇电子书。前几轮通常用于确定目录和目标读者，中间阶段补充理论、案例和章节内容，后面阶段统一术语、检查逻辑并完成收尾。

角色提示词可以这样表达：

```text
你是心理学研究员。请提供准确的概念、理论来源和现实案例。
你不是最终作者，需要指出草稿中的事实风险和逻辑漏洞。

你是科普作者。请把研究员提供的内容转成普通读者能理解的章节，
保持结构清晰，不编造研究结论；完成后请研究员审阅。
```

CAMEL 的力量来自角色和目标的组合，而不是复杂的流程代码。它适合探索性写作、头脑风暴和跨领域协作；但角色提示越模糊，协作越容易漂移。生产使用时必须增加轮数限制、输出评估和冲突解决策略。

### 3. 双智能体冲突如何处理

如果一个角色输出 `<CAMEL_TASK_DONE>`，另一个角色认为仍有问题，不能直接以第一个标志为准。可以设计一个兼容机制：

1. 终止请求进入“待确认”状态，而不是立即结束。
2. 由仲裁器检查双方的完成理由和验收清单。
3. 如果存在未解决问题，生成一条明确的补充任务，继续最多两轮。
4. 超过轮数仍不能一致时转人工审核，并保存完整对话。

这说明“自然对话”不能替代验收条件。完成标志只是一个信号，真正的终止应该由结构化检查和预算共同决定。

### 4. CAMEL 与 Workforce 的区别

CAMEL 的基本角色扮演更像围绕共同目标的自主对话；其 `workforce` 模块则进一步引入了任务分派、Worker 角色和层级协作。相比之下，AutoGen 的群聊更强调多个 Agent 在同一个对话空间中按协调规则发言。

| 维度 | CAMEL 角色扮演 / Workforce | AutoGen 群聊 |
| --- | --- | --- |
| 协作中心 | 角色目标与任务分派 | 共享对话与发言调度 |
| 组织方式 | 可形成管理者与 Worker 层级 | 常见是 Team + 多角色对话 |
| 适合任务 | 分解后分派给多个专家 | 需要连续讨论和互相反馈 |
| 控制重点 | 任务树、Worker 能力和交付 | 发言顺序、终止条件和消息历史 |

## 六、LangGraph：把 Agent 写成状态图

### 1. 核心设计

LangGraph 不把流程主要表达成“谁和谁聊天”，而是把它建模为状态机：State 保存任务上下文，Node 执行一个步骤，Edge 决定下一步走向。因为边可以回到前面的节点，所以循环、反思、重试和人工审核都能直接表达。

{% mermaid %}
flowchart TD
    S["🔵 State<br>问题、消息、检索结果"] --> U["🟣 understand<br>理解问题"]
    U --> Q{"需要搜索？"}
    Q -->|"是"| R["🍑 search<br>调用搜索工具"]
    Q -->|"否"| A["🟡 answer<br>直接生成答案"]
    R --> A
    A --> C{"质量合格？"}
    C -->|"否"| R
    C -->|"是"| E["🟢 END"]
    style S fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style U fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style Q fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style R fill:#FFDAB9,stroke:#FFB74D,stroke-width:2px,color:#333
    style A fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style C fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

### 2. 三步问答助手的代码骨架

下面的代码只展示 LangGraph 的核心结构，重点是理解 State、Node 和条件边之间的关系：

````python
from typing import TypedDict
from langgraph.graph import END, StateGraph


class QAState(TypedDict, total=False):
    question: str
    need_search: bool
    search_results: list[str]
    answer: str
    quality_ok: bool
    retry_count: int


def understand(state: QAState) -> QAState:
    """判断问题是否需要外部搜索。"""
    question = state["question"]
    return {"need_search": any(word in question for word in ["最新", "今天", "价格"])}


def search(state: QAState) -> QAState:
    """调用搜索工具并把结果写回状态。"""
    results = search_web(state["question"])
    return {"search_results": results}


def answer(state: QAState) -> QAState:
    """根据问题和检索结果生成答案。"""
    context = "\n".join(state.get("search_results", []))
    text = llm_answer(state["question"], context)
    return {"answer": text, "quality_ok": len(text) >= 80}


def route_after_understand(state: QAState) -> str:
    return "search" if state.get("need_search") else "answer"


def route_after_answer(state: QAState) -> str:
    if state.get("quality_ok"):
        return END
    if state.get("retry_count", 0) >= 2:
        return END
    return "search"


graph = StateGraph(QAState)
graph.add_node("understand", understand)
graph.add_node("search", search)
graph.add_node("answer", answer)
graph.set_entry_point("understand")
graph.add_conditional_edges("understand", route_after_understand)
graph.add_edge("search", "answer")
graph.add_conditional_edges("answer", route_after_answer)
app = graph.compile()
````

这里最值得记住的是：节点函数只负责处理局部逻辑，条件函数只负责路由。把“做什么”和“下一步去哪”分开，可以减少大型流程中的耦合。

### 3. LangGraph 的优势与局限

| 维度 | 优势 | 局限 |
| --- | --- | --- |
| 流程控制 | 节点、边和条件清晰，支持循环与回退 | 前期需要设计 State 和图结构 |
| 可预测性 | 路由逻辑显式，适合审计和测试 | 灵活的涌现式协作较少 |
| 调试 | 可以按节点检查输入、输出和状态 | 跨节点状态变化仍可能复杂 |
| 适用任务 | RAG、审批、代码修复、人工审核 | 简单聊天可能显得繁琐 |

LangGraph 不是“自动帮我画图”，而是要求开发者先把业务流程想清楚。它牺牲了一些即时生成的灵活性，换来了可控、可重放和可测试的执行路径。

## 七、四种框架的关键差异：涌现与控制

### 1. 涌现式协作

AutoGen 和 CAMEL 更接近涌现式协作：开发者设定角色、目标和少量规则，具体讨论路径由 Agent 在对话中产生。它的优点是灵活，适合探索性任务；缺点是难预测、难复现，容易出现重复讨论和无效输出。

### 2. 显式控制

LangGraph 更接近显式控制：开发者定义状态、节点、边、条件和循环。它的优点是流程可审计，缺点是需要写更多设计代码，早期开发成本更高。

### 3. 工程化中间路线

AgentScope 关注的是把任何协作方式放进稳定的运行时：消息结构、并发、分布式、容错和监控先有工程边界，再在边界内选择 Agent 协作方式。

我的理解是，这不是“灵活”和“严格”谁更高级，而是任务风险不同。内容创作可以接受一定探索性，金融审批和生产发布则必须把关键决策写成显式条件。

## 八、如何选择框架

| 需求特征 | 优先考虑 | 原因 |
| --- | --- | --- |
| 多角色连续讨论 | AutoGen | 群聊和角色分工直观 |
| 大规模并发、异步、分布式 | AgentScope | 工程运行时能力更完整 |
| 两个专家自主协作 | CAMEL | 角色扮演和初始提示简洁 |
| 审批、RAG、循环修复、人工节点 | LangGraph | 状态图和条件边清晰 |
| 极简单任务 | 直接代码 | 不引入不必要的框架复杂度 |

选型时建议按以下顺序判断：

1. 先判断任务是对话协作还是流程控制。
2. 再判断是否需要并发、持久化、分布式和容错。
3. 再判断结果是否需要审计、回放和人工复核。
4. 最后才比较生态、插件和团队熟悉度。

### 典型场景建议

- **智能客服**：如果重点是高并发、7×24 稳定运行，优先考虑 AgentScope 或代码主导的服务，并把模型调用和缓存做成独立服务。
- **科研写作**：如果重点是研究员和作者的多轮深度讨论，可以用 CAMEL；如果需要文献检索、审稿、重写和人工节点，LangGraph 更容易控制。
- **金融风控**：优先 LangGraph 或纯代码工作流，把资料审核、风险评估、额度计算、合规检查和人工复核写成显式节点，避免让开放式对话直接决定最终结果。

## 九、章节小结

第六章真正要掌握的不是四个框架的安装命令，而是四种不同的系统设计视角：

1. **AutoGen**：把协作看成一场由多个专业角色参与的对话。
2. **AgentScope**：把 Agent 看成由消息、模型、工具和运行时组成的工程系统。
3. **CAMEL**：通过角色扮演和初始提示，让协作行为自然展开。
4. **LangGraph**：把 Agent 流程明确建模为状态、节点、边和循环。

{% note primary %}
复习口诀：AutoGen 看对话，AgentScope 看消息，CAMEL 看角色，LangGraph 看状态图。
{% endnote %}

学习完这一章后，我对“框架”的理解发生了变化：框架不是把代码变少这么简单，它是在替我们规定边界。选择框架时，真正要问的是——这个任务更需要自由协作，还是更需要确定性；更需要快速试验，还是更需要长期运行和审计。

## 十、课后习题详解

下面的回答按照课程习题顺序整理。答案不是唯一实现，重点是说明为什么这样设计，以及哪些地方需要从“能运行”继续补到“可上线”。

### 1. AutoGen、LangGraph 与两种设计哲学

#### 1.1 两个框架的深入对比

这里选择 AutoGen 和 LangGraph 进行对比，因为它们分别代表了“对话驱动协作”和“显式状态控制”两条路线。

| 维度 | AutoGen | LangGraph |
| --- | --- | --- |
| 协作模式 | 多个带角色的 Agent 通过消息和群聊协作 | 多个节点读写共享 State，按边和条件跳转 |
| 控制方式 | 依赖系统消息、Team、发言规则和终止条件 | 依赖节点函数、条件边、循环和明确的结束节点 |
| 过程灵活性 | 高，模型可以在对话中临时调整方向 | 中高，方向由代码定义，变化要体现在状态或路由函数里 |
| 可预测性 | 相对较低，同一任务可能产生不同对话路径 | 相对较高，图结构和条件可以固定、测试和回放 |
| 调试方式 | 查看完整对话、角色输出和终止原因 | 查看每个节点的输入、输出、State 变化和边判断 |
| 适用场景 | 需求讨论、头脑风暴、代码协作、研究型对话 | RAG、审批、代码修复、人工审核、可审计业务流程 |
| 主要风险 | 对话漂移、重复发言、Token 成本和循环 | State 设计复杂、样板代码多、流程过于僵硬 |

同一个“代码生成任务”在两个框架中的思路不同：

- AutoGen 会让产品经理、工程师和审查员围绕代码对话，审查员可以根据上下文提出新的修改要求。
- LangGraph 会把“需求分析→代码生成→测试→修复→审查→结束”定义成节点和边，测试失败时回到修复节点，超过次数则进入人工节点。

#### 1.2 如何理解“涌现式协作”和“显式控制”？

**涌现式协作**是先定义角色、目标和沟通规则，再让模型在对话中产生具体分工。例如研究员提出问题，作者根据研究员的意见写作，下一轮如何展开由双方当前输出决定。它适合目标开放、路径未知的任务，但结果不一定稳定，测试和复现难度较高。

**显式控制**是把业务流程提前写成节点、状态和条件。例如“资料不完整就退回补充，风险分数超过阈值就人工复核，合规通过才允许放款”。它牺牲了部分自由度，却换来了审计性、可预测性和可回放性。

我的判断是：探索阶段可以容忍涌现，决策阶段必须增加显式控制。实际系统经常采用混合模式：让 LLM 负责理解、分类和提出建议，让程序负责权限、阈值、状态迁移和最终提交。

### 2. AutoGen 软件开发团队的扩展

#### 2.1 支持动态回退的协作流程

`RoundRobinGroupChat` 的固定顺序只能表达“每个人依次发言”，不能自然表达“审查不通过后回到产品经理重新确认需求”。解决方法是给团队增加结构化状态和路由规则，不要只依赖某句自然语言。

建议为每轮协作维护以下状态：

```text
stage: 当前阶段
requirement_version: 需求版本
code_version: 代码版本
review_status: pending / passed / rejected
review_feedback: 审查意见
retry_count: 当前回退次数
human_required: 是否需要人工介入
```

流程可以这样设计：

{% mermaid %}
flowchart TD
    P["🟣 产品经理<br>需求与验收标准"] --> E["🍑 工程师<br>生成实现"]
    E --> R["🟡 审查员<br>检查代码"]
    R --> D{"审查结果"}
    D -->|"通过"| Q["🟢 QA<br>运行测试"]
    D -->|"代码问题"| E
    D -->|"需求不清/有冲突"| P
    Q --> T{"测试结果"}
    T -->|"通过"| F["✅ 交付"]
    T -->|"失败"| E
    P --> H{"超过回退上限？"}
    H -->|"是"| M["👤 人工确认"]
    H -->|"否"| E
    style P fill:#E8D5F5,stroke:#CE93D8,color:#333
    style E fill:#FFDAB9,stroke:#FFB74D,color:#333
    style R fill:#FFF9C4,stroke:#F9A825,color:#333
    style D fill:#FFF9C4,stroke:#F9A825,color:#333
    style Q fill:#B5EAD7,stroke:#80CBC4,color:#333
    style T fill:#FFF9C4,stroke:#F9A825,color:#333
    style F fill:#B5EAD7,stroke:#80CBC4,color:#333
    style M fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

关键点有三个：

1. 审查员必须输出结构化的 `status`，不能只输出“感觉不太好”。至少区分 `code_error`、`requirement_conflict`、`security_risk` 和 `passed`。
2. 每次回退都增加 `retry_count`，超过 2～3 次后转人工，避免 Agent 互相推诿。
3. 回退时携带明确的反馈和版本号，避免工程师继续修改已经废弃的代码。

#### 2.2 增加 QA 测试工程师

QA 不应该只在对话中说“测试通过”，而应该拥有测试工具或执行器。它的系统消息可以这样设计：

````text
你是一名严格的 Quality Assurance 工程师。

职责：
1. 阅读产品需求、验收标准和工程师提交的代码。
2. 设计覆盖正常输入、边界输入、异常输入和权限场景的测试用例。
3. 使用测试工具运行代码，不要仅凭阅读代码判断通过。
4. 记录测试命令、输入、实际输出、预期输出和失败堆栈。
5. 只在所有阻断级问题解决后输出 TEST_PASS。

输出格式：
STATUS: PASS | FAIL | BLOCKED
TESTS_RUN: <数量>
FAILED_CASES: <失败用例列表>
BLOCKERS: <必须修复的问题>
NEXT_ACTION: <建议回到工程师、产品经理或人工审核>
````

在 AutoGen 中，可以让 QA 出现在代码审查之后；如果 QA 返回 `FAIL`，协调器把失败用例和日志发送给工程师，而不是让 QA 和工程师继续自由争论。这样做把自然语言协作变成了“对话 + 可验证执行”的组合。

#### 2.3 对话质量监控机制

建议建立一个独立的监控器，在每轮消息写入历史前检查：

| 检查项 | 检测方法 | 触发动作 |
| --- | --- | --- |
| 主题漂移 | 当前消息与任务目标的语义相似度下降 | 注入任务摘要，要求回到当前阶段 |
| 重复循环 | 最近 N 轮的 Agent 和内容高度重复 | 截断循环，要求总结或转人工 |
| 角色越界 | 工程师开始修改需求、QA 直接批准上线 | 拒绝该动作，重新发送角色边界 |
| 格式错误 | 缺少状态、代码块或工具参数 | 进入解析修复分支 |
| 成本异常 | Token、轮数或工具调用超过预算 | 停止或降级到人工 |
| 安全风险 | 出现密钥、越权命令或危险操作 | 阻断工具执行并报警 |

除了语义检查，还应该记录硬指标：总轮数、每个角色发言次数、工具调用次数、单轮延迟、Token 消耗和终止原因。监控器不能只依赖另一个 LLM 判断，权限和预算必须由程序强制执行。

### 3. AgentScope 的消息驱动与分布式问题

#### 3.1 消息驱动相比函数调用的优势

传统函数调用通常是：`A()` 直接调用 `B()`，调用者需要知道 B 的函数签名、运行位置和返回方式。消息驱动则是 A 发布一条带类型和元数据的消息，由消息中心或订阅者决定谁接收和何时处理。

消息驱动的优势：

1. **解耦**：发送者不依赖接收者的内部实现，可以替换 Agent 或把它迁移到另一台机器。
2. **异步**：发送消息后不必一直阻塞等待，适合模型调用、工具调用和长任务。
3. **广播与扩展**：一条事件可以同时交给裁判、玩家、日志服务和监控服务。
4. **可追踪**：消息带有 `message_id`、`trace_id`、发送者、接收者和时间戳，便于回放和审计。
5. **容错**：失败消息可以重试、转死信队列或交给备用 Agent。

它特别适合实时游戏、客服路由、分布式研究、事件驱动自动化和多租户 Agent 平台。简单的单函数计算则不需要引入消息系统，否则会增加序列化和运维成本。

#### 3.2 设计“猎人”结构化输出模型

猎人只有在被淘汰后才能决定是否开枪，模型需要同时满足角色状态和业务规则：

````python
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class HunterStatus(str, Enum):
    DEAD = "dead"


class HunterAction(BaseModel):
    status: HunterStatus
    should_shoot: bool = Field(description="是否发动猎人技能")
    target_id: str | None = Field(default=None, description="目标玩家编号")
    reason: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_action(self):
        # 只有死亡状态下才允许提交猎人动作。
        if self.status != HunterStatus.DEAD:
            raise ValueError("猎人只有被淘汰后才能行动")

        # 开枪必须有目标，不开枪不能携带目标。
        if self.should_shoot and not self.target_id:
            raise ValueError("开枪时必须指定 target_id")
        if not self.should_shoot and self.target_id is not None:
            raise ValueError("不开枪时 target_id 必须为空")
        return self
````

模型校验只是第一层。游戏状态层还需要检查目标是否存活、是否为自己、猎人技能是否已经使用，以及当前是不是允许执行该动作。模型负责表达意图，规则引擎负责裁决。

#### 3.3 分布式实时游戏的挑战

当不同 Agent 分布在不同服务器上，主要会遇到：

- **消息顺序**：玩家 A 的投票可能晚于玩家 B 的结果到达。
- **重复投递**：网络重试可能让同一条行动被执行两次。
- **状态一致性**：多个节点同时修改夜晚阶段、玩家存活状态和技能状态。
- **网络延迟**：某个 Agent 超时会阻塞整轮游戏。
- **节点故障**：玩家 Agent 或消息服务宕机后需要恢复上下文。
- **版本兼容**：不同服务升级后可能理解不同的消息结构。

可采用以下策略：

1. 每局游戏分配 `game_id`，每个事件带单调递增的 `sequence` 和唯一 `event_id`。
2. 用消息队列或 Actor 模型按 `game_id` 分区，保证同一局消息进入同一顺序流。
3. 处理器使用幂等表记录已完成的 `event_id`，重复消息只返回旧结果。
4. 用单一裁判或状态机提交关键状态，玩家 Agent 只能提出动作，不能直接修改公共状态。
5. 设置超时、补偿、快照和重放机制；无法恢复时暂停该局并转人工。

### 4. CAMEL 的冲突解决与 Workforce

#### 4.1 两个 Agent 对是否结束意见不一致

不能把 `<CAMEL_TASK_DONE>` 当成绝对终止命令。可以把终止设计成一个两阶段协议：

```text
DONE_REQUEST：某个 Agent 认为任务完成，并提交成果摘要与验收项
DONE_REVIEW：另一个 Agent 或仲裁器检查事实、结构和必需交付物
DONE_ACCEPT：所有必需项通过，允许结束
DONE_REJECT：列出未完成项，生成下一轮补充任务
```

推荐流程是：

1. 任一 Agent 只能提交 `DONE_REQUEST`，不能直接结束会话。
2. 仲裁器读取双方的完成理由、未解决问题和验收清单。
3. 如果只是意见差异，要求双方各自给出证据，而不是继续泛泛争论。
4. 如果仍不一致，按优先级处理：硬性验收条件优先于角色偏好，客观测试结果优先于主观判断。
5. 达到最大冲突次数后转人工，并保留争议上下文。

这样可以把“是否完成”从自然语言判断提升为一个可审计的状态转换。

#### 4.2 Workforce 与 AutoGen 群聊的区别

AutoGen 群聊通常把多个 Agent 放在共享对话空间里，由 Team 或调度器决定谁发言。CAMEL Workforce 更接近任务分派系统：一个协调者接收任务，将任务拆分并分发给不同 Worker，再汇总子任务结果。

{% mermaid %}
flowchart LR
    A["👤 总任务"] --> B["🟣 Workforce Coordinator<br>拆解与分派"]
    B --> C["🍑 Worker A<br>检索"]
    B --> D["🍑 Worker B<br>分析"]
    B --> E["🍑 Worker C<br>写作"]
    C --> F["🟡 汇总与验收"]
    D --> F
    E --> F
    F -->|"缺项"| B
    F -->|"通过"| G["🟢 最终结果"]
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#E8D5F5,stroke:#CE93D8,color:#333
    style C fill:#FFDAB9,stroke:#FFB74D,color:#333
    style D fill:#FFDAB9,stroke:#FFB74D,color:#333
    style E fill:#FFDAB9,stroke:#FFB74D,color:#333
    style F fill:#FFF9C4,stroke:#F9A825,color:#333
    style G fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

| 对比项 | AutoGen 群聊 | CAMEL Workforce |
| --- | --- | --- |
| 主要组织方式 | 共享会话中的多角色发言 | 协调者分解任务并管理 Worker |
| 协作粒度 | 消息和轮次 | 子任务和交付物 |
| 并行性 | 取决于 Team 和调度配置 | 更容易按独立子任务并行 |
| 适合场景 | 连续讨论、互相审阅、角色辩论 | 研究分工、任务树、较大项目 |
| 主要风险 | 对话膨胀、发言循环 | 分解错误、子任务之间上下文断裂 |

### 5. LangGraph 线性问答与循环扩展

#### 5.1 “理解—搜索—回答”的图结构

可以定义以下状态：

```text
question：用户问题
intent：问题类型
need_search：是否需要搜索
search_results：搜索结果
answer：当前答案
quality_score：质量评分
retry_count：重试次数
```

图结构如下：

{% mermaid %}
flowchart TD
    S["START"] --> U["understand<br>识别意图"]
    U --> C{"need_search？"}
    C -->|"否"| A["answer<br>直接回答"]
    C -->|"是"| R["search<br>检索资料"]
    R --> A
    A --> E["END"]
    style S fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style U fill:#E8D5F5,stroke:#CE93D8,color:#333
    style C fill:#FFF9C4,stroke:#F9A825,color:#333
    style R fill:#FFDAB9,stroke:#FFB74D,color:#333
    style A fill:#B5EAD7,stroke:#80CBC4,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

`understand` 只负责分类，不直接生成答案；`search` 只负责获取资料；`answer` 只负责根据问题和上下文生成回答。这样每个节点都可以单独测试。

#### 5.2 增加反思节点和条件循环

如果答案过短、没有回答问题、没有引用来源或与检索资料矛盾，就把 `quality_ok` 设为 `False`。反思节点应输出结构化反馈，例如 `missing_detail`、`unsupported_claim`、`need_better_source`。

```text
answer → reflect
reflect → END：质量合格
reflect → search：需要补充资料
reflect → answer：资料足够但表达不完整
reflect → HUMAN：超过最大重试次数或存在高风险判断
```

循环必须有边界：设置 `retry_count` 上限、记录每轮质量分数、检测重复搜索词，并在无法改善时输出当前结果和失败原因，而不是无限重试。

#### 5.3 代码生成—测试—修复循环

这是 LangGraph 很适合的场景，因为测试结果可以作为明确的状态输入：

{% mermaid %}
flowchart TD
    T["🔵 需求"] --> G["🟣 generate<br>生成代码"]
    G --> X["🍑 test<br>运行测试"]
    X --> D{"测试通过？"}
    D -->|"是"| R["🟢 review<br>代码审查"]
    D -->|"否"| F["🟡 fix<br>根据日志修复"]
    F --> L{"修复次数 < 3？"}
    L -->|"是"| X
    L -->|"否"| H["👤 人工处理"]
    R --> Q{"审查通过？"}
    Q -->|"是"| E["✅ END"]
    Q -->|"否"| F
    style T fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style G fill:#E8D5F5,stroke:#CE93D8,color:#333
    style X fill:#FFDAB9,stroke:#FFB74D,color:#333
    style D fill:#FFF9C4,stroke:#F9A825,color:#333
    style R fill:#B5EAD7,stroke:#80CBC4,color:#333
    style F fill:#FFF9C4,stroke:#F9A825,color:#333
    style L fill:#FFF9C4,stroke:#F9A825,color:#333
    style H fill:#FFB3C6,stroke:#F48FB1,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

节点职责可以明确为：

- `generate`：根据需求和约束生成代码，并保存版本号。
- `test`：在隔离环境运行单元测试、静态检查和安全扫描。
- `fix`：读取失败日志，只修改与失败相关的部分。
- `review`：检查可读性、依赖、权限和潜在回归。
- `human`：处理连续失败、危险权限或模型无法判断的情况。

### 6. 三个产品场景的框架选型

#### 应用 A：每秒 1000+ 请求的智能客服

**推荐：AgentScope 或代码主导的服务，AgentScope 负责 Agent 运行时，外围使用成熟的网关、队列和缓存。**

原因：

1. 主要矛盾是吞吐、延迟、水平扩展和故障恢复，而不是多个角色自由讨论。
2. 需要异步处理、连接池、缓存、限流、熔断、降级和会话隔离。
3. 客服问题可以先由轻量分类器路由：FAQ 直接检索，复杂问题才调用 Agent。
4. 7×24 运行要求完整日志、指标、告警、灰度发布和故障转移。

不建议让 AutoGen 或 CAMEL 负责每个请求的长对话协作，因为多轮 Agent 对话会放大延迟和成本。也不应把所有请求都交给最强模型；应按问题类型设置模型层级和缓存策略。

#### 应用 B：科研论文辅助写作平台

**推荐：CAMEL 作为研究员—作者协作原型；如果需要文献检索、实验执行、审阅回退和人工确认，则采用 CAMEL + LangGraph 的混合方案。**

原因：

1. 研究员和作者天然是两个不同角色，角色扮演能够快速建立分工。
2. 文献综述、实验设计和论文写作需要多轮讨论，允许一定探索性。
3. 文献检索、引用校验、数据分析和章节审阅又需要显式节点，避免把未经验证的内容直接写入论文。
4. 论文生成必须保存来源、版本、审阅意见和修改轨迹，便于回溯。

可以采用这样的混合结构：LangGraph 负责“检索→分析→写作→审阅→修改”的主流程，CAMEL 负责其中研究员与作者的讨论子图。这样既保留角色协作的灵活性，又有整体流程的可控边界。

#### 应用 C：金融风控审批系统

**推荐：LangGraph 或纯代码工作流，不能让开放式多 Agent 对话直接决定最终放款。**

原因：

1. 资料审核、风险评估、额度计算、合规检查和人工复核有明确顺序与分支。
2. 每个决策都要保存输入、规则版本、模型版本、证据和审批人。
3. 需要在节点级别实现权限隔离，模型只能提出建议，不能绕过合规节点。
4. 需要支持暂停、人工接管、重放、申诉和审计查询。

建议把模型放在“资料抽取、风险摘要、异常解释”等辅助节点，把最终阈值判断、额度公式、黑名单校验和人工复核写成确定性代码。LangGraph 负责状态迁移和人工节点，数据库负责持久化审批状态。

| 应用 | 首选 | 可组合方案 | 不建议作为唯一核心 |
| --- | --- | --- | --- |
| 高并发客服 | AgentScope / 代码服务 | 分类器 + RAG + 缓存 + Agent | CAMEL 长对话 |
| 科研写作 | CAMEL | CAMEL 协作子图 + LangGraph 主流程 | 单一万能 Agent |
| 金融风控 | LangGraph / 纯代码 | LLM 抽取 + 规则引擎 + 人工审核 | 开放式群聊直接决策 |

## 参考资料

- [Datawhale《Hello-Agents》第六章：框架开发实践](https://datawhalechina.github.io/hello-agents/)
- [AutoGen 官方文档](https://microsoft.github.io/autogen/)
- [AgentScope 官方文档](https://doc.agentscope.io/)
- [CAMEL 官方文档](https://docs.camel-ai.org/)
- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)

本文是个人学习笔记。框架 API 和版本会持续变化，实际开发时应以当前官方文档为准，并为模型调用、工具执行、状态持久化、权限和成本控制补充工程测试。
