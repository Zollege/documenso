#!/bin/sh

# 🚀 Starting Documenso...
printf "🚀 Starting Documenso...\n\n"

# --- Generate a self-signed signing certificate if missing ---
CERT_DIR=/app/certs
CERT_P12="${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-$CERT_DIR/cert.p12}"
CERT_KEY="$CERT_DIR/private.key"
CERT_CRT="$CERT_DIR/certificate.crt"

mkdir -p "$CERT_DIR"

if [ ! -s "$CERT_P12" ]; then
  echo "🆕 No signing PKCS#12 found at $CERT_P12; generating self-signed cert..."

  # 1) Generate key + self-signed X.509 (non-interactive)
  #    Customize the subject as you like:
  openssl req -new -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_KEY" -out "$CERT_CRT" -days 3650 -sha256 \
    -subj "/O=Documenso/CN=Self-Signed Signing Cert"

  # 2) Export PKCS#12 with *empty* password (Documenso supports empty)
  #    If you prefer a password, set NEXT_PRIVATE_SIGNING_PASSPHRASE and remove the explicit 'pass:' below.
  openssl pkcs12 -export \
    -inkey "$CERT_KEY" -in "$CERT_CRT" \
    -name "documenso" \
    -out "$CERT_P12" \
    -passout pass: \
    -keypbe PBE-SHA1-3DES \
    -certpbe PBE-SHA1-3DES \
    -macalg sha1

  
  # Verify certificate structure (should show no errors)
   openssl pkcs12 -info -in "$CERT_P12" -passin pass: -noout || true

  # 4) If you’re using an env var for the passphrase, ensure it’s empty when using empty PKCS#12
  export NEXT_PRIVATE_SIGNING_PASSPHRASE="${NEXT_PRIVATE_SIGNING_PASSPHRASE:-}"
  echo "✅ Generated self-signed PKCS#12 at $CERT_P12 (no passphrase)"
else
  echo "✅ Using existing signing PKCS#12 at $CERT_P12"
fi

# 🔐 Check certificate configuration
printf "🔐 Checking certificate configuration...\n"

CERT_PATH="${NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH:-/opt/documenso/cert.p12}"

if [ -f "$CERT_PATH" ] && [ -r "$CERT_PATH" ]; then
    printf "✅ Certificate file found and readable - document signing is ready!\n"
else
    printf "⚠️ Certificate not found or not readable\n"
    printf "💡 Tip: Documenso will still start, but document signing will be unavailable\n"
    printf "🔧 Check: http://localhost:3000/api/certificate-status for detailed status\n"
fi

printf "\n📚 Useful Links:\n"
printf "📖 Documentation: https://docs.documenso.com\n"
printf "🐳 Self-hosting guide: https://docs.documenso.com/developers/self-hosting\n"
printf "🔐 Certificate setup: https://docs.documenso.com/developers/self-hosting/signing-certificate\n"
printf "🏥 Health check: http://localhost:3000/api/health\n"
printf "📊 Certificate status: http://localhost:3000/api/certificate-status\n"
printf "👥 Community: https://github.com/documenso/documenso\n\n"

printf "🗄️  Running database migrations...\n"
npx prisma migrate deploy --schema ../../packages/prisma/schema.prisma

printf "🌟 Starting Documenso server...\n"
# Preload Aikido Zen (in-app firewall). The server is native ESM, so it must be loaded with -r.
HOSTNAME=0.0.0.0 node -r @aikidosec/firewall/instrument build/server/main.js
