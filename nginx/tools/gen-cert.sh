#!/bin/sh
set -e

CERT_DIR="/etc/nginx/certs"
DAYS=365

mkdir -p "$CERT_DIR"

echo ">> Generating self-signed certificate for localhost..."

openssl req -x509 -nodes \
	-newkey rsa:2048 \
	-days "$DAYS" \
	-keyout "$CERT_DIR/key.pem" \
	-out "$CERT_DIR/cert.pem" \
	-subj "/C=PT/ST=Lisboa/L=Lisboa/O=42Lisboa/OU=ft_transcendence/CN=localhost" \
	-addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"

chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"

echo ">> Certificate generated at $CERT_DIR"
