# 📝 개인 블로그

하이브리드 시스템 블로그입니다.

## 🚀 특징

- ✅ 관리자 페이지에서 글 작성
- ✅ GitHub Actions 자동 빌드
- ✅ 정적 사이트 배포 (빠른 속도)
- ✅ noindex 태그 (검색엔진 차단)

## 📁 구조

```
blog/
├── content/         # 마크다운 글
├── templates/       # HTML 템플릿
├── build/          # 빌드 스크립트
├── static/         # CSS, JS, 이미지
├── admin/          # 관리자 페이지
├── config.json     # 블로그 설정
└── package.json    # npm 설정
```

## 🔄 워크플로우

1. 관리자 페이지에서 글 작성
2. GitHub에 자동 푸시
3. GitHub Actions 자동 빌드
4. gh-pages 브랜치에 배포

## 🛠️ 로컬 빌드

```bash
npm install
npm run build
```

## 📝 License

MIT
