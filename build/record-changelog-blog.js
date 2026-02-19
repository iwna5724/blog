/**
 * blog 카테고리 changelog 기록 스크립트
 * commit-msg 훅에서 호출됨
 *
 * pre-commit 훅이 .git/CHANGELOG_BLOG_PENDING 플래그를 남긴 경우에만 실행.
 * 커밋 메시지 파일(process.argv[2])을 읽어 blog 항목으로 changelog_data.json에 기록.
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'changelog', 'changelog_data.json');
const FLAG_PATH = path.join(ROOT, '.git', 'CHANGELOG_BLOG_PENDING');

async function main() {
  // 플래그 없으면 blog 변경 없음 → 종료
  if (!await fs.pathExists(FLAG_PATH)) {
    process.exit(0);
  }

  // 플래그 삭제
  await fs.remove(FLAG_PATH);

  // 커밋 메시지 파일 경로 (git이 첫 번째 인자로 전달)
  const commitMsgFile = process.argv[2];
  if (!commitMsgFile) {
    process.exit(0);
  }

  let commitMsg = '';
  try {
    commitMsg = (await fs.readFile(commitMsgFile, 'utf-8')).trim();
  } catch (e) {
    process.exit(0);
  }

  // 빈 메시지나 주석만 있는 경우 무시
  const lines = commitMsg.split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
  if (!lines) process.exit(0);

  // 첫 줄만 사용 (제목)
  const title = lines.split('\n')[0].trim();
  if (!title) process.exit(0);

  const today = new Date().toISOString().split('T')[0];

  // changelog_data.json 로드
  await fs.ensureDir(path.join(ROOT, 'changelog'));
  let changelogData = { entries: [] };
  try {
    if (await fs.pathExists(CHANGELOG_PATH)) {
      changelogData = JSON.parse(await fs.readFile(CHANGELOG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.log('⚠️  changelog_data.json 로드 실패, 새로 생성');
  }

  // 중복 체크
  const isDuplicate = changelogData.entries.some(e =>
    e.date === today &&
    e.category === 'blog' &&
    (typeof e.description === 'object' ? e.description.ko : e.description) === title
  );

  if (isDuplicate) process.exit(0);

  // 항목 추가
  changelogData.entries.push({
    id: Date.now(),
    date: today,
    category: 'blog',
    description: { ko: title, ja: '' },
  });

  // 날짜 오름차순 정렬
  changelogData.entries.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.id - b.id;
  });

  await fs.writeFile(CHANGELOG_PATH, JSON.stringify(changelogData, null, 2));
  console.log(`📋 blog 변경사항 기록: ${title}`);

  // changelog_data.json을 현재 커밋에 포함시키기 위해 staging에 추가
  // commit-msg 훅에서는 git add 후 커밋이 이미 진행 중이므로
  // amend 없이 index만 업데이트 (다음 커밋에 포함되거나, --amend로 처리)
  // 가장 안전한 방법: index 업데이트 후 커밋 메시지 파일을 그대로 두면
  // git이 staged 변경사항을 커밋에 포함함
  const { execSync } = require('child_process');
  try {
    execSync('git add changelog/changelog_data.json', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  changelog_data.json staging 실패:', e.message);
  }
}

main().catch(e => {
  console.error('❌ record-changelog-blog 실패:', e.message);
  // blog 기록 실패는 커밋을 막지 않음
  process.exit(0);
});
