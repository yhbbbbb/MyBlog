---
title: 11｜Python 虚拟环境与包：让项目依赖可控
date: 2026-10-20 09:00:00
categories:
  - 技术科普
tags:
  - Python
  - 虚拟环境
  - pip
  - 包管理
series: python-tutorial
description: 从 venv、pip 到 requirements.txt，理解 Python 项目如何隔离解释器和第三方依赖，避免“在我电脑上能运行”。
---

> 项目能否在另一台电脑运行，往往不取决于代码本身，而取决于你有没有把依赖环境一起说明白。

## 为什么需要虚拟环境

一个电脑上可能同时维护多个项目：旧项目依赖某个版本的 `requests`，新项目需要更新版本，数据项目又需要一套科学计算库。如果所有包都安装到系统 Python，升级一个项目可能影响另一个项目。

虚拟环境（virtual environment）可以理解成项目专属的 Python 工作间。每个工作间有自己的包目录，项目之间互不覆盖；删除工作间也不会破坏系统解释器。

{% mermaid %}
flowchart LR
    P["🔵 项目源码"] --> V["🟣 .venv<br>项目专属解释器"]
    V --> I["🟡 pip install<br>安装依赖"]
    I --> R["🟢 requirements.txt<br>记录版本"]
    R --> D["🍑 新电脑<br>按清单重建"]
    style P fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style V fill:#E8D5F5,stroke:#CE93D8,color:#333
    style I fill:#FFF9C4,stroke:#F9A825,color:#333
    style R fill:#B5EAD7,stroke:#80CBC4,color:#333
    style D fill:#FFDAB9,stroke:#FFAB76,color:#333
{% endmermaid %}

## Windows 上创建和启用环境

在项目目录执行：

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version
python -m pip --version
```

这里使用 `python -m pip`，而不是直接写 `pip`，是为了确认 pip 属于当前虚拟环境。退出环境使用 `deactivate`。

安装包并记录依赖：

```powershell
python -m pip install requests
python -m pip install -U pip
python -m pip freeze > requirements.txt
```

在另一台电脑重建：

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

`requirements.txt` 适合快速复现现有环境，但它可能包含不需要直接使用的间接依赖。规模较大的项目可以改用 `pyproject.toml` 管理项目元数据和依赖范围。

## 常见问题

| 现象 | 原因 | 检查方式 |
| --- | --- | --- |
| 安装后程序仍提示缺包 | pip 和运行程序不属于同一解释器 | `python -m pip --version`、`where python` |
| 换电脑安装失败 | 包没有对应 Python 或系统版本 | 查看错误中的版本和平台信息 |
| 删除 `.venv` 后代码不能运行 | 环境是可重建的，依赖清单没有保存 | 保留 `requirements.txt` 或项目配置 |
| 依赖升级导致旧功能异常 | 版本范围过宽 | 在干净环境中重新安装并运行测试 |

## 练习：为文件清单工具建立环境

创建一个新目录，建立 `.venv`，安装 `pypinyin`，写一个脚本将中文文件名转换为拼音。生成 `requirements.txt`，删除 `.venv`，再按清单重建并运行脚本。

练习的重点不是转换本身，而是验证：**项目依赖可以被记录、删除和重建。**

**官方资料：**[虚拟环境和包](https://docs.python.org/zh-cn/3.14/tutorial/venv.html)。

## 下一步

依赖环境可以复现后，学习重点会从“语法怎么写”转向“如何选择项目方向、验证学习成果”。下一篇将整理教程之后的实践路线。
