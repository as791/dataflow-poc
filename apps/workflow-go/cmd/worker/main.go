package main

import (
	"log"
	"os"

	"github.com/dataflow-poc/workflow-go/internal/codec"
	"github.com/dataflow-poc/workflow-go/internal/workflows"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

func main() {
	namespace := env("TEMPORAL_NAMESPACE", "test")
	taskQueue := env("TASK_QUEUE", "dynamic-dag-"+namespace)
	dataConverter, err := codec.NewDataConverterFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	temporalClient, err := client.Dial(client.Options{
		HostPort:      env("TEMPORAL_ADDRESS", "localhost:7233"),
		Namespace:     namespace,
		DataConverter: dataConverter,
	})
	if err != nil {
		log.Fatal(err)
	}
	defer temporalClient.Close()

	w := worker.New(temporalClient, taskQueue, worker.Options{})
	w.RegisterWorkflow(workflows.DynamicDAGWorkflow)
	w.RegisterWorkflow(workflows.StreamDirectWorkflow)
	w.RegisterWorkflow(workflows.SparkJobWorkflow)
	w.RegisterWorkflow(workflows.FlinkJobWorkflow)
	log.Printf("Go workflow worker started namespace=%s taskQueue=%s", namespace, taskQueue)
	if err := w.Run(worker.InterruptCh()); err != nil {
		log.Fatal(err)
	}
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
