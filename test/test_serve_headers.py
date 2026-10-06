import pathlib
import sys
import threading
import urllib.request
import unittest

TOOLS = pathlib.Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))
from serve import make_server


class LocalServerSecurityHeadersTest(unittest.TestCase):
    def test_html_response_denies_framing(self):
        server = make_server(0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            host, port = server.server_address
            with urllib.request.urlopen(f"http://{host}:{port}/index.html") as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get("Content-Security-Policy"), "frame-ancestors 'none'")
                self.assertEqual(response.headers.get("X-Frame-Options"), "DENY")
                self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
