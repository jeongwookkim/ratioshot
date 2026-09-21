# Play Console 체크리스트 (RatioShot)

앱 만들기: 앱 이름 `RatioShot: Shoot Once, Every Ratio`, 기본 언어 **영어(미국)**, 앱, 무료, 패키지 `com.ratioshot.camera`.

## 올릴 파일

| 항목 | 파일 |
| --- | --- |
| 앱 번들 | `android/app/build/outputs/bundle/release/app-release.aab` (`node scripts/release-android.mjs`) |
| 앱 아이콘 512×512 | `store/out/play-icon-512.png` |
| 피처 그래픽 1024×500 | `store/out/feature-1024x500.png` |
| 휴대전화 스크린샷 | `store/out/shots/*.png` (1170×2532, 4장) |
| 등록정보 문구 | `store/out/listing/en.txt`(기본 언어 en-US), `ko.txt` |

## 설문 답

- **개인정보처리방침 URL**: https://jeongwookkim.github.io/ratioshot/privacy.html
- **광고**: 예, 광고 포함 (AdMob 배너)
- **앱 액세스 권한**: 특별한 액세스 없음 (로그인 없음)
- **콘텐츠 등급**: 유틸리티. 폭력·성적 콘텐츠·도박 없음, 사용자 생성 콘텐츠 공유 없음 → 전체이용가
- **타겟층**: 만 18세 이상 (어린이 대상 아님)
- **뉴스 앱**: 아니요 / **코로나19**: 아니요 / **금융 기능**: 없음 / **정부 앱**: 아니요
- **데이터 보안**:
  - 수집·공유: **예** (광고 SDK)
  - 데이터 유형: 기기 또는 기타 ID → **광고 ID**, 수집됨·공유됨, 광고 또는 마케팅 목적, 선택 아님
  - 사진: 수집 안 함 (기기 안에서만 처리, 전송 없음)
  - 전송 중 암호화: 예 / 삭제 요청: 앱 삭제로 처리
- **카테고리**: 앱 > 사진
- **연락처**: mybiggold92@gmail.com

## 출시

1. 프로덕션(또는 내부 테스트) → 새 버전 만들기 → `app-release.aab` 업로드 (첫 번들은 콘솔에서 손으로 올려야 한다).
2. Play 앱 서명 사용(기본). 업로드 키 = `~/ratioshot-release.jks`.
3. 출시 노트: "First release. One shot, saved in 4:5, 1:1, 16:9, 9:16 and 3:2 at once."
4. AdMob 콘솔에서 앱 등록(이름 RatioShot, 플랫폼 Android, "Play에 있음"은 출시 후 연결) → 배너 광고 단위 → `admob.env`에 ID → 다시 빌드해서 업데이트 버전으로 올린다. 첫 번들이 테스트 광고 ID로 나가도 되지만 그동안 수익은 0.
