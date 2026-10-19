---
title: 08｜Python 类：从对象到生成器
date: 2026-10-19 10:20:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 面向对象
  - 生成器
series: python-tutorial
description: 从名称、对象和命名空间理解 Python 类，学习实例属性、继承、迭代器与生成器，并认识可变类属性的陷阱。
---

> 类不是把代码“升级成面向对象”的装饰。只有当一组状态和操作确实属于同一个概念时，把它们放在一起才有价值。

## 名称是标签，对象才保存状态

Python 中名称绑定到对象。两个名称可以引用同一个列表，因此通过其中一个名称修改列表，另一个也会观察到变化：

```python
first = ["a.csv"]
second = first
second.append("b.csv")

print(first)  # ['a.csv', 'b.csv']
```

函数调用也会创建局部命名空间。函数里的参数和局部变量不会自动变成全局变量；需要在不同调用之间共享的状态，才需要更明确的存放位置。

## 类把状态和行为放在一起

假设程序里每个处理任务都需要文件名和状态。可以用类表达这个概念：

```python
class FileJob:
    """表示一个待处理文件任务。"""

    def __init__(self, filename: str) -> None:
        self.filename = filename
        self.status = "pending"

    def mark_done(self) -> None:
        self.status = "done"


job = FileJob("订单.csv")
job.mark_done()
print(job.status)  # done
```

类（class）定义共同结构，实例（instance）保存某个具体任务的状态。`self` 指向当前实例；`__init__` 在创建实例时初始化它。

## 类属性和实例属性

实例属性属于单个对象，类属性由类及其实例共享。可变类属性容易意外共享状态：

```python
class BadQueue:
    items = []  # 所有实例共享同一列表
```

通常应把每个实例独有的数据放在 `__init__`：

```python
class JobQueue:
    def __init__(self) -> None:
        self.items = []
```

如果一个属性只是初始化时根据参数计算一次，用实例属性保存；如果它描述所有实例都共享的固定信息，才考虑类属性。

## 继承解决什么问题

继承（inheritance）让子类复用或扩展父类行为。比如所有任务都有文件名，而网络任务还需要目标路径：

```python
class NetworkFileJob(FileJob):
    def __init__(self, filename: str, destination: str) -> None:
        super().__init__(filename)
        self.destination = destination
```

`super()` 调用父类实现。只有当子类确实可以替代父类使用，并且共享稳定行为时，继承才有帮助；如果只是复用一两个函数，组合或普通函数往往更简单。

Python 不提供强制私有属性。名称以双下划线开头会触发名称改写（name mangling），主要用于避免子类意外覆盖父类内部名称，并不是安全边界。单下划线通常只是“内部使用”的约定。

## 迭代器和生成器

`for` 循环可以处理列表、文件对象和其他可迭代对象。迭代器（iterator）每次提供一个值，直到没有更多值。

生成器函数通过 `yield` 逐步产出结果，而不是一次创建完整列表：

```python
def matching_files(names: list[str]):
    for name in names:
        if name.endswith(".csv"):
            yield name


for filename in matching_files(["a.csv", "b.txt", "c.csv"]):
    print(filename)
```

当数据量很大时，生成器可以避免同时把所有中间结果放进内存。生成器表达式使用圆括号，适合简单的一次性流水处理：

```python
total_length = sum(len(name) for name in matching_files(names))
```

生成器通常只能从头到尾消费一次。若需要反复遍历结果，或者随机访问元素，列表更合适。

{% mermaid %}
flowchart LR
    Class["🟣 FileJob 类<br>定义共同属性和方法"] --> One["🔵 job_a 实例<br>订单.csv / pending"]
    Class --> Two["🔵 job_b 实例<br>日报.csv / done"]
    One --> Method["🟡 调用 mark_done"]
    Method --> State["🟢 只改变 job_a 状态"]
    Names["🍑 文件名序列"] --> Generator["🌸 生成器<br>逐个筛选"]
    Generator --> Output["🟢 按需消费结果"]
    style Class fill:#E8D5F5,stroke:#CE93D8,color:#333
    style One fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Two fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style Method fill:#FFF9C4,stroke:#F9A825,color:#333
    style State fill:#B5EAD7,stroke:#80CBC4,color:#333
    style Names fill:#FFDAB9,stroke:#FFAB76,color:#333
    style Generator fill:#FFB3C6,stroke:#F48FB1,color:#333
    style Output fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

## 什么时候不需要类

只有一个输入和一个输出的小转换，直接写函数通常更清楚。需要维护多个相关状态、并且多个操作都围绕这些状态时，类才提供有用的边界。

| 场景 | 更合适的选择 | 原因 |
| --- | --- | --- |
| 输入一个字符串，返回规范化字符串 | 函数 | 没有需要长期保存的状态 |
| 一个任务有文件名、状态和多种操作 | 类 | 数据和行为属于同一概念 |
| 从很大文件中逐条筛选记录 | 生成器函数 | 结果可以按需产出 |
| 少量固定值组成一条记录 | 元组或数据类 | 不一定需要自定义完整行为体系 |

## 练习：建立文件任务对象

实现 `FileJob`，包含文件名、目标类别和状态；提供 `mark_done()` 方法。再实现一个生成器，从文件名列表中只产出 `.nc` 文件。验证创建两个任务实例时，修改一个实例的状态不会影响另一个。

## 下一步

理解类和生成器后，不必急着自己实现所有工具。Python 标准库已经包含大量成熟组件。下一篇从操作系统、命令行、路径和时间等日常需求开始使用它们。

**官方资料**：[类](https://docs.python.org/zh-cn/3.14/tutorial/classes.html)。
