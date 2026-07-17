FROM flink:1.20.1-scala_2.12
# Remote-URL ADD lands root-owned with mode 600; chmod keeps the connector
# jars readable once the image drops to the non-root flink user.
ADD --chmod=0644 https://repo1.maven.org/maven2/org/apache/flink/flink-sql-connector-kafka/3.3.0-1.20/flink-sql-connector-kafka-3.3.0-1.20.jar /opt/flink/lib/
ADD --chmod=0644 https://repo1.maven.org/maven2/org/apache/flink/flink-connector-jdbc/3.3.0-1.20/flink-connector-jdbc-3.3.0-1.20.jar /opt/flink/lib/
ADD --chmod=0644 https://repo1.maven.org/maven2/com/clickhouse/clickhouse-jdbc/0.7.2/clickhouse-jdbc-0.7.2-all.jar /opt/flink/lib/
USER flink
