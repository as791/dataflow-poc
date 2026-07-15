package objectstore

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type Config struct {
	Bucket          string
	Region          string
	Endpoint        string
	ForcePathStyle  bool
	AccessKeyID     string
	SecretAccessKey string
}

type Store struct {
	config Config
	client *s3.Client
}

func New(ctx context.Context, cfg Config) (*Store, error) {
	if cfg.Bucket == "" {
		return nil, nil
	}
	if (cfg.AccessKeyID == "") != (cfg.SecretAccessKey == "") {
		return nil, fmt.Errorf("PAYLOAD_S3_ACCESS_KEY_ID and PAYLOAD_S3_SECRET_ACCESS_KEY must be set together")
	}
	options := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(cfg.Region)}
	if cfg.AccessKeyID != "" {
		options = append(options, awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, "")))
	}
	loaded, err := awsconfig.LoadDefaultConfig(ctx, options...)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(loaded, func(o *s3.Options) {
		o.UsePathStyle = cfg.ForcePathStyle
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
	})
	return &Store{config: cfg, client: client}, nil
}

func Key(tenantID, executionID, nodeID string) string {
	escape := func(value string) string { return url.PathEscape(value) }
	return fmt.Sprintf("payloads/%s/%s/%s/%s.json.enc", escape(tenantID), escape(executionID), escape(nodeID), uuid.NewString())
}

func (s *Store) Bucket() string { return s.config.Bucket }

func (s *Store) Put(ctx context.Context, key, body string) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.config.Bucket), Key: aws.String(key), Body: strings.NewReader(body),
		ContentType: aws.String("application/octet-stream"),
	})
	return err
}

// Get fetches an object. If maxBytes > 0, the download is capped there (belt-and-suspenders
// alongside the caller's own size check on stored metadata) and an oversized object errors
// out instead of being fully buffered.
func (s *Store) Get(ctx context.Context, bucket, key string, maxBytes int64) (string, error) {
	if bucket == "" {
		bucket = s.config.Bucket
	}
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return "", err
	}
	defer result.Body.Close()
	reader := io.Reader(result.Body)
	if maxBytes > 0 {
		reader = io.LimitReader(result.Body, maxBytes+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	if maxBytes > 0 && int64(len(body)) > maxBytes {
		return "", fmt.Errorf("object %s is larger than max payload size of %d bytes", key, maxBytes)
	}
	return string(body), nil
}

func (s *Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.config.Bucket), Key: aws.String(key)})
	return err
}
