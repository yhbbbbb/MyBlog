---
title: 15｜把知识串起来：从脚本到可维护项目
date: 2026-10-20 13:00:00
categories:
  - 技术科普
tags:
  - Python
  - 项目实践
  - 自动化
  - 测试
  - 工程化
series: python-tutorial
description: 用一个批量整理文件的练习串联 Python 系列知识：模块、配置、路径、异常、日志、测试和虚拟环境如何共同支撑可维护项目。
---

> 从“能运行”到“值得长期使用”，中间隔着配置、错误处理、测试、文档和可恢复性。

## 综合项目：批量整理文件清单

我们做一个小型命令行工具：读取源目录，把指定后缀的文件复制到目标目录，输出处理报告。它足够小，可以在一天内完成；又包含真实项目常见的边界：路径不存在、文件重复、权限错误和部分失败。

{% mermaid %}
flowchart LR
    C["🔵 命令行参数"] --> K["🟡 配置与路径"]
    K --> S["🟣 扫描文件"]
    S --> P["🍑 处理与校验"]
    P --> L["📝 日志和报告"]
    P --> E{"🌸 是否失败？"}
    E -->|是| R["🔁 记录并继续"]
    E -->|否| O["🟢 成功统计"]
    R --> L
    O --> T["✅ 测试与复盘"]
    style C fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style K fill:#FFF9C4,stroke:#F9A825,color:#333
    style S fill:#E8D5F5,stroke:#CE93D8,color:#333
    style P fill:#FFDAB9,stroke:#FFAB76,color:#333
    style L fill:#B5EAD7,stroke:#80CBC4,color:#333
    style E fill:#FFB3C6,stroke:#F48FB1,color:#333
    style R fill:#FFF9C4,stroke:#F9A825,color:#333
    style O fill:#B5EAD7,stroke:#80CBC4,color:#333
    style T fill:#E8D5F5,stroke:#CE93D8,color:#333
{% endmermaid %}

## 先设计目录和职责

```text
file-organizer/
├─ pyproject.toml
├─ README.md
├─ src/file_organizer/
│  ├─ __main__.py       # python -m 入口
│  ├─ cli.py             # 参数解析
│  ├─ rules.py           # 后缀和命名规则
│  ├─ processor.py       # 处理流程
│  └─ report.py          # 统计和日志
└─ tests/
   ├─ test_rules.py
   └─ test_processor.py
```

拆分不是为了增加文件数量，而是让变化有明确位置。后缀规则变化不应迫使你修改命令行解析；报告格式变化也不应影响文件复制逻辑。

## 一个可复用的处理函数

```python
from pathlib import Path
import shutil


def copy_matching(source: Path, target: Path, suffix: str) -> tuple[int, int]:
    """复制匹配文件，返回成功数和失败数。"""
    if not source.is_dir():
        raise FileNotFoundError(f"源目录不存在：{source}")
    target.mkdir(parents=True, exist_ok=True)
    success = failed = 0
    for item in source.iterdir():
        if not item.is_file() or item.suffix.lower() != suffix.lower():
            continue
        try:
            shutil.copy2(item, target / item.name)
        except OSError:
            failed += 1
        else:
            success += 1
    return success, failed
```

这里有几个可检查的决定：使用 `Path` 表达路径，使用大小写不敏感的后缀匹配，创建目标目录，并把可预期的文件系统错误统计出来。更严格的版本还应使用临时文件、校验摘要和明确的重名策略。

## 配置、日志和测试让脚本可以长期运行

路径不要硬编码在函数里，可以通过命令行或配置文件传入；日志不要只打印成功消息，还要记录失败文件和异常原因；测试要覆盖规则函数和至少一条完整处理流程。

```python
def test_copy_matching(tmp_path):
    source = tmp_path / "source"
    target = tmp_path / "target"
    source.mkdir()
    (source / "a.csv").write_text("id,name\n1,A\n", encoding="utf-8")
    (source / "note.txt").write_text("skip", encoding="utf-8")

    success, failed = copy_matching(source, target, ".csv")

    assert (success, failed) == (1, 0)
    assert (target / "a.csv").read_text(encoding="utf-8") == "id,name\n1,A\n"
```

测试的价值不是证明程序永远正确，而是让规则变化时尽早发现回归。真实项目还应增加目标文件重名、权限失败、空目录和源目录不存在的测试。

## 发布前检查清单

| 检查项 | 目的 |
| --- | --- |
| 在虚拟环境中安装依赖 | 避免依赖系统环境 |
| 运行单元测试 | 验证规则和边界 |
| 用临时目录做冒烟测试 | 验证端到端行为 |
| 检查 README 和命令 | 让别人可以复现 |
| 记录 Python 和包版本 | 方便定位环境差异 |
| 处理失败后保留证据 | 便于重试和追责 |

## 系列回顾

从解释器、变量和控制流开始，我们逐步加入数据结构、模块、文件、异常、类、标准库、虚拟环境和浮点数。它们不是互相孤立的知识点，而是同一个工程闭环的不同位置：表达问题、组织代码、保存数据、处理失败、复现环境并验证结果。

## 练习：把它改成你的工作工具

将示例改造成一个实际工具：支持多个后缀、`--dry-run` 预览模式、JSON 日志和失败重试；为每项功能添加测试，并在 README 中写出 Windows 启动步骤。完成后再考虑打包，而不是先追求漂亮界面。

**官方资料：**[Python 3.14 教程总目录](https://docs.python.org/zh-cn/3.14/tutorial/index.html)。

> 教程的终点不是记住更多 API，而是能够把一个真实问题拆开、实现、验证，再留下别人可以继续使用的结果。
