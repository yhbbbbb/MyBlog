---
title: Hello-Agents 第七章（三）：工具系统、搜索整合与异步执行
date: 2026-11-13 12:00:00
updated: 2026-11-13 12:00:00
categories:
  - 技术科普
tags:
  - Hello-Agents
  - Tool
  - RAG
  - 搜索
  - 异步编程
  - Python
series: hello-agents
description: 记录 Hello-Agents 工具基类、注册表、自定义计算器、多源搜索、工具链与异步执行器的实现。
---

{% cq %}
Agent 的能力边界，不由提示词决定，而由它被允许调用哪些工具决定。
{% endcq %}

## 一、为什么需要统一工具系统

模型只能生成文本，真正访问外部世界要依靠工具：

- 查询数据库。
- 调用搜索引擎。
- 读写文件。
- 执行计算。
- 调用企业内部 API。

如果每个 Agent 都直接 import 某个函数，工具会和 Agent 强耦合，后续很难替换。第七章的工具系统用三个对象解决这个问题：

1. BaseTool：统一工具接口。
2. ToolRegistry：工具注册、查询和执行。
3. ToolChain：把多个工具串成可复用流程。

## 二、BaseTool 和 ToolRegistry

所有工具都应该统一为“输入一个参数，返回一个结果”的可执行对象。即使底层返回多个字段，也应该在工具内部转换为字典或 JSON 字符串。

```python
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict


class BaseTool(ABC):
    """工具的最小公共接口。"""

    # name 用于模型选择工具，description 会被拼进系统提示词。
    name: str
    description: str

    @abstractmethod
    def execute(self, input_data: Any) -> Any:
        """执行工具，子类必须实现。"""
        raise NotImplementedError

    def run(self, input_data: Any) -> Any:
        """统一入口，后续可以在这里增加日志和耗时统计。"""
        # 不让调用方直接依赖 execute，便于未来统一增加鉴权、计时和重试。
        return self.execute(input_data)


class FunctionTool(BaseTool):
    """把普通函数包装成标准工具。"""

    def __init__(
        self,
        name: str,
        description: str,
        func: Callable[[Any], Any],
    ):
        self.name = name
        self.description = description
        self.func = func

    def execute(self, input_data: Any) -> Any:
        return self.func(input_data)


class ToolRegistry:
    """管理工具注册、描述和执行。"""

    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}

    def register_tool(self, tool: BaseTool) -> None:
        # 同名工具会造成模型选择歧义，所以注册时直接失败。
        if tool.name in self._tools:
            raise ValueError(f"工具已存在：{tool.name}")
        self._tools[tool.name] = tool

    def register_function(
        self,
        name: str,
        description: str,
        func: Callable[[Any], Any],
    ) -> None:
        self.register_tool(FunctionTool(name, description, func))

    def get_tool(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())

    def get_tools_description(self) -> str:
        if not self._tools:
            return "暂无可用工具"
        # 描述是给模型看的自然语言；真正执行时仍以工具对象为准。
        return "\n".join(
            f"- {tool.name}: {tool.description}"
            for tool in self._tools.values()
        )

    def execute_tool(self, name: str, input_data: Any) -> Any:
        # 所有工具调用都经过这一层，便于统一做权限、超时和审计。
        tool = self.get_tool(name)
        if tool is None:
            raise KeyError(f"工具不存在：{name}")
        return tool.run(input_data)
```

统一接口的意义在于：Agent 只需要知道工具名、描述和调用方法，不必关心工具是本地函数、远程 API 还是异步服务。

如果一个工具返回多个值，可以返回结构化字典：

```python
return {
    "title": "结果标题",
    "summary": "结果摘要",
    "url": "https://example.com",
}
```

生产代码中还应为结构化结果定义 Pydantic 模型，避免字段名称随意变化。

## 三、从 AST 安全实现计算器

不要直接使用 eval 计算模型生成的表达式。下面的计算器只允许 AST 中出现白名单节点：

