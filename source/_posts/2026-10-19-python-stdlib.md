---
title: 09｜Python 标准库实用工具（一）
date: 2026-10-19 10:30:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 标准库
  - 自动化
series: python-tutorial
description: 用 pathlib、glob、sys、re、math、random 和 datetime 解决路径、命令行、模式匹配、计算与时间处理问题。
---

> 写自动化脚本时，先检查标准库里有没有合适工具，通常比自己重新发明一套规则更省心。

## 标准库是什么

Python 标准库随解释器提供，不需要通过 `pip` 单独安装。它覆盖文件路径、命令行参数、日期时间、压缩、日志等常见需求。

这一篇聚焦教程第 10 章的日常工具。示例围绕“查找某目录下的 CSV 文件并输出统计信息”展开。

## 操作系统接口与路径

新代码处理路径时优先考虑 `pathlib.Path`，它用对象表达路径，并提供跨平台的方法：

```python
from pathlib import Path

source = Path("incoming")
for path in source.glob("*.csv"):
    if path.is_file():
        print(path.name, path.suffix, path.stat().st_size)
```

`Path.glob()` 只搜索当前目录；需要递归子目录时可以使用 `rglob("*.csv")`。`os` 模块仍常用于环境变量、进程和底层操作系统接口；两者可以按需求配合。

通配符查找可使用 `glob`：

```python
from glob import glob

for name in glob("incoming/**/*.csv", recursive=True):
    print(name)
```

比较文件名模式时不要把 shell 通配符、正则表达式和 `Path.glob` 的模式混为一谈。它们语法相似，但能力和适用场景不同。

## 命令行参数和退出状态

简单脚本可以从 `sys.argv` 读取参数，但它只是字符串列表，参数校验需要自己处理：

```python
import sys

if len(sys.argv) != 2:
    print("用法：python count_files.py <目录>", file=sys.stderr)
    raise SystemExit(2)

directory = Path(sys.argv[1])
```

给用户使用的命令行工具通常应采用 `argparse`，它能生成帮助信息并检查选项：

```python
import argparse

parser = argparse.ArgumentParser(description="统计目录中的 CSV 文件")
parser.add_argument("directory", type=Path)
parser.add_argument("--recursive", action="store_true", help="递归扫描子目录")
args = parser.parse_args()
```

`sys.exit()` 或 `raise SystemExit(code)` 可以返回退出码。通常 `0` 表示成功，非零表示失败；错误信息写入标准错误流更便于脚本调用者重定向。

## 正则表达式用于复杂文本模式

文件通配符适合简单文件名模式；正则表达式（regular expression）适合更复杂的文本验证和提取：

```python
import re

pattern = re.compile(r"^GS\d{2}[KW]$")
code = "GS01K"

if pattern.fullmatch(code):
    print("格式符合编号规则")
```

原始字符串 `r"..."` 可以减少反斜杠转义。验证整个字符串时优先用 `fullmatch()`，避免只匹配到输入的一部分。

正则表达式很强，但不应拿它解析有嵌套结构的格式，也不适合简单的固定前后缀判断。复杂模式应命名并配测试样例，减少后续维护困难。

## 数学、随机数和日期时间

`math` 提供常见数学函数，`random` 用于模拟和抽样：

```python
import math
import random

print(math.sqrt(81))
print(random.choice(["K", "W"]))
```

`random` 不适合密码或安全令牌。需要安全随机数时应使用 `secrets` 模块。

处理日期和时间时，先区分日期、时间和带时区的时间点：

```python
from datetime import datetime, timezone

now_utc = datetime.now(timezone.utc)
print(now_utc.isoformat())
```

带时区的时间（aware datetime）比没有时区的时间（naive datetime）更适合跨机器记录和比较。显示给用户时，再转换到用户所在时区。

{% mermaid %}
flowchart LR
    Args["🔵 命令行输入"] --> Parse["🟡 argparse 解析"]
    Parse --> Path["🟣 pathlib 查找文件"]
    Path --> Filter["🍑 re 或后缀规则筛选"]
    Filter --> Stats["🟢 math / datetime 统计"]
    Stats --> Output["🌸 标准输出或错误流"]
    style Args fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Parse fill:#FFF9C4,stroke:#F9A825,color:#333
    style Path fill:#E8D5F5,stroke:#CE93D8,color:#333
    style Filter fill:#FFDAB9,stroke:#FFAB76,color:#333
    style Stats fill:#B5EAD7,stroke:#80CBC4,color:#333
    style Output fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

## 一个小型命令行统计脚本

```python
from pathlib import Path
import argparse

parser = argparse.ArgumentParser(description="统计 CSV 文件")
parser.add_argument("directory", type=Path)
parser.add_argument("--recursive", action="store_true")
args = parser.parse_args()

pattern = "**/*.csv" if args.recursive else "*.csv"
files = [path for path in args.directory.glob(pattern) if path.is_file()]
print(f"找到 {len(files)} 个 CSV 文件")
```

实践中还应检查目录是否存在，并决定遇到权限错误时是停止还是跳过。错误策略取决于任务要求，不能只靠 `try/except Exception` 一概忽略。

## 练习：扩展目录统计

给脚本增加 `--min-size` 参数，只统计大小不小于指定字节数的文件；同时输出最新文件的修改时间。分别测试目录不存在、目录为空和递归扫描三种情况。

## 下一步

标准库工具让脚本能接触路径、参数和时间。下一篇继续看输出格式、模板、二进制数据、线程和日志，重点转向“如何把程序做得更可观察、更适合长期运行”。

**官方资料**：[标准库概览](https://docs.python.org/zh-cn/3.14/tutorial/stdlib.html)。
