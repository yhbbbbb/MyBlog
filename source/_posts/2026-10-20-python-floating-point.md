---
title: 14｜浮点数为什么会有误差
date: 2026-10-20 12:00:00
categories:
  - 技术科普
tags:
  - Python
  - 浮点数
  - 精度
  - Decimal
series: python-tutorial
description: 用二进制表示解释 0.1+0.2 的结果，掌握浮点数比较、round、Decimal 和金额计算中的精度边界。
---

> `0.1 + 0.2 != 0.3` 不是 Python 算错了，而是十进制小数被放进二进制浮点数后产生了表示误差。

## 十进制小数不一定能用二进制有限表示

计算机通常用 IEEE 754 双精度浮点数保存 Python 的 `float`。很多十进制小数转换为二进制后是无限循环，只能保存最接近的有限近似值。

```python
result = 0.1 + 0.2
print(result)          # 0.30000000000000004
print(result == 0.3)   # False
```

这类误差通常非常小，但在大量累加、边界判断和金额计算中会被放大。

{% mermaid %}
flowchart LR
    D["🔵 十进制小数<br>0.1、0.2"] --> B["🟣 二进制近似<br>float 表示"]
    B --> C["🟡 运算<br>误差可能累积"]
    C --> Q{"🍑 业务要求？"}
    Q -->|近似测量| F["🟢 math.isclose<br>相对/绝对误差"]
    Q -->|金额与规则| M["🌸 Decimal<br>明确舍入"]
    style D fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#E8D5F5,stroke:#CE93D8,color:#333
    style C fill:#FFF9C4,stroke:#F9A825,color:#333
    style Q fill:#FFDAB9,stroke:#FFAB76,color:#333
    style F fill:#B5EAD7,stroke:#80CBC4,color:#333
    style M fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

## 不要直接用 `==` 比较近似结果

对于测量值或计算结果，应给出允许误差：

```python
import math

actual = 0.1 + 0.2
print(math.isclose(actual, 0.3, rel_tol=1e-9, abs_tol=0.0))
```

`rel_tol` 控制相对误差，`abs_tol` 控制绝对误差。比较接近零的数时，绝对误差尤其重要。误差阈值应来自业务容许范围，而不是随意填写。

## `round()` 不是万能工具

```python
print(round(2.675, 2))  # 2.67，具体结果与二进制表示有关
```

如果业务要求十进制规则，应从字符串构造 `Decimal`：

```python
from decimal import Decimal, ROUND_HALF_UP

price = Decimal("2.675")
total = price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
print(total)  # 2.68
```

不要先把 `float` 传给 `Decimal`，否则浮点误差会一起被带入；金额也可以使用整数最小货币单位保存。

## 选择哪种数值类型

| 场景 | 类型 | 说明 |
| --- | --- | --- |
| 科学计算、图形和测量 | `float` | 速度快，接受近似值 |
| 金额、计费和明确舍入 | `Decimal` | 十进制规则更直观 |
| 计数、订单数量 | `int` | 精确整数，不存在小数误差 |
| 固定精度的金额存储 | `int` | 用“分”等最小单位保存 |

## 练习：写一个可靠的金额比较

实现 `same_amount(left, right)`：输入可以是字符串金额，统一转换为两位小数的 `Decimal` 后比较；再补充负数、空字符串和超过两位小数的测试。

**官方资料：**[浮点算术：争议和限制](https://docs.python.org/zh-cn/3.14/tutorial/floatingpoint.html)。

## 下一步

最后一篇把整个系列串起来：用函数、模块、文件、异常、依赖环境和测试完成一个可维护的小项目。
