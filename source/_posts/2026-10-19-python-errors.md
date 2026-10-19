---
title: 07｜异常处理：让失败有明确结果
date: 2026-10-19 10:10:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 异常处理
  - 调试
series: python-tutorial
description: 区分语法错误与运行时异常，学习捕获、抛出和自定义异常，并用 finally 与 with 确保资源清理。
---

> 可靠程序不是永远不出错，而是能区分哪些错误可以恢复、哪些必须停止，并把原因留给人检查。

## 错误发生时，程序可以做什么

尝试读取不存在的文件会产生异常；漏掉冒号则是语法错误。二者发生的时机不同：语法错误在代码运行前阻止程序解析，异常则通常在程序执行过程中出现。

```python
print("hello"  # 缺少右括号，属于 SyntaxError
```

```python
number = int("not-a-number")  # 语法正确，运行时触发 ValueError
```

异常（exception）不是需要一概消灭的东西。它是 Python 告诉程序“当前操作无法按预期完成”的机制。重点是只在能采取明确措施的位置处理它。

## 用 try/except 处理可预期失败

```python
from pathlib import Path

path = Path("settings.json")

try:
    text = path.read_text(encoding="utf-8")
except FileNotFoundError:
    print("配置文件不存在，使用默认设置")
else:
    print(f"读取了 {len(text)} 个字符")
```

`except` 捕获指定异常；`else` 只在没有异常时运行。捕获具体异常比裸写 `except:` 更安全，因为后者可能把程序退出信号等也吞掉。

如果需要记录错误并继续抛出，可以使用 `raise`：

```python
try:
    config = load_config(path)
except OSError as error:
    logger.error("读取配置失败：%s", error)
    raise
```

这里记录上下文后继续抛出，让上层决定是否终止。不要只记录错误然后返回伪造的成功结果。

## 转换异常，补充业务含义

底层异常有时无法说明业务上发生了什么。可以捕获后抛出更有意义的异常，并通过 `from` 保留原因链：

```python
class InvalidConfigError(Exception):
    """配置内容缺少必需字段。"""


def require_source(config: dict) -> str:
    try:
        return config["source"]
    except KeyError as error:
        raise InvalidConfigError("配置必须包含 source 路径") from error
```

调用者看到 `InvalidConfigError`，维护人员仍可从 traceback 追踪原始 `KeyError`。自定义异常通常继承 `Exception`，并按模块或业务领域命名。

异常继承有层级关系。捕获父类会匹配它的子类，因此多个 `except` 子句应从具体到一般排列：

```python
try:
    data = int(user_text)
except ValueError:
    print("请输入整数")
except Exception:
    print("发生了其他未预期错误")
```

如果未预期错误没有合理恢复办法，通常应该让它继续暴露，而不是显示一个模糊提示后假装成功。

## 清理资源：finally 和 with

`finally` 中的代码无论是否发生异常都会执行，适合释放必须手动管理的资源：

```python
resource = acquire_resource()
try:
    use_resource(resource)
finally:
    resource.close()
```

更常见的文件场景应使用 `with`。上下文管理器会在离开代码块时完成清理：

```python
with open("report.txt", encoding="utf-8") as file:
    content = file.read()
```

`with` 背后使用上下文管理协议。像文件、锁和临时目录这样的对象，通常都提供了这种自动清理方式。

## 同时报告多个独立错误

有时一批输入中多个项目都失败，停止在第一个错误会让使用者反复修正、重跑。Python 3.11 起提供 `ExceptionGroup` 和 `except*`，用于分组并分别处理多个异常：

```python
errors = [ValueError("数量无效"), TypeError("名称类型错误")]
raise ExceptionGroup("输入校验失败", errors)
```

```python
try:
    validate_batch()
except* ValueError as group:
    print(f"有 {len(group.exceptions)} 个值错误")
except* TypeError as group:
    print(f"有 {len(group.exceptions)} 个类型错误")
```

`except*` 不是普通 `except` 的通用替代品。只有操作确实会汇集多个并行错误时才需要它；普通单个失败仍用常规异常处理。

异常也可以通过 `add_note()` 添加诊断说明，而不覆盖原始错误类型：

```python
try:
    process_file(path)
except OSError as error:
    error.add_note(f"处理的输入文件：{path}")
    raise
```

## 选择处理边界

{% mermaid %}
flowchart TD
    Start["🔵 执行操作"] --> Check{"🟡 是否预期可能失败？"}
    Check -->|是| Catch["🟣 捕获具体异常"]
    Check -->|否| Raise["🍑 让未预期错误暴露"]
    Catch --> Recover{"🟡 有明确恢复策略？"}
    Recover -->|有| Continue["🟢 恢复并记录结果"]
    Recover -->|没有| Context["🌸 添加上下文后重新抛出"]
    style Start fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Check fill:#FFF9C4,stroke:#F9A825,color:#333
    style Catch fill:#E8D5F5,stroke:#CE93D8,color:#333
    style Raise fill:#FFDAB9,stroke:#FFAB76,color:#333
    style Recover fill:#FFF9C4,stroke:#F9A825,color:#333
    style Continue fill:#B5EAD7,stroke:#80CBC4,color:#333
    style Context fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

## 常见误区

| 写法 | 风险 | 更好的做法 |
| --- | --- | --- |
| `except:` | 可能吞掉退出信号和程序错误 | 捕获具体异常类型 |
| 捕获后什么也不做 | 错误消失，调用者误以为成功 | 记录并恢复，或重新抛出 |
| 用异常代替普通条件判断 | 控制流不清晰 | 可预期的正常分支用 `if` |
| 在底层模块显示 GUI 提示框 | 业务逻辑被界面绑住 | 抛出有意义异常，由界面层决定如何展示 |

## 练习：批量检查配置

编写函数读取 JSON 配置并检查 `source` 字段。文件缺失时返回默认配置；JSON 格式错误时抛出自定义 `InvalidConfigError`，并保留原始异常原因。用 `with` 打开文件，确保清理由上下文管理器完成。

## 下一步

异常定义失败时的边界，类则可以把状态和相关行为放在一起。下一篇将从对象和命名空间开始，认识类、实例、继承与生成器。

**官方资料**：[错误和异常](https://docs.python.org/zh-cn/3.14/tutorial/errors.html)。
