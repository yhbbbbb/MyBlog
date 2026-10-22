---
title: RAG 应用实践（上）：从文档到有依据的回答
date: 2026-10-21 16:00:00
updata: 2026-10-22 8:30:00
categories:
  - 技术科普
tags:
  - RAG
  - 大语言模型
  - 向量检索
  - Embedding
series: rag-practice
description: 用一个文档问答场景解释 RAG 的索引、检索和生成流程，说明切块、向量化、提示词与引用来源各自解决什么问题。
---

> 如果模型不知道公司最新的报销规则，继续训练它未必是最快的办法；先让它找到正确的制度原文，通常更直接。

## RAG 要解决什么问题

大语言模型（Large Language Model，LLM）主要根据训练中形成的参数知识生成答案。参数不会自动包含你刚更新的员工手册、内部项目说明或产品数据。检索增强生成（Retrieval-Augmented Generation，RAG）在回答前，从外部知识源检索相关内容，再把证据交给模型组织答案。

可以把它想成开卷考试：模型负责理解问题和组织语言，检索系统负责从资料中找到可能相关的页面。**RAG 不会自动保证答案正确；它只是给生成过程增加了可检查的证据来源。**

## 两条流程：离线建索引，在线答问题

建索引通常在数据更新时运行。系统读取文档、提取文本、切成片段、生成向量，并保存原文片段、向量和元数据。用户提问时，系统把问题编码成向量，搜索相似片段，再把片段与问题一起交给模型。

{% asset_img rag-pipeline.svg RAG 离线索引与在线问答流程图 %}

上图使用 Excalidraw 绘制；可编辑源文件与 SVG 同目录保存。图中的向量库只是索引的一种实现方式，实际系统也可以组合关键词检索、关系数据库或搜索引擎。

### 1. 文档加载与切块

PDF、网页、Markdown 和表格需要先转成可处理的内容。切块（chunking）则把长文档拆成适合检索的小段，并保留标题、来源、更新时间、权限等元数据。

块太大，向量表示会混合多个主题，检索时容易带入无关内容；块太小，定义、条件和例外可能被拆开，模型拿到的上下文就不完整。固定字符长度只是基线，带标题的分段、按句子或结构切分通常更适合作为比较对象。

切块时还要解决“切完后能否找到原文”的问题。至少为每块记录稳定的文档 ID、标题、页码或段落号、版本、生效时间和权限范围。下面是一个标准库示例：它按段落聚合文本，在接近目标长度时切块，并把来源信息带到每一块。它不是面向所有 PDF 的通用切分器，真实解析阶段应先处理表格、页眉页脚和扫描件 OCR。

```python
from dataclasses import dataclass


@dataclass
class Chunk:
    text: str
    metadata: dict


def split_document(text: str, *, doc_id: str, title: str,
                   target_chars: int = 500, overlap_paragraphs: int = 1):
    """按段落切块；保留一个段落的重叠，避免边界处丢失上下文。"""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current = []
    size = 0
    start_paragraph = 0

    for index, paragraph in enumerate(paragraphs):
        if current and size + len(paragraph) > target_chars:
            chunks.append(Chunk(
                text="\n\n".join(current),
                metadata={"doc_id": doc_id, "title": title,
                          "paragraph_start": start_paragraph,
                          "paragraph_end": index - 1},
            ))
            carry = current[-overlap_paragraphs:] if overlap_paragraphs else []
            current = carry
            size = sum(map(len, carry))
            start_paragraph = index - len(carry)

        current.append(paragraph)
        size += len(paragraph)

    if current:
        chunks.append(Chunk(
            text="\n\n".join(current),
            metadata={"doc_id": doc_id, "title": title,
                      "paragraph_start": start_paragraph,
                      "paragraph_end": len(paragraphs) - 1},
        ))
    return chunks


if __name__ == "__main__":
    source = "报销申请应在返程后提交。\n\n普通员工应在10个工作日内提交。\n\n直属主管需要审核。"
    for chunk in split_document(source, doc_id="travel-policy-v3", title="差旅报销制度"):
        print(chunk.metadata, chunk.text)
```

这里的 `target_chars` 是字符数，不等于模型 Token 数。中文、英文、代码和表格的 Token 比例不同；生产系统应按目标模型 Tokenizer 估算上下文，并用评测集比较不同切块策略。重叠能够缓解边界断裂，但会增加重复片段、索引体积和召回噪声。

### 2. 向量化与索引

Embedding 模型把文本映射成向量，使语义相近的句子在向量空间里更接近。建库与查询必须使用兼容的模型、预处理和向量维度；否则索引中的向量和查询向量就不在同一个语义坐标系。

向量相似度是“可能相关”的信号，不是事实正确性的证明。例如“退款政策”和“退货流程”语义接近，但回答关于退款时，退货说明不一定是充分依据。索引记录应保留原文、文档标识和位置，方便回到来源核验。

索引阶段可以拆成可重试的批处理任务：解析文档、规范化文本、切块、计算 Embedding、写入向量库，最后记录索引版本和处理结果。文档内容有变更时，应以文档 ID 和版本号做幂等更新，避免重复插入旧片段。权限字段也要进入检索过滤条件；不能先把所有部门的内容召回，再指望提示词替系统保密。

