---
title: Hello-Agents 第三章 3.1 学习笔记：语言模型与 Transformer 架构
date: 2026-11-06 10:00:00
updated: 2026-11-06 10:00:00
categories:
  - AI Agent
tags:
  - Agent
  - 大语言模型
  - Transformer
  - 深度学习
  - Hello-Agents
  - 学习笔记
description: 学习 Datawhale Hello-Agents 第三章 3.1，整理语言模型、N-gram、RNN、注意力机制、Transformer 和 Decoder-Only 架构。
mathjax: true
---

> 这篇文章记录我学习 Datawhale《Hello-Agents》第三章 3.1“语言模型与 Transformer 架构”后的理解。内容偏学术，我会保留必要的公式和 PyTorch 代码，再用工程视角解释这些模块为什么存在、解决了什么问题，以及它们如何一步步演化为今天大语言模型的基础。

## 一、先回答一个问题：语言模型在做什么

语言模型（Language Model，LM）要解决的问题可以概括为：给定前面的词元，估计下一个词元出现的概率。一个句子由 `w_1, w_2, ..., w_m` 组成时，它的概率可以用链式法则表示：

$$
P(w_1, w_2, \ldots, w_m)=\prod_{i=1}^{m}P(w_i\mid w_1,\ldots,w_{i-1})
$$

这条公式很重要，因为它把“理解一句话”转成了连续的预测问题。模型不一定直接输出“这句话的语义分数”，而是不断回答：**在当前上下文后面，哪些词元更可能出现？**

现代大语言模型的预训练目标，通常就是让模型在大量文本上尽量提高真实下一个词元的概率。生成代码、写总结、回答问题，表面上是不同任务，底层都可以转化成序列概率的建模。

## 二、从 N-gram 开始：用有限历史估计概率

直接计算完整历史的条件概率几乎不现实，因为语料中很可能从未出现过完全相同的长上下文。N-gram 模型引入马尔可夫假设：预测当前词时，只看前面有限的 `n-1` 个词。

以 Bigram 为例：

$$P(w_i\mid w_1,\ldots,w_{i-1})\approx P(w_i\mid w_{i-1})$$

可以用计数估计：

$$P(w_i\mid w_{i-1})=\frac{Count(w_{i-1},w_i)}{Count(w_{i-1})}$$

假设语料只有两句话：

```text
datawhale agent learns
datawhale agent works
```

那么：

- `P(datawhale) = 2 / 6 ≈ 0.333`；
- `P(agent | datawhale) = 2 / 2 = 1`；
- `P(learns | agent) = 1 / 2 = 0.5`。

因此，句子 `datawhale agent learns` 的 Bigram 近似概率为 `0.333 × 1 × 0.5 ≈ 0.167`。

### N-gram 的优点和局限

N-gram 直观、容易统计，也能作为理解语言模型的起点。但它的问题同样明显：

1. 上下文窗口固定，无法自然利用很远之前的信息；
2. 词表和组合数量增长很快，数据稀疏严重；
3. 计数表不能理解词语的语义相似性，“猫”和“狗”不会因为含义接近而自动共享参数；
4. 句子越长，条件概率连乘越容易变得极小。

这说明语言模型需要一种可以学习连续表示、并能利用更丰富上下文的方法。

{% asset_img language-model-markov.png 马尔可夫假设与 N-gram 示意图（图 3.1） %}

### 用 Python 计算一个最小 Bigram 模型

下面的代码把课程中的计数过程写成了可以运行的最小实现。真实项目还需要平滑、词元化和未知词处理，这里先保留最核心的概率计算：

```python
from collections import Counter


sentences = [
    "datawhale agent learns".split(),
    "datawhale agent works".split(),
]

# 统计单词和连续词对出现的次数
word_counts = Counter(word for sentence in sentences for word in sentence)
bigram_counts = Counter(
    (left, right)
    for sentence in sentences
    for left, right in zip(sentence, sentence[1:])
)


def bigram_probability(left: str, right: str) -> float:
    """根据最大似然估计计算 P(right | left)。"""
    denominator = word_counts[left]
    if denominator == 0:
        return 0.0
    return bigram_counts[(left, right)] / denominator


print(bigram_probability("agent", "learns"))  # 0.5
```

如果某个词对从未在训练语料出现，直接计数会得到 0，并使整句概率变成 0。这就是数据稀疏问题，实际的统计语言模型会使用加一平滑、Kneser-Ney 等方法缓解。

