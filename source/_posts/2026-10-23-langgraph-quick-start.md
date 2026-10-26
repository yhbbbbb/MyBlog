---
title: LangGraph 快速入门：用状态图构建可控的 Agent 工作流
date: 2026-10-23 10:00:00
update: 2026-10-26 10:00:00
categories:
  - AI Agent
tags:
  - LangGraph
  - Python
  - Agent
  - LangChain
description: 从 State、Node、Edge 和 Checkpoint 出发，使用 Python 构建一个带工具调用、条件分支和记忆能力的 LangGraph Agent。
---

> Agent 的关键不是让模型“自己想很多步”，而是把每一步的状态、可用工具和下一步路径定义清楚。LangGraph 用图结构把这种流程变成可以检查、暂停和恢复的程序。

## 为什么需要 LangGraph

只用一次 LLM 调用时，代码通常是“准备提示词、调用模型、读取回答”。但真实应用很快会出现更多步骤：先判断用户意图，再查询数据库；工具失败时重试；需要人工确认时暂停；对话继续时保留前面的消息；最终还要记录每一步发生了什么。

如果这些逻辑全部写在一个很长的 `while` 循环里，状态变量、异常处理和分支条件会互相缠绕。LangGraph 将流程拆成四类对象：

| 对象 | 作用 | 在代码中的表现 |
| --- | --- | --- |
| State | 保存节点之间共享的数据 | `TypedDict`、`MessagesState` |
| Node | 修改状态的函数或 Runnable | `def call_model(state): ...` |
| Edge | 决定下一步走向 | `add_edge`、`add_conditional_edges` |
| Checkpoint | 保存某次运行的状态 | `InMemorySaver`、数据库 Checkpointer |

图不是为了画一张漂亮的流程图，而是为了让执行边界变得明确：节点接收什么、返回什么、什么条件会转向哪里、何时结束。

## 一张图看懂最小执行模型

{% asset_img langgraph-flow.svg LangGraph Agent 的状态、节点、工具和条件边流程图 %}

图中每次节点执行都会读取当前 State，并返回需要合并回 State 的字段。模型节点可以直接结束，也可以请求工具；工具节点执行完成后，边再把控制权交回模型。[下载可编辑的 Excalidraw 源文件](/MyBlog/2026/10/23/langgraph-quick-start/langgraph-flow.excalidraw)。SVG 和源文件保存在本文资源目录中。

## 准备环境

下面示例以 Python 3.10+ 为基线。LangGraph 本身负责图执行，模型和工具通常来自 LangChain 集成包。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -U langgraph langchain langchain-openai
```

如果使用其他模型提供商，只替换对应的模型集成包和初始化代码即可。不要把 API Key 写进源码或提交到 Git：

```powershell
$env:OPENAI_API_KEY = "你的 API Key"
```

在 CI 或生产环境中，应使用 GitHub Actions Secrets、系统环境变量或密钥服务注入凭据。本文代码以 LangGraph 当前 Python API 为主，具体模型参数和包版本请以官方文档为准。

## 第一个图：节点和边

先不接模型，用一个计数器理解图的基本执行方式。State 是节点之间传递的字典，节点返回的字段会合并回当前状态。

```python
from typing_extensions import TypedDict
from langgraph.graph import START, END, StateGraph


class CounterState(TypedDict):
    count: int
    message: str


def add_one(state: CounterState) -> dict:
    return {"count": state["count"] + 1}


def format_message(state: CounterState) -> dict:
    return {"message": f"当前计数：{state['count']}"}


builder = StateGraph(CounterState)
builder.add_node("add_one", add_one)
builder.add_node("format_message", format_message)
builder.add_edge(START, "add_one")
builder.add_edge("add_one", "format_message")
builder.add_edge("format_message", END)

