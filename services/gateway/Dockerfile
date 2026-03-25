FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod ./
# No external deps, stdlib only
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /gateway ./cmd/server/

FROM alpine:3.19

RUN apk --no-cache add ca-certificates
COPY --from=builder /gateway /gateway

EXPOSE 8080

ENTRYPOINT ["/gateway"]