```python
# my_calculator_tool.py
import ast
import math
import operator

from hello_agents import ToolRegistry


def my_calculate(expression: str) -> str:
    """安全计算基本四则运算和 sqrt。"""
    # 先拒绝空输入，避免把格式错误传给 AST 解析器。
    if not expression.strip():
        return "计算表达式不能为空"

    # 只登记允许的运算符；未登记的 AST 节点会在求值时被拒绝。
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
    }

    functions = {
        "sqrt": math.sqrt,
        "pi": math.pi,
    }

    try:
        # mode="eval" 只允许表达式，不允许执行任意多行 Python 代码。
        node = ast.parse(expression, mode="eval")
        result = _eval_node(node.body, operators, functions)
        return str(result)
    except (SyntaxError, ValueError, TypeError, ZeroDivisionError):
        return "计算失败，请检查表达式格式"


def _eval_node(node, operators, functions):
    """递归执行允许的 AST 节点。"""
    # 递归求值只接受数字、白名单运算符和白名单函数。
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("只允许数字常量")

    if isinstance(node, ast.BinOp):
        left = _eval_node(node.left, operators, functions)
        right = _eval_node(node.right, operators, functions)
        operation = operators.get(type(node.op))
        if operation is None:
            raise ValueError("不支持的运算符")
        return operation(left, right)

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("不支持的函数调用")
        function = functions.get(node.func.id)
        if not callable(function):
            raise ValueError("不支持的函数")
        args = [
            _eval_node(arg, operators, functions)
            for arg in node.args
        ]
        return function(*args)

    if isinstance(node, ast.Name) and node.id in functions:
        return functions[node.id]

    raise ValueError("表达式中包含不允许的语法")


def create_calculator_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register_function(
        name="my_calculator",
        description="支持 +、-、*、/ 和 sqrt 的安全计算器",
        func=my_calculate,
    )
    return registry
```

这里有两个工程要点：

- 白名单校验比黑名单过滤更可靠。
- 异常应该返回可理解的错误，而不是把完整堆栈直接交给用户。

## 四、多源搜索工具

真实搜索服务有密钥、依赖和网络失败问题，因此工具应该在初始化时探测可用源，在执行时按顺序降级。

```python
# my_advanced_search.py
import os
from typing import Any

from hello_agents import ToolRegistry


class MyAdvancedSearchTool:
    """整合 Tavily 和 SerpApi 的多源搜索工具。"""

    def __init__(self):
        self.name = "my_advanced_search"
        self.description = "整合多个搜索源并自动降级"
        self.search_sources: list[str] = []
        self._setup_search_sources()

    def _setup_search_sources(self):
        # 只启用已配置密钥且已安装依赖的搜索源。
        if os.getenv("TAVILY_API_KEY"):
            try:
                from tavily import TavilyClient

                self.tavily_client = TavilyClient(
                    api_key=os.getenv("TAVILY_API_KEY")
                )
                self.search_sources.append("tavily")
            except ImportError:
                print("Tavily 库未安装")

        if os.getenv("SERPAPI_API_KEY"):
            try:
                import serpapi  # noqa: F401

                self.search_sources.append("serpapi")
            except ImportError:
                print("SerpApi 库未安装")

    def search(self, query: str) -> str:
        # 查询为空时不发起任何外部请求，减少无效调用和成本。
        if not query.strip():
            return "搜索查询不能为空"

        if not self.search_sources:
            return (
                "没有可用的搜索源，请设置 TAVILY_API_KEY "
                "或 SERPAPI_API_KEY。"
            )

        # 按配置顺序依次尝试，前一个来源失败时自动降级到下一个。
        for source in self.search_sources:
            try:
                if source == "tavily":
                    result = self._search_with_tavily(query)
                else:
                    result = self._search_with_serpapi(query)

                if result:
                    return result
            except Exception as exc:
                # 一个搜索源失败时继续尝试下一个源。
                print(f"{source} 搜索失败：{exc}")

        return "所有搜索源都失败，请检查网络和 API 密钥。"

    def _search_with_tavily(self, query: str) -> str:
        response = self.tavily_client.search(query=query, max_results=3)
        output = []

        if response.get("answer"):
            output.append(f"AI 答案：{response['answer']}")

        for index, item in enumerate(
            response.get("results", [])[:3],
            start=1,
        ):
            output.append(
                f"[{index}] {item.get('title', '')}\n"
                f"{item.get('content', '')[:150]}"
            )

        return "\n\n".join(output)

    def _search_with_serpapi(self, query: str) -> str:
        import serpapi

        search = serpapi.GoogleSearch(
            {
                "q": query,
                "api_key": os.getenv("SERPAPI_API_KEY"),
                "num": 3,
            }
        )
        results = search.get_dict()

        output = []
        for index, item in enumerate(
            results.get("organic_results", [])[:3],
            start=1,
        ):
            output.append(
                f"[{index}] {item.get('title', '')}\n"
                f"{item.get('snippet', '')}"
            )
        return "\n\n".join(output)


def create_advanced_search_registry() -> ToolRegistry:
    registry = ToolRegistry()
    search_tool = MyAdvancedSearchTool()
    registry.register_function(
        name="advanced_search",
        description="整合 Tavily 和 SerpApi 的多源搜索",
        func=search_tool.search,
    )
    return registry
```