## 三、神经网络语言模型：把词变成向量

神经网络语言模型不再只保存离散的词频，而是先把词元映射成向量（embedding），再用神经网络预测下一个词。向量空间让语义相近的词有机会靠近，模型也可以通过参数共享来缓解数据稀疏。

一个简化的流程是：

```text
词元 ID → 词嵌入向量 → 多层网络 → 词表上的概率分布
```

例如输入形状为 `(batch_size, seq_len)`，嵌入层输出形状通常是 `(batch_size, seq_len, d_model)`。`d_model` 可以理解为每个词元的表示宽度。

{% asset_img neural-language-model.png 神经网络语言模型架构示意图（图 3.2） %}

训练时，Embedding 矩阵本身也是参数。模型会为了提高下一个词的预测概率，逐渐把具有相似用法的词映射到更有区分度的向量位置。向量之间可以用余弦相似度衡量：

$$cos(x,y)=\frac{x\cdot y}{\|x\|\|y\|}$$

这个相似度只说明向量在当前表示空间中的方向接近，不等于词典意义上的绝对同义；它会受到语料、任务和模型训练目标影响。

## 四、RNN 和 LSTM：用隐藏状态保存历史

RNN 通过循环结构逐个读取序列。第 `t` 步会结合当前输入 `x_t` 和上一步隐藏状态 `h_(t-1)`，得到新的隐藏状态：

$$h_t=\tanh(W_xx_t+W_hh_{t-1}+b)$$

这个隐藏状态像一份不断更新的短期记忆。它能比 N-gram 看得更远，也能共享同一组参数处理不同长度的句子。

但 RNN 有两个工程瓶颈：

- **计算依赖串行**：必须先算 `h_(t-1)`，才能算 `h_t`，难以在 GPU 上充分并行；
- **长距离依赖不稳定**：反向传播经过很多时间步后，梯度可能消失或爆炸。

一个常见的 RNN 单元计算可以写成：

```python
def rnn_step(x_t, h_prev, input_linear, hidden_linear, bias):
    """处理单个时间步；x_t 和 h_prev 的最后一维分别为输入/隐藏维度。"""
    # 当前输入和上一步隐藏状态共同决定新的状态
    h_t = torch.tanh(input_linear(x_t) + hidden_linear(h_prev) + bias)
    return h_t
```

LSTM 用细胞状态和门控机制改善记忆传递：遗忘门决定丢弃什么，输入门决定写入什么，输出门决定暴露什么。它解决了一部分长依赖问题，却仍然保留了循环带来的串行限制。

以一个时间步为例，LSTM 的核心门控可写为：

$$f_t=\sigma(W_f[x_t,h_{t-1}]+b_f),\quad i_t=\sigma(W_i[x_t,h_{t-1}]+b_i)$$

$$\tilde{c}_t=\tanh(W_c[x_t,h_{t-1}]+b_c),\quad c_t=f_t\odot c_{t-1}+i_t\odot\tilde{c}_t$$

$$o_t=\sigma(W_o[x_t,h_{t-1}]+b_o),\quad h_t=o_t\odot\tanh(c_t)$$

其中 `f_t` 控制保留旧记忆的比例，`i_t` 控制写入新候选信息的比例，`o_t` 控制输出多少细胞状态。

这就引出了 Transformer：能不能不按时间步循环，而是一次性让序列中的每个位置互相查看？

{% asset_img rnn-structure.png RNN 结构示意图（图 3.3） %}

### 用 PyTorch 看一遍 RNN 和 LSTM 的接口

```python
import torch
import torch.nn as nn


batch_size, seq_len, input_size, hidden_size = 2, 5, 16, 32
x = torch.randn(batch_size, seq_len, input_size)

# batch_first=True 让输入保持 (batch, seq_len, feature) 的直观顺序
rnn = nn.RNN(input_size, hidden_size, batch_first=True)
rnn_output, last_hidden = rnn(x)

# LSTM 额外维护细胞状态 cell_state，长序列记忆更稳定
lstm = nn.LSTM(input_size, hidden_size, batch_first=True)
lstm_output, (last_hidden, cell_state) = lstm(x)

print(rnn_output.shape)  # (2, 5, 32)
print(lstm_output.shape)  # (2, 5, 32)
```

