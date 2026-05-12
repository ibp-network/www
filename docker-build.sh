#!/bin/bash
# Build the ibp-rotko-net container. Mirrors ~/rotko/www.rotko.net/docker-build.sh.
set -e

IMAGE_NAME="ibp-rotko-net"
REGISTRY="${REGISTRY:-}"

# Rebuild SPA if dist/ is missing or older than src/
if [ -f package.json ]; then
    if [ ! -d dist ] || [ "$(find src -newer dist -print -quit 2>/dev/null)" ]; then
        echo "Building site..."
        npm run build
    fi
fi

echo "Building container..."
podman build -t "$IMAGE_NAME" .

echo "Image size:"
podman images "$IMAGE_NAME" --format "{{.Size}}"

if [ -n "$REGISTRY" ]; then
    echo "Pushing to $REGISTRY..."
    podman tag "$IMAGE_NAME" "$REGISTRY/$IMAGE_NAME"
    podman push "$REGISTRY/$IMAGE_NAME"
fi

echo "Done! Run with: podman run -p 8080:80 $IMAGE_NAME"
