---
title: 大数据技术体系（上）：从数据存算到分布式计算演进
date: 2026-11-04 10:00:00
categories:
  - 技术科普
tags:
  - 大数据
  - Hadoop
  - Spark
  - Flink
  - HDFS
description: 从数据规模、速度和价值出发，梳理大数据存储与计算从 HDFS、MapReduce 到 Spark、Flink 和云对象存储的演进逻辑。
---

> 大数据不是“把数据放到很多台机器上”这么简单，而是要在数据持续增长、访问速度要求提高、业务问题变复杂之后，重新设计数据的存、算、管、用。

## 先回答：为什么需要大数据技术

传统单机数据库在数据量较小、事务一致性要求高时非常可靠。但业务增长后会同时遇到几类问题：

- **数据量变大**：单机磁盘、内存和网络成为瓶颈；
- **数据来源变多**：业务库、日志、消息队列、文件和第三方 API 格式不同；
- **数据产生更快**：实时风控、监控和推荐不能每天批处理一次；
- **分析任务变复杂**：全表扫描、关联、聚合和机器学习需要更多计算资源；
- **数据使用者变多**：开发、分析师、算法工程师和管理者需要不同的数据视图；
- **可靠性要求提高**：节点故障、重复写入、迟到数据和权限问题不能靠人工处理。

因此，大数据平台主要解决的是“在成本可控的前提下，可靠地存储、并行地计算、统一地治理并持续地提供数据”。

## 大数据技术体系的四个基本动作

可以把平台拆成四个动作：

| 动作 | 要回答的问题 | 典型技术 |
| --- | --- | --- |
| 存 | 数据放在哪里，如何扩展和恢复？ | HDFS、对象存储、HBase、Kafka |
| 算 | 如何在大量数据上高效执行计算？ | MapReduce、Spark、Flink、Trino |
| 管 | 数据是否可信、可查、可控、可追溯？ | 元数据、血缘、质量、权限、治理 |
| 用 | 如何让业务真正消费数据？ | 数仓、湖仓、报表、推荐、风控、API |

四个动作不是孤立的。存储决定计算的数据访问方式，计算结果需要治理才能复用，治理后的数据还要通过服务、指标和模型产生业务价值。

## 图一：大数据平台总览

{% asset_img big-data-overview.svg 大数据技术体系总览架构图 %}

这张图将技术按“数据进入平台后的处理顺序”分层：底部是数据源和存储，中间是批流计算与治理，上层是数仓、数据湖和数据服务，最上面才是报表、模型和业务应用。


## 第一阶段：从单机文件到 HDFS

### 单机存储的问题

最早的数据处理可以是“文件放在一台服务器上，脚本定时读取”。这种方式简单，但容量受限于单机磁盘，机器损坏可能导致数据不可用，计算也只能使用一台机器的 CPU 和内存。

当日志和业务数据超过单机能力时，一个自然想法是把文件切成多个块，分散到多台机器上，再让多台机器并行处理。这就是分布式文件系统的基本方向。

### HDFS 解决了什么

HDFS 将大文件切成 Block，分布到多个 DataNode；NameNode 保存目录和块位置等元数据；通过副本机制，即使某台机器故障，也能从其他节点读取数据。

```text
客户端写入大文件
        │
        ▼
NameNode：记录文件 -> Block 的映射
        │
        ├── Block 1 -> DataNode A / DataNode B
        ├── Block 2 -> DataNode B / DataNode C
        └── Block 3 -> DataNode A / DataNode C
```

HDFS 的关键价值不是“文件变多了”，而是提供了横向扩展、数据副本和就近计算的基础。它适合大文件顺序读写，不适合大量小文件、频繁随机更新和低延迟事务查询。

### HDFS 的局限

随着云计算普及，企业不一定愿意维护一套长期运行的存储集群。HDFS 需要管理节点、磁盘、副本、扩容和故障；计算集群和存储集群绑定时，任务高峰还可能导致资源浪费。大量小文件也会给 NameNode 元数据带来压力。

因此，HDFS 是重要的分布式存储基础，但不是所有场景的最终答案。

## 第二阶段：云对象存储成为主流底座

云对象存储把数据保存为 Object，用 Bucket、Key 和元数据定位对象。它通常具备容量弹性、跨区域冗余、生命周期管理和按使用量计费等特征。

| 对比项 | HDFS | 云对象存储 |
| --- | --- | --- |
| 运维 | 自己维护集群和磁盘 | 云服务商维护底层硬件 |
| 扩容 | 规划节点并迁移数据 | 容量按需扩展 |
| 计算存储关系 | 常见是同一集群 | 存储与计算解耦 |
| 访问模式 | 文件系统接口、顺序读写 | HTTP/API、对象读写 |
| 成本 | 集群长期占用资源 | 存储、请求和流量分别计费 |
| 注意点 | 小文件和节点运维 | 请求延迟、出口流量和权限配置 |

对象存储并不等于数据库。它擅长保存原始文件、Parquet、ORC、图片、日志和模型文件，但不直接提供复杂事务查询。上层通常会配合 Hive Metastore、Iceberg、Delta Lake 或 Hudi 管理表结构、分区、版本和事务能力。

### 为什么要使用列式格式

CSV 适合交换和查看，却不适合大规模分析。Parquet、ORC 等列式格式只读取查询需要的列，并支持压缩和列级统计：

```sql
-- 查询只需要两列时，列式文件可以跳过其他列
SELECT user_id, total_amount
FROM lake.sales
WHERE dt = '2026-11-04'
  AND total_amount > 1000;
```

实际性能还取决于分区设计、文件大小、数据倾斜、统计信息和查询引擎。分区不是越多越好：按高基数字段分区可能产生大量目录和小文件。