多源搜索的价值不只是“多一个 API”，而是把可用性从单点依赖变成故障转移：

- Tavily 失败时尝试 SerpApi。
- 没有任何密钥时给出配置提示。
- 所有错误都记录来源，便于排障。

## 五、工具链：把三个工具串起来

实际业务中，一个任务经常需要“搜索→抽取→计算”或“读取→转换→写入”。ToolChain 负责保存每一步的输入模板和输出键。

```python
from typing import Any, Dict, List, Optional

from hello_agents import ToolRegistry


class ToolChain:
    """按顺序执行多个工具。"""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.steps: List[Dict[str, Any]] = []

    def add_step(
        self,
        tool_name: str,
        input_template: str,
        output_key: Optional[str] = None,
    ):
        # output_key 让后续步骤可以通过模板引用当前步骤结果。
        self.steps.append(
            {
                "tool_name": tool_name,
                "input_template": input_template,
                "output_key": output_key
                or f"step_{len(self.steps)}_result",
            }
        )

    def execute(
        self,
        registry: ToolRegistry,
        initial_input: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        # 复制上下文，避免工具链修改调用方传入的原始字典。
        context = dict(context or {})
        context["input"] = initial_input

        # 工具链按声明顺序执行；有依赖关系的步骤不能并行。
        for index, step in enumerate(self.steps, start=1):
            try:
                tool_input = step["input_template"].format(**context)
            except KeyError as exc:
                return f"第 {index} 步模板变量不存在：{exc}"

            # 每一步都走 Registry，保持和单独调用工具相同的安全边界。
            result = registry.execute_tool(
                step["tool_name"],
                tool_input,
            )
            context[step["output_key"]] = result

        if not self.steps:
            return "工具链没有配置步骤"

        return context[self.steps[-1]["output_key"]]


class ToolChainManager:
    """管理多条可复用工具链。"""

    def __init__(self, registry: ToolRegistry):
        self.registry = registry
        self.chains: Dict[str, ToolChain] = {}

    def register_chain(self, chain: ToolChain) -> None:
        self.chains[chain.name] = chain

    def execute_chain(
        self,
        chain_name: str,
        input_data: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        if chain_name not in self.chains:
            return f"工具链不存在：{chain_name}"
        return self.chains[chain_name].execute(
            self.registry,
            input_data,
            context,
        )


def create_research_chain() -> ToolChain:
    chain = ToolChain(
        name="research_and_calculate",
        description="搜索、计算、总结",
    )
    chain.add_step("advanced_search", "{input}", "search_result")
    chain.add_step(
        "my_calculator",
        "2 + 2",
        "calculation_result",
    )
    return chain
```

工具链的三个关键设计点：

