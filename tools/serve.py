"""Servidor local de previsualización con headers de seguridad de respuesta."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
from functools import partial

APP_ROOT = Path(__file__).resolve().parents[1]


class SecurityHeadersHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


def make_server(port=8790):
    """Bind only loopback so the development server is not exposed to the LAN."""
    handler = partial(SecurityHeadersHandler, directory=str(APP_ROOT))
    return ThreadingHTTPServer(("127.0.0.1", int(port)), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    server = make_server(args.port)
    print(f"Rinde Fácil local: http://127.0.0.1:{server.server_address[1]}/index.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
