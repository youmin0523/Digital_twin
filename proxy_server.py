import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import sys

PORT = 8000

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # 1. NSIDC 전용 Proxy 라우터 (CORS 우회)
        # [2026-03] nsidc.org/api/mapservices WMS 폐기됨 → NASA GIBS WMS로 대체
        # 대체 레이어: AMSRU2_Sea_Ice_Concentration_25km, AMSRU2_Sea_Ice_Brightness_Temp_6km_89H
        if self.path.startswith('/nsidc-proxy/'):
            parsed = urllib.parse.urlparse(self.path)
            target_url = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?" + parsed.query
            self.proxy_request(target_url)

        # 2. Copernicus 전용 Proxy 라우터 (CORS 우회)
        # [2026-03] nrt.cmems-du.eu 도메인 만료/하이재킹 → Copernicus Marine Service WMTS로 대체
        # 신규 엔드포인트: wmts.marine.copernicus.eu (WMTS KVP 방식, 인증 불필요)
        elif self.path.startswith('/cop-proxy/'):
            parsed = urllib.parse.urlparse(self.path)
            target_url = "https://wmts.marine.copernicus.eu/teroWmts?" + parsed.query
            self.proxy_request(target_url)
        
        # 3. 나머지 모든 요청은 기존처럼 파일 응답 (html, js, css 등)
        else:
            super().do_GET()

    def proxy_request(self, target_url):
        try:
            # 봇 차단을 막기 위해 User-Agent 추가
            req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                content = response.read()
                self.send_response(response.status)
                
                # 기존 헤더 복원 (Content-Type 등)
                for key, value in response.headers.items():
                    if key.lower() not in ['content-length', 'connection', 'transfer-encoding']:
                        self.send_header(key, value)
                        
                # [핵심] 브라우저 보안통과를 위한 CORS 허용 헤더 강제 주입!
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content)
        except urllib.error.HTTPError as e:
            # 타일이 없는 지역(예: 한국, 태평양 등 얼음이 없는 바다)은 업스트림이 404를 반환합니다.
            # 404를 그대로 브라우저에 넘기면 Cesium이 전체 레이어를 다운시킵니다.
            # 따라서 404 에러 시 "투명한 1x1 픽셀 이미지"를 정상(200 OK)인 것처럼 속여서 반환합니다!
            if e.code == 404:
                # 1x1 Transparent PNG (Base64 디코딩 형태)
                transparent_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(transparent_png)
            else:
                self.send_error(500, f"Upstream HTTP Error {e.code}: {e.reason}")
        except urllib.error.URLError as e:
            self.send_error(500, f"Proxy URL Error: {e.reason}")

# 주소 포트 바인딩 중복 방지 (기존 서버 재기동 시 포트 충돌 방지 옵션)
socketserver.ThreadingTCPServer.allow_reuse_address = True

# 병렬(Multi-thread) 처리를 지원하는 서버로 가동 (지도 타일 100개 동시 로딩 허용)
with socketserver.ThreadingTCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
    print(f"============================================================")
    print(f"🚀 [CORS-Free & Multi-Thread] 북극 디지털 트윈 서버가 가동되었습니다!")
    print(f"👉 브라우저 주소창에 복사하세요: http://localhost:{PORT}/arctic-hybrid.html")
    print(f"✓ NSIDC / Copernicus 멀티 프록시 라우터 탑재 완료 (404 Pass-Through 적용)")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버가 종료되었습니다.")
        sys.exit(0)
