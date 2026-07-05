{{- define "dataflow.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "dataflow.appEnv" -}}
- name: DATABASE_URL
  value: postgres://dataflow:dataflow@postgres:5432/dataflow?sslmode=disable
- name: APP_DATABASE_URL
  value: postgres://dataflow_app:dataflow_app@postgres:5432/dataflow?sslmode=disable
- name: REDIS_URL
  value: redis://redis:6379
- name: TEMPORAL_ADDRESS
  value: temporal:7233
- name: CLICKHOUSE_URL
  value: http://clickhouse:8123
- name: CLICKHOUSE_USER
  value: dataflow
- name: CLICKHOUSE_PASSWORD
  value: dataflow
- name: CLICKHOUSE_DB
  value: dataflow
- name: SMTP_HOST
  value: email-smtp.us-east-1.amazonaws.com
- name: SMTP_PORT
  value: "465"
- name: SMTP_FROM
  valueFrom: {secretKeyRef: {name: dataflow-secrets, key: smtpFrom, optional: true}}
- name: SMTP_USER
  valueFrom: {secretKeyRef: {name: dataflow-secrets, key: smtpUser, optional: true}}
- name: SMTP_PASS
  valueFrom: {secretKeyRef: {name: dataflow-secrets, key: smtpPass, optional: true}}
- name: APP_URL
  value: http://localhost:3002
- name: JWT_ACCESS_SECRET
  valueFrom: {secretKeyRef: {name: dataflow-secrets, key: jwt}}
- name: AUTH_PASSWORD_ENABLED
  value: "true"
- name: OLLAMA_URL
  value: http://ollama:11434
- name: OLLAMA_MODEL
  value: {{ .Values.ollamaModel | quote }}
- name: COHESTRA_URL
  value: {{ .Values.cohestraURL | quote }}
- name: COHESTRA_FLINK_IMAGE
  value: dataflow-flink-sql@sha256:362650f23505dd07b809bf1f0d78c52fbc4e8ebaebd9204981672801b22c556d
- name: CONNECTORS_DIR
  value: /app/connectors/manifests
{{- end }}