RNN 的 `last_hidden` 可以看作最后一个时间步的摘要；LSTM 的 `cell_state` 则是门控结构维护的长期记忆。两者都需要按时间步推进，因此训练长序列时并行度不如 Transformer。

## 五、Transformer 的整体结构

2017 年论文《Attention Is All You Need》提出 Transformer。原始 Transformer 面向机器翻译，采用编码器—解码器（Encoder-Decoder）架构：编码器理解源语言句子，解码器根据编码结果逐步生成目标语言句子。

{% asset_img transformer-overview.png Transformer 整体架构图（图 3.4） %}

阅读这张图时，我建议沿着下面的路径看：

1. 输入词元先经过 Embedding，并加上 Positional Encoding；
2. 编码器重复堆叠“多头自注意力 → Add & Norm → 前馈网络 → Add & Norm”；
3. 解码器除了自己的掩码自注意力，还通过交叉注意力读取编码器输出；
4. 最后一层 Linear + Softmax 把隐藏向量映射成目标词表上的概率。

{% asset_img transformer-architecture.svg Transformer 编码器—解码器架构图 %}

这张图使用 Excalidraw 结构绘制，并导出为 SVG 放入文章资源目录。网页中可以直接缩放 SVG，查看每个模块的输入输出形状；对应的可编辑源文件是同目录下的 `transformer-architecture.excalidraw`。

### 一个最小的 Transformer 层骨架

下面的代码先不展开每个数学细节，用来对应图中的模块关系：

```python
import torch.nn as nn


class EncoderLayer(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = nn.MultiheadAttention(
            d_model, num_heads, dropout=dropout, batch_first=True
        )
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, padding_mask=None):
        # 自注意力：Q、K、V 都来自同一个序列
        attn_out, _ = self.self_attn(
            x, x, x, key_padding_mask=padding_mask
        )
        x = self.norm1(x + self.dropout(attn_out))

        # 逐位置前馈网络：每个位置使用同一组参数独立处理
        x = self.norm2(x + self.dropout(self.ffn(x)))
        return x
```

## 六、自注意力：让每个位置查看全局上下文

自注意力（Self-Attention）为每个词元生成三种向量：

- **Query（查询）**：当前词想寻找什么信息；
- **Key（键）**：每个词可以被怎样匹配；
- **Value（值）**：每个词真正携带的内容。

它们由输入 `X` 经过三个可学习矩阵得到：

$$Q=XW^Q,\quad K=XW^K,\quad V=XW^V$$

缩放点积注意力的公式是：

$$Attention(Q,K,V)=softmax\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

可以拆成四步：

1. `QK^T` 计算每个查询与所有键的相关性；
2. 除以 `sqrt(d_k)`，避免维度较大时点积数值过大；
3. `softmax` 把分数变成总和为 1 的权重；
4. 用权重加权求和 `V`，得到融合上下文的新表示。

例如句子 `The agent learns because it is intelligent` 中的 `it`，可以通过较高的注意力权重关联到 `agent`。这不是写死的指代规则，而是模型从数据中学习出来的相关性模式。

### PyTorch 实现缩放点积注意力

```python
import math
import torch


def scaled_dot_product_attention(q, k, v, mask=None):
    # q: (batch, heads, query_len, d_k)
    # k: (batch, heads, key_len, d_k)
    scores = q @ k.transpose(-2, -1) / math.sqrt(q.size(-1))

    if mask is not None:
        # mask 为 False 的位置不会参与注意力
        scores = scores.masked_fill(~mask, torch.finfo(scores.dtype).min)

    weights = torch.softmax(scores, dim=-1)
    output = weights @ v
    return output, weights
```

`mask` 是 Transformer 能够区分不同任务的重要机制。填充掩码用于忽略 `<pad>`；因果掩码用于禁止解码器看到未来词元。

## 七、多头注意力：同时学习多种关系

如果只用一组 Q、K、V，模型可能偏向学习一种关系。多头注意力把 `d_model` 切分成 `h` 个头，每个头在较小的子空间里独立计算注意力，再拼接并通过线性层混合：

$$MultiHead(Q,K,V)=Concat(head_1,\ldots,head_h)W^O$$

其中：

$$head_i=Attention(QW_i^Q,KW_i^K,VW_i^V)$$

可以把多头理解成多个观察角度：一个头可能关注主谓关系，另一个头关注指代关系，另一个头关注相邻词或句法边界。实际模型中的头不一定能被简单地人工解释，但“分头学习不同子空间关系”是它的核心直觉。

