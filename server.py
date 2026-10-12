import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class RangeRequestHandler(SimpleHTTPRequestHandler):
    """
    HTTP server that supports byte-range requests (HTTP 206 Partial Content).
    Enables seeking/scrubbing in HTML5 <audio> and <video> elements in Chrome/Safari/Edge.
    """
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        # Allow cross-origin if needed
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def copy_byte_range(self, infile, outfile, start, length, buffer_size=32*1024):
        infile.seek(start)
        remaining = length
        while remaining > 0:
            chunk = infile.read(min(remaining, buffer_size))
            if not chunk:
                break
            outfile.write(chunk)
            remaining -= len(chunk)

    def do_GET(self):
        range_header = self.headers.get('Range')
        if not range_header:
            return super().do_GET()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()

        try:
            file_size = os.path.getsize(path)
            m = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if not m:
                return super().do_GET()

            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else file_size - 1

            if start >= file_size or end >= file_size or start > end:
                self.send_error(416, "Requested Range Not Satisfiable")
                return

            length = end - start + 1
            self.send_response(206)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            self.send_header('Content-Length', str(length))
            self.end_headers()

            with open(path, 'rb') as f:
                self.copy_byte_range(f, self.wfile, start, length)
        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, RangeRequestHandler)
    print(f"Dreamy Voyage Server (HTTP 206 Audio Seeking Supported) running on port {port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
