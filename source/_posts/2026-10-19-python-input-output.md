---
title: 06｜文件读写与数据格式化
date: 2026-10-19 10:00:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 文件读写
  - JSON
series: python-tutorial
description: 学习 Python 字符串格式化、文本文件读写和 JSON 序列化，完成一份可重复保存与读取的任务清单。
---

> 文件写入成功，不代表数据就可靠。编码、覆盖模式和文件关闭方式，都会影响程序能否正确保存结果。

## 先把结果写进文件

上一章的分类器可以在终端打印处理结果，但终端内容关闭后就消失了。要让结果能被其他程序读取或留作记录，就需要把数据写入文件。

Python 用 `open()` 打开文件。文本文件应明确指定编码，并优先使用 `with` 管理文件对象：

```python
from pathlib import Path

report_path = Path("reports") / "summary.txt"
report_path.parent.mkdir(exist_ok=True)

with report_path.open("w", encoding="utf-8") as file:
    file.write("今日处理完成\n")
    file.write("成功：12\n")
```

`with` 代码块结束时会自动关闭文件，即使中间发生异常也会执行清理。`"w"` 是写入模式，会覆盖同名文件；如果要在末尾追加，使用 `"a"`。要读取文本，使用 `"r"`。

## 逐行读取和整份读取

小文件可以一次读入：

```python
with report_path.open("r", encoding="utf-8") as file:
    content = file.read()

print(content)
```

处理较大文件时，逐行遍历通常更节省内存：

```python
with report_path.open("r", encoding="utf-8") as file:
    for line_number, line in enumerate(file, start=1):
        print(f"{line_number}: {line.rstrip()}")
```

文件对象本身是可迭代对象。`rstrip()` 在这里去掉行尾换行符，不会误删行首空格。

Windows 上文件可能来自不同软件，编码不一定统一。UTF-8 是新项目常用的选择；如果遇到 `UnicodeDecodeError`，应先确认文件的真实编码，而不是直接用 `errors="ignore"` 丢弃无法解码的内容。

## 用 f-string 格式化输出

日志、报表和提示信息经常需要把变量嵌入文本。格式化字符串字面值（formatted string literal，简称 f-string）适合这种用途：

```python
filename = "订单.csv"
size_bytes = 1536
ratio = 0.875

print(f"{filename}: {size_bytes:,} bytes, 完成率 {ratio:.1%}")
```

输出中的 `:,` 加千位分隔符，`:.1%` 将比例转成百分数并保留一位小数。f-string 的花括号里可以放表达式，但复杂计算更适合先赋值给有意义的名称。

较新的 Python 版本允许在 f-string 表达式中使用更多引号和反斜杠形式；为了兼容不同版本并保持易读，示例仍避免把复杂表达式塞进花括号。

## 用 JSON 保存结构化数据

如果只把数据写成普通文本，之后还要自己拆分字段。JSON（JavaScript Object Notation）是一种常见的文本数据格式，能保存对象、列表、字符串、数字、布尔值和空值。

```python
import json

settings = {
    "source": "incoming",
    "extensions": [".txt", ".cut", ".nc"],
    "retry": True,
}

with Path("settings.json").open("w", encoding="utf-8") as file:
    json.dump(settings, file, ensure_ascii=False, indent=2)
```

`ensure_ascii=False` 让中文直接以可读字符保存，`indent=2` 则让文件更容易检查。读取时使用 `json.load()`：

```python
with Path("settings.json").open("r", encoding="utf-8") as file:
    loaded_settings = json.load(file)

print(loaded_settings["extensions"])
```

JSON 不支持 Python 的所有对象，例如 `Path`、集合和自定义类实例。保存之前要把它们转换成 JSON 支持的基本类型；载入外部 JSON 时，也应验证字段和类型，不能假设数据一定完整。

{% mermaid %}
flowchart LR
    Data["🔵 Python 数据"] --> Convert["🟡 json.dump\n序列化"]
    Convert --> Text["🟣 UTF-8 JSON 文件"]
    Text --> Parse["🍑 json.load\n反序列化"]
    Parse --> Result["🟢 Python 字典或列表"]
    Text -.->|格式错误| Error["🌸 捕获 JSONDecodeError"]
    style Data fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Convert fill:#FFF9C4,stroke:#F9A825,color:#333
    style Text fill:#E8D5F5,stroke:#CE93D8,color:#333
    style Parse fill:#FFDAB9,stroke:#FFAB76,color:#333
    style Result fill:#B5EAD7,stroke:#80CBC4,color:#333
    style Error fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

## 其他格式化方式

字符串的 `format()` 方法适合模板与数据分离的场景：

```python
template = "文件 {name} 处理了 {count} 次"
message = template.format(name="订单.csv", count=3)
```

手动格式化可以使用 `string.Template`；旧式 `%` 格式仍会在遗留代码中看到，但新代码通常优先采用 f-string 或 `format()`。选一种团队易读的方式并保持一致即可。

## 常见误区

| 误区 | 后果 | 建议 |
| --- | --- | --- |
| 忘记指定 `encoding` | 不同系统默认编码不同，可能乱码 | 文本文件明确使用实际编码，通常从 UTF-8 开始 |
| 用 `"w"` 只是想“打开”文件 | 原内容会立刻被清空 | 读取用 `"r"`，追加用 `"a"` |
| 用 `read()` 处理任意大小文件 | 文件很大时占用大量内存 | 大文件逐行遍历 |
| 把 JSON 当成任意 Python 对象存储 | 不支持的对象会触发 `TypeError` | 显式转换为 JSON 基本类型 |

## 练习：保存处理摘要

创建一个字典，包含运行日期、成功文件名列表和失败数量；用 JSON 写入 `summary.json`，再读回来并打印成功文件数。尝试把文件内容改成无效 JSON，观察解码错误会是什么。

## 下一步

文件读写把程序和外部数据连接起来，也带来了文件不存在、权限不足和内容损坏等失败情况。下一篇会学习如何捕获异常，让错误有明确、可控的处理方式。

**官方资料**：[输入与输出](https://docs.python.org/zh-cn/3.14/tutorial/inputoutput.html)。
