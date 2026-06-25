FROM golang:1.25-alpine AS build
WORKDIR /src
COPY apps/workflow-go/go.mod apps/workflow-go/go.sum* ./
RUN go mod download
COPY apps/workflow-go ./
RUN CGO_ENABLED=0 go build -o /out/workflow-worker ./cmd/worker

FROM alpine:3.21
RUN addgroup -S dataflow && adduser -S dataflow -G dataflow
COPY --from=build /out/workflow-worker /usr/local/bin/workflow-worker
USER dataflow
ENTRYPOINT ["workflow-worker"]