graph = builder.compile()
result = graph.invoke({"count": 0, "message": ""})
print(result)
```

执行顺序是 `START -> add_one -> format_message -> END`。`compile()` 会校验图的连接关系并返回可执行对象；之后可以用 `invoke()` 执行一次，用 `stream()` 观察中间事件。

```python
for event in graph.stream({"count": 2, "message": ""}, stream_mode="updates"):
    print(event)
```

调试 Agent 时，先把每个节点的输入和输出记录下来，比只打印最终回答更容易定位问题。

## 用条件边构建决策

真实流程很少只有一条直线。条件边的路由函数读取 State，返回一个字符串；这个字符串通过映射表对应到下一个节点。

```python
from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import START, END, StateGraph


class TicketState(TypedDict):
    question: str
    category: str
    answer: str


def classify(state: TicketState) -> dict:
    question = state["question"]
    if "退款" in question or "报销" in question:
        return {"category": "policy"}
    return {"category": "general"}


def route(state: TicketState) -> Literal["policy", "general"]:
    return state["category"]


def answer_policy(state: TicketState) -> dict:
    return {"answer": "请先检索当前生效的制度原文，再给出带来源的回答。"}


def answer_general(state: TicketState) -> dict:
    return {"answer": "这是一个通用问题，可以交给普通问答节点处理。"}


builder = StateGraph(TicketState)
builder.add_node("classify", classify)
builder.add_node("policy", answer_policy)
builder.add_node("general", answer_general)
builder.add_edge(START, "classify")
builder.add_conditional_edges(
    "classify",
    route,
    {"policy": "policy", "general": "general"},
)
builder.add_edge("policy", END)
builder.add_edge("general", END)
ticket_graph = builder.compile()
```

路由函数最好只负责决策，不在里面执行副作用。把分类、检索、生成分别建成节点，便于替换实现、单独测试和统计耗时。

## 接入消息和工具调用

Agent 常见的循环是“模型决定是否调用工具 -> 工具返回结果 -> 模型继续回答”。LangGraph 提供 `MessagesState` 保存消息列表；LangChain 的 `ToolNode` 可以执行模型请求的工具，`tools_condition` 可以根据最后一条消息是否包含工具调用来选择路径。

```python
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import START, END, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition


@tool
def get_weather(city: str) -> str:
    """返回示例天气；生产环境应调用真实天气 API。"""
    demo = {"北京": "晴，22°C", "上海": "小雨，19°C"}
    return demo.get(city, f"没有找到 {city} 的天气数据")


tools = [get_weather]
model = ChatOpenAI(model="gpt-4o-mini", temperature=0).bind_tools(tools)


def call_model(state: MessagesState):
    response = model.invoke(state["messages"])
    return {"messages": [response]}


builder = StateGraph(MessagesState)
builder.add_node("model", call_model)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "model")
builder.add_conditional_edges(
    "model",
    tools_condition,
    {"tools": "tools", END: END},
)
builder.add_edge("tools", "model")
agent = builder.compile()

result = agent.invoke({
    "messages": [HumanMessage(content="北京今天天气怎么样？")]
})
print(result["messages"][-1].content)
```

这段代码需要模型具备工具调用能力。`ToolNode` 并不会替你验证工具参数、权限或外部 API 的返回内容；生产代码应增加参数校验、超时、重试、限流和敏感操作确认。对于付款、删除、发送邮件等不可逆操作，建议在工具节点前增加人工审批节点。

## 状态设计的三个原则

### 状态保存事实，不保存过多临时文本

State 中应放后续节点真正需要的数据，例如 `messages`、`user_id`、`search_results`、`approved`。把整段调试日志和重复的提示词都塞进 State，会增加序列化、持久化和上下文成本。

### 节点返回增量更新

节点通常只返回它负责修改的字段：

```python
def retrieve(state):
    documents = search(state["messages"][-1].content)
    return {"documents": documents}
