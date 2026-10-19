---
title: 10｜Python 标准库实用工具（二）
date: 2026-10-19 10:40:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 标准库
  - 日志
  - 多线程
series: python-tutorial
description: 学习格式化输出、模板、struct、threading、logging、weakref、itertools 和 Decimal，理解工具适用边界。
---

> 线程可以让等待中的任务并行推进，却不会自动让程序更快、更安全。选工具之前，先确认瓶颈是什么。

## 从“脚本能运行”走向“脚本可维护”

标准库第二部分涉及一些更专门的工具：终端输出格式化、模板替换、二进制数据布局、多线程、日志、弱引用、列表工具和十进制计算。

不需要一次记住所有模块。可以从当前问题出发：输出给谁看、数据是什么格式、任务在等待还是计算、精度要求是什么，再选择对应工具。

## 格式化输出与模板

前文已经用 f-string 格式化输出。若模板和数据需要分开保存，可以使用 `string.Template`：

```python
from string import Template

message = Template("任务 $name 已完成，状态：$status")
print(message.substitute(name="日报", status="成功"))
```

`substitute()` 遇到缺失变量会报错；`safe_substitute()` 会保留未替换占位符，适合不完整模板的展示场景。涉及用户输入时，模板替换不等同于 HTML 或 SQL 安全转义，输出到特定语言仍要用对应的安全 API。

## 用 struct 读取固定二进制布局

文本适合人阅读，二进制数据常用于紧凑记录或协议。`struct` 可以按指定格式在 Python 值和字节串之间转换：

```python
import struct

record = struct.pack("<Ih", 1024, -3)
file_size, status = struct.unpack("<Ih", record)
print(file_size, status)
```

格式前缀 `<` 指定小端字节序，`I` 表示无符号整数，`h` 表示短整数。二进制格式必须明确字节序、字段宽度和对齐方式；读取外部数据时还要验证长度，不能直接假定输入完整。

## threading：适合等待型工作

线程（thread）让同一进程中的多个执行路径可以交错推进。对等待网络、磁盘或其他 I/O 的任务，多线程可以减少整体等待；对纯 Python 计算密集任务，线程通常不会让 CPU 计算按核心数线性加速。

线程间共享数据需要同步。锁（lock）可以保护临界区，但锁的范围应尽可能短：

```python
from threading import Lock, Thread

completed = 0
completed_lock = Lock()

def record_completion() -> None:
    global completed
    with completed_lock:
        completed += 1

workers = [Thread(target=record_completion) for _ in range(10)]
for worker in workers:
    worker.start()
for worker in workers:
    worker.join()

print(completed)
```

`join()` 等待线程结束。真实程序还要定义异常传递、取消和超时策略。CPU 密集型工作可以评估 `multiprocessing` 或其他并行工具；不要仅因“有线程”就认为任务已并行提速。

## logging：为运行留下可用记录

`print()` 适合临时查看结果，长期运行的程序应使用 `logging`：

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

logging.info("扫描完成：%d 个文件", 12)
logging.warning("目标目录暂时不可达")
```

日志级别从低到高通常包括 `DEBUG`、`INFO`、`WARNING`、`ERROR` 和 `CRITICAL`。使用参数化消息 `logging.info("结果 %s", value)`，比先用 f-string 拼好字符串更方便日志系统判断是否需要格式化。

应用程序通常应配置命名 logger 和 handler，而不是在每个模块重复调用 `basicConfig()`。日志也要注意轮转、保留周期和敏感信息脱敏。

## 弱引用和迭代工具

弱引用（weak reference）不会阻止对象被垃圾回收，适用于缓存或观察关系等特定场景。它不是替代正常引用的默认方式；需要保证对象存活时，应持有普通引用。

`itertools` 提供组合、分组和迭代器链等工具：

```python
from itertools import islice

numbers = (number * number for number in range(1_000_000))
print(list(islice(numbers, 5)))
```

`islice` 只取前几个结果，不需要先创建百万项列表。迭代器工具适合数据流式处理；如果需要重复遍历或随机访问，先物化成列表会更直白。

## Decimal：需要十进制精确规则时

二进制浮点数无法精确表示很多十进制小数。财务金额等需要十进制规则的场景，可以用 `decimal.Decimal`：

```python
from decimal import Decimal

price = Decimal("0.10")
quantity = 3
total = price * quantity
print(total)  # 0.30
```

应从字符串构造 `Decimal`。`Decimal(0.1)` 会把已经近似表示的二进制浮点值带进来，失去使用十进制类型的意义。舍入规则也应依据业务明确设置。

{% mermaid %}
flowchart TD
    Need["🔵 遇到实现需求"] --> Kind{"🟡 问题类型？"}
    Kind -->|长期运行诊断| Log["🟢 logging"]
    Kind -->|I/O 等待| Thread["🍑 threading + 同步"]
    Kind -->|固定二进制布局| Struct["🟣 struct"]
    Kind -->|十进制精度| Decimal["🌸 Decimal"]
    Kind -->|迭代器组合| Iter["🟡 itertools"]
    style Need fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Kind fill:#FFF9C4,stroke:#F9A825,color:#333
    style Log fill:#B5EAD7,stroke:#80CBC4,color:#333
    style Thread fill:#FFDAB9,stroke:#FFAB76,color:#333
    style Struct fill:#E8D5F5,stroke:#CE93D8,color:#333
    style Decimal fill:#FFB3C6,stroke:#F48FB1,color:#333
    style Iter fill:#FFF9C4,stroke:#F9A825,color:#333
{% endmermaid %}

## 工具选择速查

| 需求 | 工具 | 需要留意 |
| --- | --- | --- |
| 终端显示动态值 | f-string | 复杂模板考虑分离数据和模板 |
| 用户可编辑的简单占位模板 | `string.Template` | 不提供 HTML/SQL 安全转义 |
| 固定字节布局 | `struct` | 明确字节序、长度和字段宽度 |
| 多个 I/O 等待任务 | `threading` | 共享状态需要同步，设计取消与异常策略 |
| 程序运行记录 | `logging` | 设置级别、handler、轮转和脱敏 |
| 迭代器组合和切片 | `itertools` | 多数迭代器只能消费一次 |
| 十进制精确运算 | `Decimal` | 从字符串构造并明确舍入规则 |

## 练习：并发检查多个文件

模拟检查多个路径是否存在。先用普通循环，再用线程执行这些 I/O 检查；确保每个线程只负责独立检查，主线程汇总结果。记录日志而不是只打印，并测试其中一个路径无权限或不存在时的表现。

不要用很小的样本宣称线程一定更快。对真实收益进行判断，需要足够多的等待任务和可重复的测量。

## 下一步

标准库提供的是可组合的积木，不是应该全部加入项目的功能清单。先识别问题，再选择能减少复杂度的模块；下一篇将学习虚拟环境和包管理，把项目依赖隔离并固定下来。

**官方资料**：[标准库概览第二部分](https://docs.python.org/zh-cn/3.14/tutorial/stdlib2.html)。
