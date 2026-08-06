# syntax=docker/dockerfile:1.7

FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY tools/gen-cert.sh /usr/local/bin/gen-cert.sh
RUN chmod +x /usr/local/bin/gen-cert.sh && /usr/local/bin/gen-cert.sh

EXPOSE 2222

CMD ["nginx", "-g", "daemon off;"]