```

不要在每个节点里复制一份完整 State 再返回。字段越集中，越容易判断是谁改变了数据。

### 为消息字段定义合并规则

消息列表需要追加，而不是每次覆盖。`MessagesState` 已经提供了适合消息的 reducer；自定义 State 时，如果同一字段会被多个节点更新，要明确采用覆盖、追加还是自定义合并，否则并行节点可能产生难以解释的结果。

## Checkpoint：让 Agent 可恢复

没有 Checkpoint 时，`invoke()` 结束后，图运行期间的 State 不会自动成为下一次请求的记忆。开发阶段可以使用内存保存器：

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
agent = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "demo-user-001"}}
agent.invoke(
    {"messages": [HumanMessage(content="我在北京，天气如何？")]},
    config,
)
agent.invoke(
    {"messages": [HumanMessage(content="那上海呢？")]},
    config,
)
```

两次调用使用同一个 `thread_id`，图才有机会读取同一条会话的历史。`InMemorySaver` 只适合本地调试，服务重启后数据会消失；生产环境应根据官方支持情况选择数据库 Checkpointer，并设计会话过期、隐私删除和迁移策略。

Checkpoint 还可以支持：

- 在关键节点暂停，等待人工确认后继续；
- 某一步失败后从最近状态恢复，而不是从头调用模型；
- 查看某个线程的状态变化，重放一次问题；
- 在部署新版本前保留旧图运行记录。

## 常见错误和排查顺序

### `KeyError` 或节点读不到字段

先检查 State 类型定义、入口输入和上游节点返回值。节点返回的键必须与 State 字段一致；条件路由读取的字段必须在它之前被写入。

### 图编译失败或运行后没有结束

检查每个节点是否能从 `START` 到达，终止路径是否连接到 `END`，条件边映射的返回值是否覆盖所有分支。循环图必须有明确的退出条件，不能只依赖模型“应该会停”。

### 模型没有调用工具

确认模型支持 tool calling，且调用了 `bind_tools(tools)`；工具函数需要清晰的名称、参数类型和 docstring。打印模型返回的最后一条消息，检查是否真的存在 `tool_calls`。

### Checkpoint 看不到历史

检查每次调用是否传入相同的 `configurable.thread_id`，并确认使用的 Checkpointer 与图实例一致。多用户服务不能把所有请求复用同一个 thread ID。

### 流式输出与最终状态不一致

`stream()` 返回的是中间事件，事件模式不同，结构也不同。先固定 `stream_mode`，再把每类事件记录成测试样例；不要把中间 token 直接当成最终 State。

## 从 Demo 到生产的路线

可以按下面顺序逐步升级：

1. 用一个无模型的计数图验证 State、节点和边。
2. 接入一个只读工具，记录模型、工具和路由的每次输入输出。
3. 加入错误重试、超时、工具白名单和请求级 trace ID。
4. 为条件路由准备正例、边界例和错误路由测试。
5. 用 Checkpoint 支持会话恢复和人工审批，并明确数据保留策略。
6. 统计每个节点的延迟、失败率、Token 成本和循环次数。
7. 对高风险工具增加权限校验、幂等键和人工确认。

LangGraph 解决的是“如何编排和控制 Agent 执行过程”，不是自动替你解决知识库质量、提示词质量、模型幻觉或业务权限。它最有价值的地方，是让这些问题落在可以观察、测试和回滚的节点边界上。

## 参考资料

- [菜鸟教程：LangGraph 快速入门](https://www.runoob.com/ai-agent/langgraph-quick-start.html)，本文的入门阅读来源。
- [LangGraph 官方 Quickstart](https://docs.langchain.com/oss/python/langgraph/quickstart)，核对 `StateGraph`、节点、边和编译流程。
- [LangGraph 官方文档：Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)，核对 State、Reducer、START/END 和条件边。
- [LangGraph 官方文档：Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)，核对 Checkpoint、thread 和恢复机制。
- [LangGraph 官方文档：Prebuilt components](https://docs.langchain.com/oss/python/langgraph/prebuilt)，核对 `ToolNode` 和 `tools_condition`。

本文代码为教学示例，模型名称、包版本和集成接口可能随 SDK 更新；运行前请以对应版本官方文档为准。