1. 模板变量必须在运行时校验。
2. 每一步要保存输入、输出和耗时。
3. 中间结果要可重放，失败时才能从失败步骤继续。

## 六、异步工具执行器

独立的搜索和计算任务之间没有数据依赖时，可以并行执行。线程池适合等待网络 I/O 的工具；如果是纯 CPU 计算，应该考虑进程池或专门的计算服务。

```python
import asyncio
import concurrent.futures
from typing import Dict, List

from hello_agents import ToolRegistry


class AsyncToolExecutor:
    """在线程池中并行执行阻塞型工具。"""

    def __init__(self, registry: ToolRegistry, max_workers: int = 4):
        self.registry = registry
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=max_workers
        )

    async def execute_tool_async(
        self,
        tool_name: str,
        input_data: str,
    ) -> str:
        # 获取当前事件循环，把同步阻塞工具交给线程池执行。
        loop = asyncio.get_running_loop()

        def call_tool():
            return self.registry.execute_tool(tool_name, input_data)

        # await 只等待结果，不会阻塞其他异步任务继续发起请求。
        return await loop.run_in_executor(
            self.executor,
            call_tool,
        )

    async def execute_tools_parallel(
        self,
        tasks: List[Dict[str, str]],
    ) -> List[str]:
        # 先创建所有协程，再用 gather 并行等待它们完成。
        coroutines = [
            self.execute_tool_async(
                task["tool_name"],
                task["input_data"],
            )
            for task in tasks
        ]
        return await asyncio.gather(*coroutines)

    def close(self) -> None:
        self.executor.shutdown(wait=True)


async def main():
    registry = ToolRegistry()
    executor = AsyncToolExecutor(registry, max_workers=4)

    tasks = [
        {"tool_name": "advanced_search", "input_data": "Python 历史"},
        {"tool_name": "advanced_search", "input_data": "机器学习趋势"},
        {"tool_name": "my_calculator", "input_data": "2 + 2"},
    ]

    try:
        results = await executor.execute_tools_parallel(tasks)
        for index, result in enumerate(results, start=1):
            print(f"任务 {index}：{result}")
    finally:
        # 无论任务成功还是失败，都要释放线程池资源。
        executor.close()


if __name__ == "__main__":
    asyncio.run(main())
```

### 6.1 什么时候并行有收益

设三个独立网络请求耗时分别是 2 秒、3 秒和 4 秒：

- 串行执行约 9 秒。
- 并行执行约等于最长请求耗时，再加上调度开销，约 4 秒。

但如果第二个工具必须使用第一个工具的输出，就不能并行。并行前要先画出依赖图：

{% mermaid %}
flowchart LR
    A["🔵 用户问题"] --> B["🟣 查询拆分"]
    B --> C["🍑 搜索源 A"]
    B --> D["🍑 搜索源 B"]
    B --> E["🍑 数据库查询"]
    C --> F["🟡 结果合并"]
    D --> F
    E --> F
    F --> G["🟢 统一回答"]
{% endmermaid %}

## 七、工具系统的安全边界

工具是 Agent 接触真实系统的入口，至少要增加：

- 参数白名单和类型校验。
- 超时、重试和熔断。
- 文件路径限制。
- 数据库只读权限。
- 外部请求域名白名单。
- 完整的调用日志和 trace_id。
- 高风险动作的人类确认。

模型可以提出“删除文件”的建议，但是否真的执行，必须由权限层和业务规则决定。

## 八、这一篇的回顾

工具系统的核心不是工具数量，而是稳定边界：

- BaseTool 统一行为。
- Registry 统一发现和执行。
- ToolChain 统一组合步骤。
- AsyncToolExecutor 统一并发。
- 权限、超时和日志必须由程序控制。

## 参考资料

- Datawhale《Hello-Agents》第七章：工具系统
- [HelloAgents GitHub](https://github.com/jjyaoao/helloagents)
- [Tavily 官方文档](https://docs.tavily.com/)
- [SerpApi 官方文档](https://serpapi.com/)