{% asset_img multi-head-attention.png 多头注意力机制（图 3.5） %}

这张图展示了“切分多个头、分别计算、拼接输出”的过程。它和上面的公式是一一对应的：每个头有自己的投影矩阵，最后通过 `W^O` 把多个头的结果重新混合。

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        if d_model % num_heads != 0:
            raise ValueError("d_model 必须能被 num_heads 整除")
        self.attn = nn.MultiheadAttention(
            d_model, num_heads, batch_first=True
        )

    def forward(self, x, mask=None):
        # 自注意力的 Q、K、V 都是 x
        y, weights = self.attn(x, x, x, attn_mask=mask)
        return y, weights
```

### 手写多头注意力：对应课程代码的完整版本

为了把公式和张量形状对应起来，下面不直接调用 `nn.MultiheadAttention`，而是展开 Q、K、V 投影、拆头、缩放点积注意力和合并多头的过程。设输入形状为 `(batch_size, seq_len, d_model)`，若有 `num_heads` 个头，则每个头的维度是 `head_dim = d_model / num_heads`。

```python
import math
import torch
import torch.nn as nn


class MultiHeadAttentionManual(nn.Module):
    """手写多头注意力，便于对照公式学习。"""

    def __init__(self, d_model: int, num_heads: int):
        super().__init__()
        if d_model % num_heads != 0:
            raise ValueError("d_model 必须能被 num_heads 整除")

        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads

        # 四个线性层分别完成 Q、K、V 投影和多头结果的最终融合
        self.query_linear = nn.Linear(d_model, d_model)
        self.key_linear = nn.Linear(d_model, d_model)
        self.value_linear = nn.Linear(d_model, d_model)
        self.out_linear = nn.Linear(d_model, d_model)

    def split_heads(self, x: torch.Tensor) -> torch.Tensor:
        """(batch, seq_len, d_model) → (batch, heads, seq_len, head_dim)。"""
        batch_size, seq_len, _ = x.shape
        x = x.view(batch_size, seq_len, self.num_heads, self.head_dim)
        return x.transpose(1, 2)

    def combine_heads(self, x: torch.Tensor) -> torch.Tensor:
        """(batch, heads, seq_len, head_dim) → (batch, seq_len, d_model)。"""
        batch_size, _, seq_len, _ = x.shape
        x = x.transpose(1, 2).contiguous()
        return x.view(batch_size, seq_len, self.d_model)

    def scaled_dot_product_attention(self, q, k, v, mask=None):
        # q @ k^T 的形状为 (batch, heads, query_len, key_len)
        scores = q @ k.transpose(-2, -1)
        scores = scores / math.sqrt(self.head_dim)

        if mask is not None:
            # False 表示禁止关注；极小值经过 softmax 后接近 0
            scores = scores.masked_fill(~mask, torch.finfo(scores.dtype).min)

        weights = torch.softmax(scores, dim=-1)
        # (batch, heads, query_len, key_len)
        # × (batch, heads, key_len, head_dim)
        # = (batch, heads, query_len, head_dim)
        return weights @ v, weights

    def forward(self, query, key, value, mask=None):
        # 交叉注意力中 query 和 key/value 可以来自不同序列；
        # 自注意力中三者都来自同一个序列。
        q = self.split_heads(self.query_linear(query))
        k = self.split_heads(self.key_linear(key))
        v = self.split_heads(self.value_linear(value))

        attended, weights = self.scaled_dot_product_attention(q, k, v, mask)
        output = self.out_linear(self.combine_heads(attended))
        return output, weights
```

这里特意使用 `query_linear`、`key_linear`、`value_linear` 和 `out_linear` 一致命名，避免把构造函数中的属性写成 `W_q`、`W_k` 后又在 `forward` 中调用另一套名称。

### DecoderLayer 与因果掩码

解码器的第一层自注意力必须遮住未来位置。例如目标序列长度为 4 时，第 2 个位置只能看到第 1、2 个位置，不能提前看到第 3、4 个位置。下面的上三角矩阵就是一个常见的因果掩码：

```python
def causal_mask(seq_len: int) -> torch.Tensor:
    """返回形状为 (seq_len, seq_len) 的布尔掩码。

    PyTorch 的 attn_mask 中，True 表示禁止关注，因此上三角为 True。
    """
    return torch.triu(
        torch.ones(seq_len, seq_len, dtype=torch.bool),
        diagonal=1,
    )


