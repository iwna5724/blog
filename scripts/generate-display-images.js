#!/usr/bin/env node

/**
 * 기존 사진(Release asset)에서 display 이미지(1920px) 생성
 *
 * 사용: node scripts/generate-display-images.js
 *
 * 처리:
 * 1. photo/photo_data.json 읽기
 * 2. dispUrl이 없는 사진만 처리
 * 3. Release URL에서 원본 다운로드
 * 4. 1920px로 리사이징 후 photo/disp_*.jpg 저장
 * 5. photo_data.json 업데이트
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PHOTO_DATA_PATH = path.join(__dirname, '..', 'photo', 'photo_data.json');
const PHOTO_DIR = path.join(__dirname, '..', 'photo');

// Canvas 없이 이미지 처리하기 위해 sharp 사용 (Node.js 환경)
// sharp가 없으면 설치 안내
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('❌ sharp 패키지가 필요합니다.');
  console.error('   설치: npm install sharp');
  process.exit(1);
}

// URL에서 파일 다운로드 (redirect 따르기)
function downloadFile(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      reject(new Error('리다이렉트 횟수 초과'));
      return;
    }

    https.get(url, (response) => {
      // 3xx redirect 처리
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        downloadFile(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// 이미지를 1920px로 리사이징 (최대 너비/높이)
async function resizeToDisplay(imageBuffer, filename) {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    let resizeOptions = { withoutEnlargement: true };

    // 1920px를 max width/height로 설정
    if (metadata.width > metadata.height) {
      resizeOptions.width = 1920;
    } else {
      resizeOptions.height = 1920;
    }

    const displayBuffer = await sharp(imageBuffer)
      .resize(resizeOptions)
      .jpeg({ quality: 85 })
      .toBuffer();

    return displayBuffer;
  } catch (err) {
    throw new Error(`리사이징 실패 (${filename}): ${err.message}`);
  }
}

async function main() {
  console.log('📸 display 이미지 생성 시작...\n');

  // 1. photo_data.json 읽기
  if (!fs.existsSync(PHOTO_DATA_PATH)) {
    console.error(`❌ ${PHOTO_DATA_PATH} 파일을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const photoData = JSON.parse(fs.readFileSync(PHOTO_DATA_PATH, 'utf-8'));
  if (!Array.isArray(photoData)) {
    console.error('❌ photo_data.json이 배열이 아닙니다.');
    process.exit(1);
  }

  // 2. dispUrl이 없는 사진 필터링
  const needsDisplay = photoData.filter(p => !p.dispUrl);
  console.log(`총 ${photoData.length}개 사진 중 ${needsDisplay.length}개 처리 필요\n`);

  if (needsDisplay.length === 0) {
    console.log('✅ 모든 사진에 이미 display 버전이 있습니다.');
    process.exit(0);
  }

  // 3. 각 사진 처리
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < needsDisplay.length; i++) {
    const photo = needsDisplay[i];
    const index = i + 1;

    try {
      console.log(`[${index}/${needsDisplay.length}] ID ${photo.id}: ${photo.url}`);

      // Release URL에서 파일명 추출
      const filename = photo.url.split('/').pop();
      if (!filename) {
        console.warn(`  ⚠️  파일명을 추출할 수 없습니다.`);
        skipCount++;
        continue;
      }

      // 이미 disp 파일이 있는지 확인
      const dispFilename = `disp_${filename}`;
      const dispPath = path.join(PHOTO_DIR, dispFilename);
      if (fs.existsSync(dispPath)) {
        console.log(`  ℹ️  이미 존재: ${dispFilename}`);
        // 파일이 있으면 photo_data.json에 dispUrl 추가
        photo.dispUrl = `./photo/${dispFilename}`;
        skipCount++;
        continue;
      }

      // 원본 다운로드
      console.log(`  📥 다운로드 중...`);
      const imageBuffer = await downloadFile(photo.url);
      console.log(`  ✓ ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB 다운로드 완료`);

      // 리사이징
      console.log(`  🔄 1920px로 리사이징 중...`);
      const displayBuffer = await resizeToDisplay(imageBuffer, filename);
      console.log(`  ✓ ${(displayBuffer.length / 1024).toFixed(0)}KB로 압축 완료`);

      // 저장
      fs.writeFileSync(dispPath, displayBuffer);
      console.log(`  💾 저장: ${dispFilename}`);

      // photo_data.json에 dispUrl 추가
      photo.dispUrl = `./photo/${dispFilename}`;
      successCount++;

    } catch (err) {
      console.error(`  ❌ 오류: ${err.message}`);
      errorCount++;
    }

    console.log();
  }

  // 4. photo_data.json 저장
  console.log('📝 photo_data.json 업데이트 중...');
  fs.writeFileSync(PHOTO_DATA_PATH, JSON.stringify(photoData, null, 2));
  console.log('✓ 저장 완료\n');

  // 요약
  console.log('📊 처리 결과:');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ℹ️  이미 존재: ${skipCount}개`);
  console.log(`  ❌ 실패: ${errorCount}개`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
