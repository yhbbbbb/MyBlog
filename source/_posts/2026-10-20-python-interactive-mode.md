---
title: 13｜交互式编辑、历史记录与启动文件
date: 2026-10-20 11:00:00
categories:
  - 技术科普
tags:
  - Python
  - 交互式编程
  - REPL
  - 开发效率
series: python-tutorial
description: 介绍 Python 交互解释器中的历史记录、自动补全、启动文件和脚本切换方式，让临时验证与正式代码各得其所。
---

> 交互解释器适合快速问问题，脚本和测试适合留下答案；把两者混用，效率和可复现性都会下降。

## REPL 适合做什么

REPL（Read-Eval-Print Loop）会读取输入、执行表达式并打印结果。它适合确认一个 API 的返回值、试验字符串方法、检查路径和验证小段算法。

```text
>>> 2 ** 10
1024
>>> "report.csv".endswith(".csv")
True
```

但交互窗口里的状态容易被前面的操作影响。复杂逻辑、重要结果和需要复跑的步骤应该放进 `.py` 文件，并配上输入和测试。

{% mermaid %}
flowchart LR
    Q["🔵 临时问题"] --> R["🟣 REPL<br>快速验证"]
    R -->|结论稳定| F["🟢 脚本<br>保存与复跑"]
    R -->|需要重复| T["🟡 测试<br>固定输入输出"]
    F --> D["🍑 文档<br>记录用法"]
    T --> D
    style Q fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style R fill:#E8D5F5,stroke:#CE93D8,color:#333
    style F fill:#B5EAD7,stroke:#80CBC4,color:#333
    style T fill:#FFF9C4,stroke:#F9A825,color:#333
    style D fill:#FFDAB9,stroke:#FFAB76,color:#333
{% endmermaid %}

## 历史记录和自动补全

在 Windows 终端中启动 Python：

```powershell
py -3.14
```

方向键通常可以回看前面的输入；输入对象名后按 Tab，可以尝试补全属性或名称。不同终端对快捷键支持略有差异，因此不要把终端行为当成 Python 语言本身的保证。

需要查看帮助时，可以使用：

```python
help(str.split)
dir(str)
```

`dir()` 用于探索对象暴露的名称，`help()` 用于查看文档。探索之后仍应回到官方文档确认参数和版本行为。

## 启动文件：少量、稳定、可解释

交互模式可以通过 `PYTHONSTARTUP` 指定启动脚本。Windows PowerShell 示例：

```powershell
$env:PYTHONSTARTUP = "$HOME\python_startup.py"
```

启动文件适合放少量通用导入或显示环境信息，不适合塞入业务逻辑。否则每次打开解释器都会隐式改变环境，别人复制命令时也无法复现。

```python
# python_startup.py：只放交互探索需要的轻量设置
from pathlib import Path

print(f"Python 交互环境：{Path.cwd()}")
```

## 交互模式的边界

| 任务 | 推荐工具 | 原因 |
| --- | --- | --- |
| 验证一个表达式 | REPL | 反馈快，改动成本低 |
| 处理几十个文件 | 脚本 | 可以保存配置、日志和错误处理 |
| 防止回归 | 测试 | 输入和期望输出明确 |
| 分享给同事 | README + 脚本 | 环境和步骤可复现 |

## 练习：把探索结果变成工具

在 REPL 中探索 `pathlib.Path.glob()` 的行为，确认它如何查找 CSV 文件；然后把成功的表达式整理成一个命令行脚本，增加目录不存在和没有匹配文件时的提示。

**官方资料：**[交互式输入编辑和历史记录](https://docs.python.org/zh-cn/3.14/tutorial/interactive.html)与[启动文件](https://docs.python.org/zh-cn/3.14/tutorial/appendix.html#the-interactive-startup-file)。

## 下一步

交互模式让试验更快，但它也会暴露一个常见陷阱：数字看起来相等，不代表底层表示完全相同。下一篇解释浮点数误差。