class DecoderLayer(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = nn.MultiheadAttention(
            d_model, num_heads, dropout=dropout, batch_first=True
        )
        self.cross_attn = nn.MultiheadAttention(
            d_model, num_heads, dropout=dropout, batch_first=True
        )
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_ff, d_model),
        )
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.norm3 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, memory, tgt_mask=None, memory_mask=None):
        # 1. 只能读取目标前缀，避免训练时“偷看答案”
        self_out, _ = self.self_attn(
            x, x, x, attn_mask=tgt_mask
        )
        x = self.norm1(x + self.dropout(self_out))

        # 2. 用当前目标表示查询编码器记忆
        cross_out, _ = self.cross_attn(
            x, memory, memory, attn_mask=memory_mask
        )
        x = self.norm2(x + self.dropout(cross_out))

        # 3. 对每个位置独立执行共享参数的前馈网络
        x = self.norm3(x + self.dropout(self.ffn(x)))
        return x
```

训练时通常使用“右移后的目标序列”：输入给 Decoder 的是 `<bos> 我 喜欢`，标签是 `我 喜欢 Python <eos>`。这样每个位置都能并行计算，但仍然遵守自回归约束：

```python
import torch.nn.functional as F


logits = model(src_tokens, tgt_tokens[:, :-1])
# logits: (batch, target_len - 1, vocab_size)
labels = tgt_tokens[:, 1:]

# 忽略 padding 位置，不让补齐 token 影响损失
loss = F.cross_entropy(
    logits.reshape(-1, logits.size(-1)),
    labels.reshape(-1),
    ignore_index=pad_id,
)
loss.backward()
optimizer.step()
optimizer.zero_grad()
```

这段代码体现了训练和生成的差别：训练阶段有完整目标序列，可以并行计算；生成阶段只能拿到已经生成的前缀，所以必须一个 token 一个 token 地循环。

## 八、前馈网络、残差连接与层归一化

### 1. 逐位置前馈网络（FFN）

注意力负责在不同位置之间交换信息，FFN 则对每个位置的表示进行非线性变换。经典形式为：

$$FFN(x)=max(0,xW_1+b_1)W_2+b_2$$

通常先把维度从 `d_model` 扩大到 `d_ff`，经过激活函数，再压回 `d_model`。它对序列中的每个位置使用相同的参数，因此可以并行计算。

```python
class PositionwiseFeedForward(nn.Module):
    """对每个位置独立处理，但所有位置共享参数。"""

    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 输入和输出都保持 (batch, seq_len, d_model)
        x = self.linear1(x)       # 扩大表示空间，提取更多特征
        x = self.relu(x)          # 引入非线性
        x = self.dropout(x)       # 训练时随机失活，降低过拟合
        return self.linear2(x)    # 映射回 d_model，便于残差相加
```

### 2. 残差连接（Add）

残差连接把子层输入直接加回输出：

$$y=x+Sublayer(x)$$

这样反向传播时有一条更直接的梯度路径，深层网络更容易训练。

### 3. 层归一化（Norm）

LayerNorm 在单个 token 的特征维度上做归一化，让不同层之间的数值分布更稳定。图中的 `Add & Norm` 就是残差连接与层归一化的组合。

## 九、位置编码：补上顺序信息

自注意力一次计算所有位置之间的关系，本身并不知道词元的先后顺序。如果不加入位置信息，`agent learns` 和 `learns agent` 的词集合相同，模型就难以区分它们的顺序差异。

原始 Transformer 使用正弦和余弦位置编码：

$$PE_{(pos,2i)}=sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

$$PE_{(pos,2i+1)}=cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

其中 `pos` 是序列位置，`i` 是向量维度索引。位置编码与词嵌入相加，而不是替换词嵌入：

```python
import math
import torch
import torch.nn as nn


class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000, dropout=0.1):
        super().__init__()
        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2)
            * (-math.log(10000.0) / d_model)
        )

        pe = torch.zeros(max_len, d_model)
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        # buffer 不参与梯度更新，但会随模型一起移动到 CPU/GPU
        self.register_buffer("pe", pe.unsqueeze(0))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        # x: (batch_size, seq_len, d_model)
        return self.dropout(x + self.pe[:, :x.size(1)])
