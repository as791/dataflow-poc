//go:build !ee

package activities

import "go.temporal.io/sdk/activity"

// Community builds ship no enterprise activities; the API rejects pipelines
// that would need them before any workflow starts.
func registerEnterprise(interface {
	RegisterActivityWithOptions(interface{}, activity.RegisterOptions)
}, *Activities) {
}
