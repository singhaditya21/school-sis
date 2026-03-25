package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

// Config holds the gateway configuration
type Config struct {
	Port         string
	WebURL       string // Next.js frontend
	AgentsURL    string // Python agent service
	InferenceURL string // Rust inference engine
}

func loadConfig() Config {
	return Config{
		Port:         getEnv("GATEWAY_PORT", "8080"),
		WebURL:       getEnv("WEB_URL", "http://localhost:3000"),
		AgentsURL:    getEnv("AGENTS_URL", "http://localhost:8083"),
		InferenceURL: getEnv("INFERENCE_URL", "http://localhost:8081"),
	}
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}

func main() {
	config := loadConfig()

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"service": "scholarmind-gateway",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Agent routes → Python agent service
	agentsTarget, _ := url.Parse(config.AgentsURL)
	agentsProxy := httputil.NewSingleHostReverseProxy(agentsTarget)
	mux.Handle("/api/v1/agents/", agentsProxy)

	// Inference routes → Rust inference engine
	inferenceTarget, _ := url.Parse(config.InferenceURL)
	inferenceProxy := httputil.NewSingleHostReverseProxy(inferenceTarget)
	mux.Handle("/v1/chat/", inferenceProxy)
	mux.Handle("/v1/embeddings", inferenceProxy)

	// All other routes → Next.js frontend
	webTarget, _ := url.Parse(config.WebURL)
	webProxy := httputil.NewSingleHostReverseProxy(webTarget)
	mux.Handle("/", webProxy)

	// CORS middleware wrapper
	handler := corsMiddleware(loggingMiddleware(mux))

	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("ScholarMind Gateway starting on %s", addr)
	log.Printf("  → Web:       %s", config.WebURL)
	log.Printf("  → Agents:    %s", config.AgentsURL)
	log.Printf("  → Inference: %s", config.InferenceURL)

	server := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Gateway failed to start: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
