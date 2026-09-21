# 멀티샷 (MultiShot)

한 번 찍고 여러 비율로 동시에 저장하는 카메라 앱. 뷰파인더에 선택한 비율 프레임이 전부 겹쳐 보이고, 촬영 후 결과가 화면을 빈틈없이 채우면 마음에 드는 비율만 골라 저장한다.

- 웹/PWA: Vite + React. 카메라는 `getUserMedia`, 크롭은 Canvas.
- Android 앱: 같은 웹 빌드를 Capacitor로 감쌈. 갤러리 저장(`@capacitor-community/media`)과 하단 배너 광고(`@capacitor-community/admob`)만 네이티브.

## 개발

```sh
npm install
npm run dev        # https://<맥 IP>:5180 — 폰 Safari에서 열고 인증서 경고 허용
npm test           # 크롭 계산·타일 배치 단위 테스트
npm run build      # dist/
```

- 데스크톱에서 카메라 없이 볼 때: `?demo=1` (`public/demo.jpg` 샘플 사진으로 촬영 흐름 재현)
- 저장: 앱은 "멀티샷" 앨범, 모바일 웹은 공유 시트, 그 외는 다운로드.

## Android 출시 빌드

```sh
node scripts/release-android.mjs          # android/app/build/outputs/bundle/release/app-release.aab
node scripts/release-android.mjs --apk    # 폰에 직접 설치할 apk
```

스크립트가 하는 일: 웹 릴리스 빌드 → `cap sync android` → Gradle `bundleRelease`. JDK 21이 필요하다
(`~/Library/Java/JavaVirtualMachines/jdk-21*`에서 자동으로 찾는다).

**서명.** 키스토어는 `~/multishot-release.jks`(alias `multishot`), 비밀번호는 macOS 키체인
(`security find-generic-password -a multishot -s multishot-keystore -w`). **이 파일을 잃어버리면 앱을 다시는
업데이트할 수 없다.** 파일과 비밀번호를 따로 백업할 것. 키체인 항목이 없으면 디버그 키로 서명되고 Play가 거부한다.

**AdMob.** `admob.env.example`을 `admob.env`로 복사해 앱 ID와 배너 광고 단위 ID를 넣는다. 없으면 구글 테스트
광고로 빌드되며(수익 0), 빌드 로그 첫 줄에 어느 쪽인지 찍힌다. **실제 광고를 직접 누르면 계정이 정지될 수 있다.**

**버전.** `android/app/build.gradle`의 `versionCode`(정수, 올릴 때마다 +1)와 `versionName`.

## 스토어 자산

`store/out/`: Play 아이콘 512, 피처 그래픽 1024×500, 스크린샷 4장(1170×2532), 등록정보 문구(한/영).
아이콘 원본은 `store/source/icon-gpt.png`(ChatGPT), 런처 아이콘은 `.venv/bin/python store/scripts/icons.py`로 재생성.
스크린샷은 실제 앱을 `?demo=1`로 띄워 CDP로 찍는다 (`scripts/cdp.mjs shot`, `W=390 H=844 DPR=3`).

## 웹 배포

`main`에 푸시하면 GitHub Pages가 `dist/`를 배포한다: https://jeongwookkim.github.io/multishot/
- 개인정보처리방침: https://jeongwookkim.github.io/multishot/privacy.html (Play 등록정보에 넣는 URL)
- `app-ads.txt`는 도메인 루트에 있어야 인정되므로 Pages 하위 경로로는 효과가 없다. 개발자 웹사이트를
  자체 도메인으로 바꾸면 그 루트에 `public/app-ads.txt` 내용을 올린다.

## 구조

- `src/ratios.ts` — 비율 정의, 센서 프레임 기준 중앙 크롭 계산
- `src/pack.ts` — 결과 화면 타일을 빈틈없이 채우는 행 배치
- `src/camera.ts` — 카메라 열기, 프레임 캡처, 비율별 JPEG, 저장
- `src/native.ts` — Capacitor: 갤러리 저장, 배너 광고
- `src/App.tsx` — 카메라 화면과 결과 선택 화면
- `design/mockup.png` — ChatGPT 목업(구현 기준)
