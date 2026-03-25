FROM rust:1.78-slim AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Create dummy src to cache deps
RUN mkdir src && echo "fn main(){}" > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Now copy real source
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/scholarmind-inference /usr/local/bin/

EXPOSE 8081

ENTRYPOINT ["scholarmind-inference"]
