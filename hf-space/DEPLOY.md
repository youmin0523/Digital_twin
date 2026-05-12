# 🚢 Arctic Digital Twin — HF Spaces 배포 가이드

이 문서는 **로컬 PC → Hugging Face Spaces** 로 백엔드 4종을 한번에 배포하는 절차를 다룬다.
처음 한 번만 실행하면 되는 “1회 셋업” 과 매번 코드 변경 후 실행하는 “업데이트” 두 단계로 구성.

> 전제: 본인 PC 에 Git, Git LFS, Hugging Face 계정이 있다.

---

## 📋 사전 준비 (5분)

### 1. Hugging Face 계정 + Access Token

1. https://huggingface.co/join 가입 (이미 있으면 스킵)
2. 우측 상단 프로필 → **Settings** → **Access Tokens** → **New token**
   * 이름: `arctic-deploy`
   * Type: **Write**
   * 만들고 토큰 값 복사 → 안전한 곳에 저장 (한 번만 보임)

### 2. Git LFS 설치

```bash
# Windows: https://git-lfs.com/ 에서 설치 후
git lfs install
```

### 3. (선택) Anthropic API Key 준비

`report-service` 에서 Claude 분석을 쓰려면 https://console.anthropic.com/ 에서 API key 발급.
없어도 다른 3개 서비스는 정상 동작.

---

## 🆕 1회 셋업 (15분)

### Step 1. Space 생성

1. https://huggingface.co/new-space 접속
2. 입력:
   * **Owner**: 본인 username
   * **Space name**: `arctic-digital-twin-backend` (자유)
   * **License**: `mit` (또는 원하는 라이선스)
   * **Space SDK**: **Docker** ← ⭐ 중요
   * **Docker template**: `Blank` (빈 템플릿)
   * **Hardware**: `CPU basic — 2 vCPU · 16 GB RAM` (Free)
   * **Visibility**: `Private` (배포 안정화 후 Public 전환 권장)
3. **Create Space** 클릭

### Step 2. Space repo 클론

```bash
# 작업 폴더로 이동
cd C:\Hijin

git clone https://huggingface.co/spaces/<your-username>/arctic-digital-twin-backend
cd arctic-digital-twin-backend
```

토큰 입력 프롬프트가 뜨면 위에서 만든 **Write 토큰** 붙여넣기.

### Step 3. 배포 파일 복사

PowerShell (관리자 권한 불필요):

```powershell
# 위치: arctic-digital-twin-backend/  (방금 클론한 곳)

# A. hf-space 의 6개 파일을 Space 루트로
$src = "C:\Hijin\pjbingha\Digital_twin\hf-space"
Copy-Item "$src\app.py"            -Destination .
Copy-Item "$src\Dockerfile"        -Destination .
Copy-Item "$src\requirements.txt"  -Destination .
Copy-Item "$src\README.md"         -Destination . -Force   # HF Space 가 만들어둔 기본 README 덮어쓰기
Copy-Item "$src\DEPLOY.md"         -Destination .
Copy-Item "$src\.env.example"      -Destination .
Copy-Item "$src\.dockerignore"     -Destination .
Copy-Item "$src\.gitattributes"    -Destination .

# B. 4개 백엔드 서비스 복사
$proj = "C:\Hijin\pjbingha\Digital_twin"
robocopy "$proj\rl-pipeline"     ".\rl-pipeline"     /E /XD venv __pycache__ logs runs
robocopy "$proj\report-service"  ".\report-service"  /E /XD venv __pycache__ output
robocopy "$proj\ml-pipeline"     ".\ml-pipeline"     /E /XD venv __pycache__
Copy-Item  "$proj\sar_server.py" -Destination .

# C. SAR 서버가 참조하는 backend/pipeline 만 복사 (Node.js 코드는 제외)
robocopy "$proj\backend\pipeline" ".\backend\pipeline" /E /XD __pycache__
```

> macOS / Linux 라면 `cp -r` 와 `rsync --exclude=venv --exclude=__pycache__` 로 동일하게 수행.

### Step 4. Git LFS 추적 등록

큰 모델 파일을 Git LFS 에 등록:

```bash
git lfs track "*.pkl"
git lfs track "*.pt"
git lfs track "*.zip"
git lfs track "rl-pipeline/models/sac_*/**"
git lfs track "report-service/yolov8n.pt"

# .gitattributes 가 자동 생성/업데이트됨
git add .gitattributes
```

### Step 5. Secrets 등록

브라우저로 본인 Space 페이지로 이동:

```
https://huggingface.co/spaces/<your-username>/arctic-digital-twin-backend/settings
```