```

## 十、编码器和解码器为什么不一样

编码器的自注意力可以同时看到输入句子的所有位置，因此适合理解整段输入。解码器在生成第 `t` 个词时，不能偷看未来的目标词，所以需要**因果掩码（causal mask）**：当前位置只能关注自己和左侧已经出现的位置。

解码器通常包含三类子层：

1. 掩码自注意力：读取已经生成的目标前缀；
2. 交叉注意力：用目标序列查询编码器输出；
3. 前馈网络：对每个位置进一步变换。

{% mermaid %}
flowchart TD
    S[源序列] --> ENC[Encoder：全局自注意力]
    ENC --> MEM[编码器记忆表示]
    T[目标前缀] --> MASK[Decoder：因果掩码自注意力]
    MASK --> CROSS[交叉注意力：Q 来自 Decoder，K/V 来自 Encoder]
    MEM --> CROSS
    CROSS --> OUT[预测下一个词元]
{% endmermaid %}

## 十一、Decoder-Only：GPT 为什么只保留解码器

原始 Transformer 的编码器—解码器结构适合翻译，但通用文本生成可以换成更简单的目标：给定前文，预测下一个词。GPT 类模型因此采用 Decoder-Only 架构，只保留带因果掩码的解码器堆叠。

它的生成过程是自回归的：

```text
输入：Datawhale Agent is
→ 预测：a
→ 输入：Datawhale Agent is a
→ 预测：powerful
→ 不断重复，直到遇到结束标记或达到长度上限
```

训练时可以把一整段文本错开一位：

```python
tokens = ["Datawhale", "Agent", "is", "powerful"]
inputs = tokens[:-1]   # Datawhale Agent is
labels = tokens[1:]    # Agent is powerful
```

模型在每个位置预测下一个 token，损失通常是交叉熵。推理时再根据概率分布选择 token，重复这个过程就得到完整文本。

这也是我理解“大语言模型为什么能成为 Agent 大脑”的关键入口：模型先学会在语言空间中预测、续写和转换，再由工具调用、RAG、状态机和权限系统把语言能力接入真实世界。

## 十二、从 3.1 得到的几个工程结论

### 1. 并行能力是 Transformer 成为基础架构的重要原因

RNN 依赖时间步串行执行，Transformer 可以在训练时并行计算整段序列的注意力，因此更适合 GPU 和大规模数据。推理阶段的 Decoder-Only 仍然需要逐 token 生成，但训练效率和可扩展性已经发生了根本变化。

### 2. 注意力不是“查数据库”

注意力是在当前上下文内部计算相关性。它能把上下文中的信息动态组合起来，但不会自动访问最新网页、公司数据库或没有放入上下文的文档。需要外部事实时，仍然需要 RAG 或工具调用。

### 3. 生成能力不等于任务可靠性

语言模型能生成合理文本，不代表它一定能正确执行任务。生产系统还需要结构化输出、参数校验、工具白名单、重试、日志和人工审批。模型解决“下一步可能是什么”，软件系统负责“这一步是否允许发生”。

### 4. 读懂公式比背模块名称更重要

复习 Transformer 时，我会抓住四个问题：

- `QK^T` 在比较什么？答：查询与键的相关性；
- 除以 `sqrt(d_k)` 为什么？答：控制点积尺度，稳定 softmax 和训练；
- 多头为什么有用？答：在多个表示子空间中并行学习关系；
- 位置编码为什么必须有？答：给不带顺序先验的注意力补充位置信息。

## 十三、复习提纲

```text
语言模型：估计序列概率，训练目标常是预测下一个词元
    ↓
N-gram：用有限历史近似条件概率，但受数据稀疏和窗口限制
    ↓
RNN/LSTM：用隐藏状态保存历史，但计算串行、长序列效率有限
    ↓
Transformer：用注意力建模全局关系，训练可并行
    ↓
Encoder-Decoder：编码器理解输入，解码器自回归生成
    ↓
Decoder-Only：只保留因果解码器，成为 GPT 类模型的主流架构
    ↓
Agent：在语言模型外接工具、知识库、状态、权限和反馈循环
```

## 参考资料

- 《Hello-Agents》：第三章“大语言模型基础”，重点学习 3.1“语言模型与 Transformer 架构”。

本文是个人学习笔记。公式、代码和解释用于帮助自己复习，具体实现细节以原论文、课程材料和框架文档为准。
