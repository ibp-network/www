# Multi-stage build for minimal Redbean container
# Mirrors the ~/rotko/www.rotko.net pattern. Final image ~8MB.

FROM alpine:latest AS build

# Install zip and download redbean + ape loader to convert to native ELF
RUN apk add --no-cache zip && \
    wget -q https://cosmo.zip/pub/cosmos/bin/ape-x86_64.elf -O /usr/bin/ape && \
    chmod +x /usr/bin/ape && \
    wget -q https://redbean.dev/redbean-2.2.com -O /redbean.com && \
    chmod +x /redbean.com

# Pack the prebuilt SPA into the redbean zip
WORKDIR /app
COPY dist/ ./dist/
RUN cd dist && zip -r /redbean.com . && cd ..

# Minimal runtime stage
FROM alpine:latest
COPY --from=build /usr/bin/ape /usr/bin/ape
COPY --from=build /redbean.com /redbean.com

EXPOSE 80
CMD ["/usr/bin/ape", "/redbean.com", "-vv", "-p", "80"]