## 第三阶段：MapReduce 把计算拆给集群

存储数据之后，还需要在多台机器上计算。MapReduce 将任务抽象成两个主要阶段：Map 读取输入并产生键值对，Reduce 对相同 Key 的数据聚合。

```python
# 伪代码：词频统计的 Map / Reduce 思路
def mapper(line):
    for word in line.split():
        yield word.lower(), 1


def reducer(word, counts):
    yield word, sum(counts)
```

框架负责切分输入、调度任务、传输中间结果、处理失败重试和合并输出。开发者只需要关注业务转换逻辑，这极大降低了编写分布式程序的门槛。

### MapReduce 的优点

- 任务模型简单，容错机制成熟；
- 适合超大规模离线批处理；
- 计算结果可以落回分布式文件系统；
- 节点失败时能够重新执行失败任务。

### MapReduce 为什么逐渐显得笨重

Map 和 Reduce 之间经常需要把中间结果写入磁盘。一个任务如果包含多轮关联、聚合或迭代，就要反复读写 HDFS。对机器学习、交互式分析和复杂 DAG 来说，磁盘 I/O 和任务启动开销会变得明显。

## 第四阶段：Spark 用内存和 DAG 提高批处理效率

Spark 将计算组织成 DAG（有向无环图），可以把多个转换组合后再执行，并尽量把中间数据保留在内存中。相比一轮一轮落盘的 MapReduce，它更适合多步骤 ETL、交互式 SQL、机器学习和图计算。

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, sum as sum_

spark = SparkSession.builder.appName("daily-sales").getOrCreate()

sales = spark.read.parquet("s3://demo-lake/sales/")
result = (
    sales.filter(col("dt") == "2026-11-04")
    .groupBy("shop_id")
    .agg(sum_("amount").alias("daily_amount"))
)
result.write.mode("overwrite").parquet("s3://demo-lake/summary/dt=2026-11-04/")
spark.stop()
```

Spark 的核心抽象经历了 RDD、DataFrame 和 Dataset 等演进。实际项目通常优先使用 DataFrame/Spark SQL，让优化器参与谓词下推、列裁剪和执行计划优化。

### Spark 也不是万能的

Spark 主要面向批处理和微批处理。它的内存管理、Shuffle、数据倾斜和长任务失败仍需要工程经验；数据量太大或分区不合理时，缓存可能导致 OOM，`groupByKey` 也可能把大量数据集中到少数节点。

```python
# 处理倾斜时，先聚合再汇总通常比直接 groupByKey 更节省网络传输
daily = events.groupBy("shop_id").sum("amount")
```

真正的优化不是盲目加机器，而是检查执行计划、分区数量、Shuffle 数据量、热点 Key 和小文件数量。

## 第五阶段：实时计算与 Flink

当业务需要秒级甚至毫秒级响应时，“每天或每小时跑一次 Spark”不够用了。实时风控、实时指标、设备监控和推荐特征都需要持续处理事件流。

Flink 以事件流为基础，支持状态计算、事件时间、Watermark、窗口、Exactly-once 等能力。它解决的核心问题是：数据还在不断到达时，如何正确计算一段时间内的结果，并处理乱序和迟到事件。

```java
DataStream<Event> events = env.fromSource(source, watermarkStrategy, "events");

events.keyBy(Event::userId)
      .window(TumblingEventTimeWindows.of(Time.minutes(5)))
      .aggregate(new CountEvents())
      .sinkTo(resultSink);
```

这里的窗口不是简单按机器收到数据的时间切分，而是可以依据事件携带的业务时间计算。Watermark 表示系统对“更早事件大概率已经到达”的判断，迟到数据则需要配置允许延迟和侧输出策略。

## 图二：存储与计算技术演进

{% asset_img storage-compute-evolution.svg 存储与计算技术演进图 %}

演进并不是新技术完全替代旧技术，而是不同场景形成组合：对象存储可以作为数据湖底座，Spark 负责批处理，Flink 负责实时流，数据库负责事务和服务查询。

## 怎样选择计算引擎

| 场景 | 更适合的起点 | 关注点 |
| --- | --- | --- |
| 海量离线批处理 | Spark SQL / MapReduce | 吞吐、成本、任务稳定性 |
| 交互式分析 | Trino / Presto / Spark SQL | 延迟、并发、缓存 |
| 实时事件处理 | Flink | 状态、时间语义、Exactly-once |
| 事务读写 | MySQL、PostgreSQL 等 | ACID、一致性、索引 |
| 大规模键值查询 | HBase、Cassandra 等 | 分区键、热点、延迟 |

技术选型要先问业务的延迟、数据量、更新方式和一致性要求，再看团队维护能力。用流处理引擎解决一个每天跑一次的简单报表，可能只增加了运维复杂度。

## 上篇小结

大数据技术的第一条主线是“存储和计算解耦、批处理和流处理并存”：HDFS 解决了分布式文件存储，云对象存储降低了基础设施运维成本；MapReduce 建立了可靠的批计算模型，Spark 提高了多步骤计算效率，Flink 则把重点推进到有状态的实时流处理。

但数据存下来、算出来还不够。下一篇将继续讨论数据库、数据仓库、数据湖、湖仓、数据中台，以及如何通过治理和数据服务把计算结果变成业务可以使用的资产。

## 参考资料

- [Apache Hadoop 官方文档](https://hadoop.apache.org/docs/)
- [Apache Spark 官方文档](https://spark.apache.org/docs/latest/)
- [Apache Flink 官方文档](https://nightlies.apache.org/flink/flink-docs-stable/)
- [Apache Iceberg 官方文档](https://iceberg.apache.org/docs/latest/)
- [Apache Parquet 官方文档](https://parquet.apache.org/docs/)