```python
# 与具体向量数据库无关的索引接口示意。
# embed_documents 和 vector_store.upsert 由所选模型与数据库 SDK 提供。
def index_document(document, embed_documents, vector_store):
    chunks = split_document(
        document["text"],
        doc_id=document["id"],
        title=document["title"],
        target_chars=500,
    )
    vectors = embed_documents([chunk.text for chunk in chunks])
    records = []
    for chunk, vector in zip(chunks, vectors):
        records.append({
            "id": f"{document['id']}:{chunk.metadata['paragraph_start']}",
            "text": chunk.text,
            "vector": vector,
            "metadata": {
                **chunk.metadata,
                "version": document["version"],
                "department": document["department"],
                "effective_date": document["effective_date"],
            },
        })
    vector_store.upsert(records)
```

查询和建库应使用兼容的 Embedding 模型、维度、文本预处理及向量归一化设置。更换模型后，通常需要重建索引；把新模型生成的查询向量直接拿去搜索旧模型的向量，结果没有可解释性。

### 3. 检索与生成

最简单的检索方式是向量相似度搜索，取前 `k` 个片段。`k` 太小可能漏掉答案所需条件；太大则会增加噪声、提示长度、延迟和调用成本。这个参数应通过代表性问题测试，不宜凭感觉固定。

生成提示应明确要求模型只依据提供的资料回答，引用片段不能支持结论时说明不知道，并尽可能返回来源标识。提示词只能约束模型，不能完全消除幻觉；最终仍要对回答和引用做验证。

一次在线请求可以按以下顺序执行：先做身份校验，再依据用户权限过滤候选文档，取回片段，组装上下文，调用模型，并把答案中的引用映射回真实文档链接。示例提示词把“证据”和“回答”分开，并要求返回来源 ID，便于服务端渲染引用：

```python
def build_messages(question: str, retrieved_chunks: list[dict]) -> list[dict]:
    context = "\n\n".join(
        f"[来源 {i}; id={item['id']}; 标题={item['title']}]\n{item['text']}"
        for i, item in enumerate(retrieved_chunks, start=1)
    )
    return [
        {
            "role": "system",
            "content": (
                "你是内部资料问答助手。只使用用户消息中的资料回答。"
                "资料不足时明确说‘现有资料无法确认’，不得补造事实。"
                "保留数字、日期、否定词、适用对象和例外条件。"
                "每个事实性结论后标注对应的来源 id。"
            ),
        },
        {
            "role": "user",
            "content": f"资料：\n{context}\n\n问题：{question}",
        },
    ]
```

这个函数只负责构造消息，模型客户端、向量库和权限系统由应用接入。返回的引用也不能盲目信任：生成后应检查引用 ID 是否来自本次检索结果，最好把引用链接由服务端根据 ID 生成，而不是让模型编造 URL。

```text
问题：员工出差后多久内需要提交报销？

检索到的资料：
[报销制度，第 4.2 节] 出差人员应在返程后 10 个工作日内提交报销申请。

回答要求：只根据资料回答；附上来源章节；资料没有说明时明确指出。
```

这个例子里，回答不应只输出“10 天”，还应保留“工作日”和“返程后”这两个限制条件，并给出制度章节。**检索到正确段落但丢掉限定条件，仍然是错误答案。**

## RAG 与微调如何选择

| 需求 | RAG | 微调 |
| --- | --- | --- |
| 使用经常变化的私有资料 | ✅ 更新资料或索引即可 | ⚠️ 需要重新训练或更新训练集 |
| 让模型稳定遵循输出风格 | ⚠️ 提示词可控制一部分 | ✅ 可训练特定格式和行为 |
| 回答必须带来源证据 | ✅ 可以保留检索片段和文档位置 | ❌ 参数本身不提供逐条出处 |
| 处理事实缺失 | ⚠️ 依赖资料质量和检索质量 | ⚠️ 训练不保证包含最新事实 |

两者不是互斥方案。微调可以改善特定任务的行为，RAG 可以提供可更新的外部事实；选择前先确认主要问题是“模型不会按要求回答”，还是“模型拿不到最新资料”。

## 基础 RAG 的边界

基础 RAG 把所有问题都走同一条检索链路，因此会遇到几类失败：文档切错、用户问题表达与原文不同、关键词检索不到、相似但不相关的段落排在前面，以及上下文很多却没有直接证据。

这些问题不能靠无限增大 `k` 解决。更多片段可能带来更高召回，也可能稀释关键证据。下一篇会从问题诊断出发，介绍查询改写、混合检索、重排序、过滤和路由等优化方法。

## 练习：手工走一遍 RAG

选择一份公开说明文档，写出 5 个可以从文档中核对答案的问题。把文档切成片段，为每段记录标题和来源位置；对每个问题人工挑选相关片段，再写一个“只能依据资料回答”的提示词。

记录哪类问题无法找到证据、哪段文字被切得不完整。这个小实验能帮助你先判断瓶颈在数据、切块还是检索，而不是一开始就换模型。

### 上线前检查清单

- 解析后抽查标题、表格、页码、脚注和 OCR 结果，确认没有把相邻列拼错。
- 用带有数字、日期、否定词、例外条件的问题检查切块边界和引用位置。
- 比较不同切块大小、重叠和 `top_k`，同时观察召回质量、提示长度和费用。
- 验证用户权限过滤在检索查询阶段生效，并用跨部门测试确认越权资料不会进入上下文。
- 给文档更新、删除、重新索引和回滚建立可追踪的版本记录。

## 参考资料

- [知乎专栏：《深度好文！最全的大模型 RAG 技术概览》](https://zhuanlan.zhihu.com/p/678893732)@AI技术社区。
- [知乎专栏：《大模型应用之RAG详解》](https://zhuanlan.zhihu.com/p/13679111673)
- [鱼皮：RAG 是什么？16 种 RAG 方案一次讲清](https://ai.codefather.cn/post/2047162931736592386)。
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)。