좌측 메뉴 **Variables and secrets** → **New secret** → 다음 항목 등록:

| 이름 | 값 | 필수? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | report-service 의 Claude 분석 사용 시 |
| `COPERNICUS_MARINE_USER` | 본인 이메일 | (선택) |
| `COPERNICUS_MARINE_PASSWORD` | 비밀번호 | (선택) |
| `CDSE_USER` | 본인 이메일 | (선택) |
| `CDSE_PASSWORD` | 비밀번호 | (선택) |

> ⚠️ Secrets 는 한 번 입력하면 다시 볼 수 없다. 본인 PC 에도 따로 백업 권장.

### Step 6. 첫 푸시 (= 첫 빌드)

```bash
git add .
git commit -m "Initial deploy: 4-service unified backend"
git push
```

* LFS 파일 업로드: 회선에 따라 5~30분 (모델 합쳐 ~3GB)
* HF Spaces 자동 빌드 시작
* https://huggingface.co/spaces/<your-username>/arctic-digital-twin-backend 에서 **Logs** 탭 열고 빌드 진행 확인

빌드 완료 후 (15~25분), 상태가 **Running** 으로 바뀌면 성공:

```bash
curl https://<your-username>-arctic-digital-twin-backend.hf.space/health
# → {"status":"ok","subprocesses":{"rl-pipeline":"alive",...}}
```

---

## 🔄 업데이트 (코드 변경 시)

```bash
cd C:\Hijin\arctic-digital-twin-backend

# 변경사항을 hf-space → Space 루트로 다시 복사 (위 Step 3 와 동일)
# (변경된 파일만 robocopy 가 알아서 갱신)

git add .
git commit -m "Update: <어떤 변경인지>"
git push
```

HF Spaces 가 자동으로 재빌드 → 재배포. 약 5~10분.

---

## 🩺 디버깅 / 문제 해결

### 빌드 실패: `ERROR: Could not find a version that satisfies the requirement pywin32`

→ 본 가이드는 이미 `pywin32` 를 빼두었다. 만약 다시 들어갔다면 `requirements.txt` 에서 제거.

### Container 시작 실패 / 503

* Space → **Logs** 에서 자식 프로세스(rl-pipeline 등) 어디가 실패했는지 확인.
* 흔한 원인:
  * 모델 파일이 LFS 로 추적 안 됐거나, push 안 됨 (작은 포인터 파일만 올라감)
  * `report-service` 가 `ANTHROPIC_API_KEY` 없을 때 startup 에서 에러 던짐 → 더미 값이라도 등록

### `report-service` 가 backend/.env 를 못 읽음

* 정상이다. HF 에선 환경변수가 secrets 로 직접 주입되므로 .env 파일은 필요 없다.
* `python-dotenv` 의 `load_dotenv` 는 파일 없을 때 조용히 넘어간다.

### 응답이 너무 느림 (504)

* CPU 추론은 느릴 수 있다. 특히 RL 학습 엔드포인트(`/api/rl/train/*`).
* 학습은 본인 PC 에서, HF 엔 추론만 — 권장 운영 패턴.

### 빌드는 됐는데 `/api/sar/*` 만 502

* `backend/pipeline/trainers/` 가 안 올라갔을 수 있음. Step 3 의 마지막 `robocopy` 다시 확인.
* `iceberg_yolov8.pt` 가 LFS 포인터 파일인지 진짜 바이너리인지 확인:
  ```bash
  ls -lh backend/pipeline/models/iceberg_yolov8.pt
  # 100 bytes 면 LFS 포인터, ~6MB 면 진짜 모델
  ```

---

## 🧹 디렉토리 청소 (선택)

배포 후 Space repo 가 너무 무거우면:

```bash
# 학습 로그/체크포인트 임시 파일 제거
git rm -r --cached rl-pipeline/logs
git rm -r --cached rl-pipeline/runs
git commit -m "Clean: remove training logs from history"
git push
```

LFS 사용량은 HF Free 가 5GB. 넘으면 PRO ($9/월) 또는 모델만 별도 HF Hub repo 로 분리.

---

## 📞 다음 단계 (선택)

1. **CORS 좁히기**: `app.py` 의 `allow_origins=["*"]` → `["https://your-vercel-domain.vercel.app"]`
2. **레이트 리밋**: `slowapi` 추가 → 공모전 평가 중 폭주 방지
3. **모니터링**: Sentry 또는 HF Spaces 의 빌트인 메트릭 확인
4. **GPU 업그레이드**: `Settings → Hardware → T4 small` ($0.40/h) 로 RL 추론 50배 빠름
