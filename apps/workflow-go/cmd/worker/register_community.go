//go:build !ee

package main

import "go.temporal.io/sdk/worker"

func registerEnterpriseWorkflows(worker.Worker) {}
